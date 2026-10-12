const { app, BrowserWindow, ipcMain, dialog, protocol, shell } = require('electron');
const { basename, dirname, extname, isAbsolute, join } = require('node:path');
const { existsSync, readFileSync } = require('node:fs');
const { PassThrough, Readable } = require('node:stream');
const { mediaResponse } = require('./media-response.cjs');
const { collectVideoPaths, folderGroupName } = require('./folder.cjs');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
protocol.registerSchemesAsPrivileged([{ scheme: 'videe', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
if (!app.isPackaged && process.env.VIDEE_TEST_USER_DATA) app.setPath('userData', process.env.VIDEE_TEST_USER_DATA);
let win, registry = {}, processJob, registryFile, cacheDir, liveJob;
let writeQueue = Promise.resolve();
let mediaModule;
const media = () => (mediaModule ||= import('../src/media.mjs'));
function persist() { writeQueue = writeQueue.then(async () => { const tmp = registryFile + '.tmp'; await fs.writeFile(tmp, JSON.stringify(registry)); await fs.rename(tmp, registryFile); }); return writeQueue; }
function ffmpegBinary() { return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'); }
function ffmpegProbe(input) {
  return new Promise(resolve => {
    const child = spawn(ffmpegBinary(), ['-hide_banner', '-i', input], { windowsHide: true });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), 8000);
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-20000); });
    child.on('error', () => { clearTimeout(timer); resolve(''); });
    child.on('close', () => { clearTimeout(timer); resolve(stderr); });
  });
}
function sendProgress(payload) { if (win && !win.isDestroyed()) win.webContents.send('conversion-progress', payload); }
/** Run one ffmpeg job as the active (cancellable) task. Progress reports seconds of output written. */
function runFfmpeg(id, args, { offset = 0, total = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), ['-hide_banner', '-nostdin', '-y', ...args.slice(0, -1), '-progress', 'pipe:1', args[args.length - 1]], { windowsHide: true });
    const job = processJob?.id === id ? processJob : { id, cancelled: false };
    job.child = child; processJob = job;
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-3000); });
    child.stdout.on('data', data => { const match = String(data).match(/out_time_us=(\d+)/); if (match) sendProgress({ id, seconds: offset + Number(match[1]) / 1e6, total }); });
    child.on('error', () => reject(new Error('Could not start the conversion engine.')));
    child.on('close', code => {
      if (job.cancelled) return reject(new Error('Cancelled.'));
      if (code !== 0) return reject(Object.assign(new Error('Conversion failed. Damaged or encrypted files cannot be processed.'), { detail: stderr }));
      resolve();
    });
  });
}
async function withJob(id, task) {
  if (processJob) throw new Error('Another video task is running.');
  processJob = { id, cancelled: false };
  try { return await task(); } finally { processJob = undefined; }
}
/** Write a cached MP4 for `id` that playback uses instead of the original. */
async function runEncode(id, args, kind = 'optimized', total = 0) {
  const output = join(cacheDir, `${id}.mp4`);
  const temp = join(cacheDir, `${id}.partial.mp4`);
  try { await runFfmpeg(id, [...args, '-movflags', '+faststart', temp], { total }); }
  catch (error) { await fs.rm(temp, { force: true }).catch(() => {}); throw error; }
  try {
    await fs.rename(temp, output); registry[id].converted = output; registry[id].convertedKind = kind; delete registry[id].probe; await persist();
    const stat = await fs.stat(output);
    return { src: `videe://media/${id}?converted=${Date.now()}`, size: stat.size };
  } catch { throw new Error('Could not save the converted video. Check available storage.'); }
}

