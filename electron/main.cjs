const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const { join } = require('node:path');
const { existsSync, readFileSync } = require('node:fs');
const { mediaResponse } = require('./media-response.cjs');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
protocol.registerSchemesAsPrivileged([{ scheme: 'videe', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
if (!app.isPackaged && process.env.VIDEE_TEST_USER_DATA) app.setPath('userData', process.env.VIDEE_TEST_USER_DATA);
let win, registry = {}, processJob, registryFile, cacheDir;
let writeQueue = Promise.resolve();
function persist() { writeQueue = writeQueue.then(async () => { const tmp = registryFile + '.tmp'; await fs.writeFile(tmp, JSON.stringify(registry)); await fs.rename(tmp, registryFile); }); return writeQueue; }
function register(channel, handler) { ipcMain.handle(channel, async (event, ...args) => { if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unauthorized'); return handler(...args); }); }
async function importPaths(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length > 1000 || filePaths.some(file => typeof file !== 'string' || !require('node:path').isAbsolute(file))) throw new Error('Invalid files');
    const records = [];
    for (const file of filePaths) {
      const stat = await fs.stat(file); if (!stat.isFile()) continue;
      const existing = Object.entries(registry).find(([,entry]) => entry.path === file);
      const id = existing?.[0] || randomUUID(); registry[id] ||= { path: file };
      records.push({ id, name: require('node:path').basename(file), size: stat.size, native: true, type: '', added: Date.now(), duration: 0, position: 0, favorite: false, lastPlayed: 0 });
    }
    await persist(); return records;
}
function createWindow() {
  win = new BrowserWindow({ ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 25 } } : {}), width: 1440, height: 940, minWidth: 800, minHeight: 640, title: 'Videe', backgroundColor: '#fafafa', icon: join(__dirname, '../dist/icon.png'), webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  if (process.argv.includes('--dev')) win.loadURL('http://127.0.0.1:5173'); else win.loadFile(playerHtml());
}
function playerHtml() {
  const dist = join(__dirname, '../dist');
  for (const name of ['app.html', 'index.html']) {
    const file = join(dist, name);
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    if (html.includes('/src/main.tsx') || /assets\/main-/.test(html)) return file;
  }
  return join(dist, 'index.html');
}
app.whenReady().then(async () => {
  if (process.platform === 'darwin') app.dock?.setIcon(join(__dirname, '../dist/icon.png'));
  registryFile = join(app.getPath('userData'), 'library.json'); cacheDir = join(app.getPath('userData'), 'converted');
  await fs.mkdir(cacheDir, { recursive: true });
  try { registry = JSON.parse(await fs.readFile(registryFile, 'utf8')); } catch { registry = {}; }
  protocol.handle('videe', async request => {
    const url = new URL(request.url); const id = url.pathname.slice(1); const entry = registry[id];
    if (url.hostname !== 'media' || !entry) return new Response('Not found', { status: 404 });
    try { return await mediaResponse(request, entry.converted || entry.path); } catch { return new Response('File unavailable', { status: 404 }); }
  });
  register('pick-videos', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Add videos', properties: ['openFile','multiSelections'], filters: [{ name: 'Videos', extensions: ['mp4','m4v','mov','webm','mkv','avi','wmv','flv','mpeg','mpg','m2ts','mts','ts','3gp','ogv','vob','mxf','hevc','av1'] }, { name: 'All files', extensions: ['*'] }] });
    if (result.canceled) return [];
    return importPaths(result.filePaths);
  });
  register('import-paths', importPaths);
  register('get-source', async id => { const entry = registry[id]; if (!entry) throw new Error('File not found. Please add it again.'); await fs.access(entry.converted || entry.path); return `videe://media/${id}`; });
  register('forget-video', async id => { if (processJob?.id === id) throw new Error('Cancel the conversion before removing this video.'); const entry = registry[id]; if (entry?.converted) await fs.rm(entry.converted, { force: true }); delete registry[id]; await persist(); });
  register('cancel-conversion', () => { if (processJob) { processJob.cancelled = true; processJob.child.kill('SIGTERM'); } });
  register('convert-video', async id => {
    if (!registry[id]) throw new Error('Video not found.');
    if (processJob) throw new Error('Another video is being converted.');
    const binary = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
    const output = join(cacheDir, `${id}.mp4`); const temp = join(cacheDir, `${id}.partial.mp4`);
    await fs.access(binary);
    return new Promise((resolve,reject) => {
      const child = spawn(binary, ['-hide_banner','-nostdin','-y','-i',registry[id].path,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:a','aac','-b:a','192k','-movflags','+faststart','-progress','pipe:1',temp], { windowsHide: true });
      const job = { id, child, cancelled: false }; processJob = job; let stderr = '';
      child.stderr.on('data', data => { stderr = (stderr + data).slice(-3000); });
      child.stdout.on('data', data => { const match = String(data).match(/out_time_us=(\d+)/); if (match && win && !win.isDestroyed()) win.webContents.send('conversion-progress', { id, seconds: Number(match[1]) / 1e6 }); });
      child.on('error', async () => { processJob = undefined; await fs.rm(temp,{ force:true }).catch(()=>{}); reject(new Error('Could not start the conversion engine.')); });
      child.on('close', async code => {
        processJob = undefined;
        try {
          if (code !== 0 || job.cancelled) { await fs.rm(temp, { force:true }); return reject(new Error(job.cancelled ? 'Conversion cancelled.' : 'Conversion failed. Damaged or encrypted files cannot be played.')); }
          await fs.rename(temp, output); registry[id].converted = output; await persist(); resolve(`videe://media/${id}?converted=${Date.now()}`);
        } catch { reject(new Error('Could not save the converted video. Check available storage.')); }
      });
    });
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { processJob?.child.kill('SIGTERM'); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