// Hardware encoders are probed once with a tiny clip; the first one that works is used.
let encoderPromise;
function testEncoder(encoder) {
  return new Promise(resolve => {
    const child = spawn(ffmpegBinary(), ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:r=30:d=0.4', '-c:v', encoder, '-f', 'null', '-'], { windowsHide: true });
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
    child.on('error', () => { clearTimeout(timer); resolve(false); });
    child.on('close', code => { clearTimeout(timer); resolve(code === 0); });
  });
}
function hardwareEncoder() {
  return (encoderPromise ||= (async () => {
    const candidates = process.platform === 'darwin' ? ['h264_videotoolbox'] : process.platform === 'win32' ? ['h264_nvenc', 'h264_qsv', 'h264_amf'] : [];
    for (const encoder of candidates) if (await testEncoder(encoder)) return encoder;
    return '';
  })());
}
async function analyze(id) {
  const entry = registry[id];
  if (!entry) throw new Error('Video not found.');
  const input = entry.converted || entry.path;
  const stat = await fs.stat(input);
  const key = `${input}|${stat.size}|${stat.mtimeMs}`;
  if (entry.probe?.key === key) return entry.probe.value;
  const { parseMediaInfo, playbackPlan } = await media();
  const info = parseMediaInfo(await ffmpegProbe(input));
  const known = !!(info.video || info.audio.length);
  const plan = known ? playbackPlan(info, { platform: process.platform }) : { mode: 'direct', reasons: [], audio: 'copy', deinterlace: false };
  const value = { info, plan, known, converted: entry.converted ? (entry.convertedKind || 'optimized') : '', size: stat.size };
  entry.probe = { key, value };
  await persist();
  return value;
}

// Live playback: ffmpeg transcodes from any position straight into the player as fragmented MP4.
function stopLive() { if (liveJob) { liveJob.stopped = true; liveJob.child?.kill('SIGKILL'); liveJob = undefined; } }
async function liveResponse(request, id, start, hardware) {
  const entry = registry[id];
  if (!entry) return new Response('Not found', { status: 404 });
  stopLive();
  const input = entry.path;
  await fs.access(input);
  const { liveArgs } = await media();
  const { value } = entry.probe || {};
  const info = value?.info || (await analyze(id)).info;
  const out = new PassThrough({ highWaterMark: 1 << 20 });
  const job = { id, stopped: false, child: undefined };
  liveJob = job;
  const run = encoder => {
    let sent = false;
    const child = spawn(ffmpegBinary(), liveArgs(input, start, info, encoder), { windowsHide: true });
    job.child = child;
    child.stdout.on('data', chunk => { sent = true; if (!out.write(chunk)) { child.stdout.pause(); out.once('drain', () => child.stdout.resume()); } });
    child.stderr.resume();
    child.on('error', () => out.destroy(new Error('Could not start the playback engine.')));
    child.on('close', code => {
      if (job.stopped) { out.destroy(); return; }
      if (code !== 0 && !sent && encoder !== 'libx264') { encoderPromise = Promise.resolve(''); run('libx264'); return; }
      out.end();
    });
  };
  run(hardware ? (await hardwareEncoder()) || 'libx264' : 'libx264');
  const stop = () => { job.stopped = true; job.child?.kill('SIGKILL'); if (liveJob === job) liveJob = undefined; };
  request.signal.addEventListener('abort', stop, { once: true });
  out.on('close', () => request.signal.removeEventListener('abort', stop));
  return new Response(Readable.toWeb(out), { status: 200, headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}
function frameArgs(input, time, filter, codec) {
  return ['-hide_banner', '-nostdin', '-loglevel', 'error', ...(time > 0 ? ['-ss', Number(time).toFixed(3)] : []), '-i', input, '-map', '0:V:0?', '-frames:v', '1', ...(filter ? ['-vf', filter] : []), '-f', 'image2pipe', '-c:v', codec, ...(codec === 'mjpeg' ? ['-q:v', '5'] : []), 'pipe:1'];
}
function grabFrame(input, time, filter, codec = 'mjpeg') {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBinary(), frameArgs(input, time, filter, codec), { windowsHide: true });
    const chunks = [];
    const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new Error('Could not read a frame.')); });
    child.on('close', code => { clearTimeout(timer); const data = Buffer.concat(chunks); if (code === 0 && data.length) resolve(data); else reject(new Error('Could not read a frame.')); });
  });
}
function exportInput(entry) { return entry.converted && entry.convertedKind === 'edited' ? entry.converted : entry.path; }
function register(channel, handler) { ipcMain.handle(channel, async (event, ...args) => { if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Unauthorized'); return handler(...args); }); }
async function importPaths(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length > 1000 || filePaths.some(file => typeof file !== 'string' || !isAbsolute(file))) throw new Error('Invalid files');
  const collected = [];
  for (const file of filePaths) {
    if (collected.length >= 1000) break;
    let stat;
    try { stat = await fs.stat(file); } catch { continue; }
    if (stat.isDirectory()) collected.push(...await collectVideoPaths(file, { maxFiles: 1000 - collected.length }));
    else if (stat.isFile()) collected.push(file);
  }
  const records = [];
  for (const file of collected.slice(0, 1000)) {
    let stat;
    try { stat = await fs.stat(file); } catch { continue; }
    if (!stat.isFile()) continue;
    const existing = Object.entries(registry).find(([,entry]) => entry.path === file);
    const id = existing?.[0] || randomUUID(); registry[id] ||= { path: file };
    records.push({ id, name: basename(file), size: stat.size, native: true, type: '', added: Date.now(), duration: 0, position: 0, favorite: false, lastPlayed: 0 });
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
const EXPORT_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'mkv', 'webm', 'ts', 'm2ts', 'mts', 'avi']);
app.whenReady().then(async () => {
  // Keep the runtime Dock icon consistent with the rounded icon embedded in the macOS app bundle.
  if (process.platform === 'darwin') app.dock?.setIcon(join(__dirname, '../dist/icons/icon-rounded.png'));
  registryFile = join(app.getPath('userData'), 'library.json'); cacheDir = join(app.getPath('userData'), 'converted');
  await fs.mkdir(cacheDir, { recursive: true });
  try { registry = JSON.parse(await fs.readFile(registryFile, 'utf8')); } catch { registry = {}; }
  protocol.handle('videe', async request => {
    const url = new URL(request.url); const id = url.pathname.slice(1); const entry = registry[id];
    if (url.hostname === 'live' && entry) {
      try { return await liveResponse(request, id, Number(url.searchParams.get('t')) || 0, url.searchParams.get('hw') !== '0'); } catch { return new Response('File unavailable', { status: 404 }); }
    }
    if (url.hostname !== 'media' || !entry) return new Response('Not found', { status: 404 });
    try { return await mediaResponse(request, entry.converted || entry.path); } catch { return new Response('File unavailable', { status: 404 }); }
  });
  register('get-gpu-status', async () => {
    const status = await app.getGPUFeatureStatus();
    return {
      videoDecode: status.video_decode || 'unknown',
      gpuCompositing: status.gpu_compositing || 'unknown',
      rasterization: status.rasterization || 'unknown',
      encoder: await hardwareEncoder() || 'libx264',
    };
  });
  register('pick-files', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Open videos', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Videos', extensions: ['mp4', 'm4v', 'mov', 'qt', 'webm', 'mkv', 'avi', 'divx', 'wmv', 'asf', 'flv', 'f4v', 'mpeg', 'mpg', 'm2ts', 'mts', 'ts', '3gp', '3g2', 'ogv', 'vob', 'mxf', 'dv', 'hevc', 'av1', 'rm', 'rmvb'] }] });
    if (result.canceled) return null;
    return importPaths(result.filePaths);
  });
  register('pick-folder', async () => {
    const result = await dialog.showOpenDialog(win, { title: 'Open folder', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const dir = result.filePaths[0];
    const records = await importPaths([dir]);
    let name = '';
    try { if ((await fs.stat(dir)).isDirectory()) name = basename(dir); } catch { /* Missing paths are skipped by importPaths. */ }
    const grouped = new Map();
    for (const record of records) {
      const filePath = registry[record.id]?.path;
      const folder = filePath ? folderGroupName(dir, filePath) : name;
      if (!grouped.has(folder)) grouped.set(folder, []);
      grouped.get(folder).push(record.id);
    }
    return { name, records, folders: [...grouped].map(([folder, ids]) => ({ name: folder, ids })) };
  });
  register('import-paths', importPaths);
  register('get-source', async id => { const entry = registry[id]; if (!entry) throw new Error('File not found. Please add it again.'); await fs.access(entry.converted || entry.path); return `videe://media/${id}`; });
  register('analyze-video', async id => analyze(id));
  register('live-source', async (id, start, hardware = true) => {
    const entry = registry[id];
    if (!entry) throw new Error('File not found. Please add it again.');
    await fs.access(entry.path);
    return `videe://live/${id}?t=${Math.max(0, Number(start) || 0).toFixed(3)}&hw=${hardware ? 1 : 0}&n=${Date.now()}`;
  });
  register('stop-live', () => stopLive());
  register('forget-video', async id => { if (processJob?.id === id) throw new Error('Cancel the conversion before removing this video.'); if (liveJob?.id === id) stopLive(); const entry = registry[id]; if (entry?.converted) await fs.rm(entry.converted, { force: true }); delete registry[id]; await persist(); });
  register('cancel-conversion', () => { if (processJob) { processJob.cancelled = true; processJob.child?.kill('SIGTERM'); } });
  register('convert-video', async id => {
    if (!registry[id]) throw new Error('Video not found.');
    stopLive();
    return withJob(id, async () => {
      await fs.access(ffmpegBinary());
      const result = await runEncode(id, ['-i', registry[id].path, '-map', '0:V:0', '-map', '0:a:0?', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-vf', 'bwdif=mode=send_frame:deint=interlaced,scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '192k']);
      return result.src;
    });
  });
  register('prepare-video', async id => {
    const entry = registry[id];
    if (!entry) throw new Error('Video not found.');
    const { value } = entry.probe || {};
    const { info, plan } = value || await analyze(id);
    const { remuxArgs } = await media();
    return withJob(id, () => runEncode(id, remuxArgs(entry.path, plan, info), 'optimized', info.duration));
  });
  register('use-original', async id => {
    const entry = registry[id];
    if (!entry?.converted) return;
    if (processJob?.id === id) throw new Error('Wait for the current task to finish.');
    await fs.rm(entry.converted, { force: true });
    delete entry.converted; delete entry.convertedKind; delete entry.probe; await persist();
  });
  register('thumbnail', async id => {
    const entry = registry[id];
    if (!entry) throw new Error('Video not found.');
    const input = entry.converted || entry.path;
    const { info } = await analyze(id);
    if (!info.video) throw new Error('No video stream.');
    const time = info.duration > 0 ? Math.min(1, info.duration / 10) : 0;
    const data = await grabFrame(input, time, 'scale=640:640:force_original_aspect_ratio=decrease');
    return { thumbnail: `data:image/jpeg;base64,${data.toString('base64')}`, duration: info.duration };
  });
  register('filmstrip', async (id, count = 16) => {
    const entry = registry[id];
    if (!entry) throw new Error('Video not found.');
    const input = entry.converted || entry.path;
    const { info } = await analyze(id);
    const frames = Math.max(1, Math.min(48, Math.round(count)));
    if (!info.video || !info.duration) return [];
    const results = new Array(frames).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < frames) {
        const index = next++;
        const time = (index + 0.5) * info.duration / frames;
        try { results[index] = `data:image/jpeg;base64,${(await grabFrame(input, time, 'scale=-2:90')).toString('base64')}`; } catch { results[index] = null; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    return results;
  });
  register('snapshot', async (id, time) => {
    const entry = registry[id];
    if (!entry) throw new Error('Video not found.');
    const input = entry.converted || entry.path;
    const data = await grabFrame(input, Math.max(0, Number(time) || 0), '', 'png');
    const { timecode } = await media();
    const stamp = timecode(time, 100).slice(0, 8).replace(/:/g, '-');
    const base = basename(entry.path, extname(entry.path));
    const result = await dialog.showSaveDialog(win, { title: 'Save frame', defaultPath: join(app.getPath('pictures'), `${base} ${stamp}.png`), filters: [{ name: 'PNG image', extensions: ['png'] }] });
    if (result.canceled || !result.filePath) return null;
    await fs.writeFile(result.filePath, data);
    return result.filePath;
  });
  register('export-video', async (id, options) => {
    const entry = registry[id];
    if (!entry) throw new Error('Video not found.');
    if (!options || typeof options !== 'object') throw new Error('Invalid export settings.');
    const input = exportInput(entry);
    await fs.access(ffmpegBinary());
    await fs.access(input);
    const lib = await media();
    const info = lib.parseMediaInfo(await ffmpegProbe(input));
    const duration = info.duration || Number(options.duration) || 0;
    const segments = lib.normalizeSegments(Array.isArray(options.segments) ? options.segments : [], duration);
    const keep = segments.length ? segments : [{ start: 0, end: duration }];
    const total = keep.reduce((sum, part) => sum + part.end - part.start, 0);
    if (!(total >= 0.25)) throw new Error('Keep at least 0.25 seconds of video.');
    const sourceExt = extname(entry.path).slice(1).toLowerCase();
    const apply = options.destination === 'apply';
    const copy = options.mode === 'copy' && (!apply || ['mp4', 'mov', 'm4v'].includes(sourceExt));
    const ext = copy && !apply && EXPORT_EXTENSIONS.has(sourceExt) ? sourceExt : 'mp4';
    let output;
    if (apply) output = join(cacheDir, `${id}.edited-${Date.now()}.${ext}`);
    else {
      const base = basename(entry.path, extname(entry.path));
      const result = await dialog.showSaveDialog(win, { title: 'Export video', defaultPath: join(dirname(entry.path), `${base} (edited).${ext}`), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      if (result.canceled || !result.filePath) return null;
      output = result.filePath;
    }
    if (output === entry.path) throw new Error('Choose a different file name. The original stays untouched.');
    stopLive();
    const temp = join(dirname(output), `.videe-${randomUUID()}.partial.${ext}`);
    const work = join(cacheDir, `export-${randomUUID()}`);
    try {
      await withJob(id, async () => {
        if (copy) {
          await fs.mkdir(work, { recursive: true });
          const parts = [];
          let offset = 0;
          for (const [index, part] of keep.entries()) {
            const file = join(work, `part-${index}.${ext}`);
            const args = lib.exportCopySegmentArgs(input, part, file, options.audio !== false).slice(3);
            await runFfmpeg(id, args, { offset, total });
            parts.push(file);
            offset += part.end - part.start;
          }
          if (parts.length === 1) await fs.rename(parts[0], temp);
          else {
            const list = join(work, 'list.txt');
            await fs.writeFile(list, lib.concatList(parts));
            await runFfmpeg(id, ['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', ...(ext === 'mp4' || ext === 'mov' || ext === 'm4v' ? ['-movflags', '+faststart'] : []), temp], { offset: total, total });
          }
        } else {
          const encoder = options.hardware ? await hardwareEncoder() : '';
          const args = lib.exportEncodeArgs({ ...options, segments: keep, encoder: options.codec === 'hevc' ? '' : encoder }, { duration, hasAudio: info.audio.length > 0 });
          await runFfmpeg(id, ['-i', input, ...args, '-movflags', '+faststart', temp], { total });
        }
      });
      await fs.rename(temp, output);
    } catch (error) {
      await fs.rm(temp, { force: true }).catch(() => {});
      throw new Error(error instanceof Error && error.message === 'Cancelled.' ? 'Export cancelled.' : 'Export failed. Try re-encoding instead of a lossless copy.');
    } finally {
      await fs.rm(work, { recursive: true, force: true }).catch(() => {});
    }
    const stat = await fs.stat(output);
    if (apply) {
      const previous = entry.converted;
      entry.converted = output; entry.convertedKind = 'edited'; delete entry.probe; await persist();
      if (previous && previous !== output) await fs.rm(previous, { force: true }).catch(() => {});
      return { src: `videe://media/${id}?edited=${Date.now()}`, size: stat.size, path: '' };
    }
    const records = options.addToLibrary ? await importPaths([output]) : [];
    return { path: output, size: stat.size, record: records[0] || null };
  });
  register('reveal-file', async file => { if (typeof file === 'string' && isAbsolute(file)) shell.showItemInFolder(file); });
  register('reveal-video', async id => { const entry = registry[id]; if (entry?.path) shell.showItemInFolder(entry.path); });
  register('cache-info', async () => {
    let bytes = 0;
    for (const entry of Object.values(registry)) if (entry.converted && entry.convertedKind !== 'edited') { try { bytes += (await fs.stat(entry.converted)).size; } catch { /* Already removed. */ } }
    return { bytes };
  });
  register('clear-cache', async () => {
    let freed = 0;
    for (const [id, entry] of Object.entries(registry)) {
      if (!entry.converted || entry.convertedKind === 'edited' || processJob?.id === id) continue;
      try { freed += (await fs.stat(entry.converted)).size; } catch { /* Already removed. */ }
      await fs.rm(entry.converted, { force: true });
      delete entry.converted; delete entry.convertedKind; delete entry.probe;
    }
    await persist();
    return { freed };
  });
  register('list-subtitles', async id => {
    const entry = registry[id];
    if (!entry) throw new Error('Video not found.');
    const input = entry.path || entry.converted;
    await fs.access(input);
    const { parseSubtitleStreams } = await media();
    return parseSubtitleStreams(await ffmpegProbe(input));
  });
  register('extract-subtitle', async (id, index) => {
    const entry = registry[id];
    if (!entry) throw new Error('Video not found.');
    if (!Number.isInteger(index) || index < 0 || index > 31) throw new Error('Subtitle track not found.');
    const input = entry.path || entry.converted;
    await fs.access(ffmpegBinary());
    await fs.access(input);
    const { parseSubtitleStreams, toVtt } = await media();
    const tracks = parseSubtitleStreams(await ffmpegProbe(input));
    if (!tracks.some(track => track.index === index)) throw new Error('Subtitle track not found.');
    const text = await new Promise((resolve, reject) => {
      const child = spawn(ffmpegBinary(), ['-hide_banner', '-nostdin', '-i', input, '-map', `0:s:${index}`, '-f', 'webvtt', 'pipe:1'], { windowsHide: true });
      const chunks = [];
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), 20000);
      child.stdout.on('data', data => { chunks.push(data); if (chunks.reduce((sum, chunk) => sum + chunk.length, 0) > 5 * 1024 * 1024) child.kill('SIGTERM'); });
      child.stderr.on('data', data => { stderr = (stderr + data).slice(-3000); });
      child.on('error', () => { clearTimeout(timer); reject(new Error('Could not read embedded subtitles.')); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error('Could not read embedded subtitles.'));
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    if (!text.trim()) throw new Error('Could not read embedded subtitles.');
    return toVtt(text);
  });
  createWindow();
  // Warm up hardware encoder detection so the first live playback starts immediately.
  setTimeout(() => { void hardwareEncoder(); }, 1500);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { processJob?.child?.kill('SIGTERM'); stopLive(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
