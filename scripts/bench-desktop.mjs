// Loading-speed benchmark for the desktop app: `npm run build`, then `xvfb-run -a npm run bench:desktop`
// (no xvfb needed on Mac/Windows). Prints milliseconds for: cold start to a usable window, folder import,
// all previews ready, warm start with a full library, the embedded-subtitle lookup, and time to first frame
// for videos that were already probed and for a file opened for the first time.
// Pass a file count to also time a big folder import, e.g. `npm run bench:desktop -- 1000`.
import { _electron as electron } from '@playwright/test';
import ffmpeg from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';
import { copyFile, link, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const bigCount = Number(process.argv[2] || 0);
const work = await mkdtemp(join(tmpdir(), 'videe-bench-'));
const ms = start => Math.round(performance.now() - start);
const make = (file, args) => execFileSync(ffmpeg, ['-v', 'error', '-y', ...args, file]);

// 20 × 1080p H.264 MP4 (direct), 15 × the same in MKV (repackaged), 5 × HEVC (live conversion on Linux).
const src = join(work, 'src'), lib = join(work, 'library');
await mkdir(src); await mkdir(join(lib, 'mp4'), { recursive: true }); await mkdir(join(lib, 'mkv'));
make(join(src, 'a.mp4'), ['-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=60', '-f', 'lavfi', '-i', 'sine=d=60', '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '8M', '-g', '60', '-c:a', 'aac']);
make(join(src, 'b.mkv'), ['-i', join(src, 'a.mp4'), '-c', 'copy']);
make(join(src, 'c.mkv'), ['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=30', '-c:v', 'libx265', '-preset', 'ultrafast', '-x265-params', 'log-level=error']);
const pad = n => String(n).padStart(2, '0');
for (let i = 1; i <= 20; i++) await copyFile(join(src, 'a.mp4'), join(lib, 'mp4', `clip${pad(i)}.mp4`));
for (let i = 1; i <= 15; i++) await copyFile(join(src, 'b.mkv'), join(lib, 'mkv', `movie${pad(i)}.mkv`));
for (let i = 1; i <= 5; i++) await copyFile(join(src, 'c.mkv'), join(lib, `hevc${i}.mkv`));
const libraryCount = 40;

async function launch(userData) {
  const start = performance.now();
  const app = await electron.launch({ args: ['.'], env: { ...process.env, VIDEE_TEST_USER_DATA: userData, VIDEE_LANG: 'en' } });
  const page = await app.firstWindow();
  await page.waitForFunction(() => document.querySelector('.header-open') && !document.querySelector('.header-open').disabled);
  return { app, page, startup: ms(start) };
}
async function importFolder(app, page, dir) {
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, dir);
  const start = performance.now();
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.video-open').length > 0 && !document.querySelector('.header-open')?.disabled, null, { timeout: 120000 });
  return ms(start);
}
const libraryRows = page => page.evaluate(() => new Promise(done => {
  const open = indexedDB.open('videe-library');
  open.onsuccess = () => { const rows = open.result.transaction('videos').objectStore('videos').getAll(); rows.onsuccess = () => { done(rows.result.map(row => ({ id: row.id, ready: !!row.thumbnail && row.duration > 0 }))); open.result.close(); }; };
}));
async function firstFrame(page, name) {
  await page.getByRole('searchbox', { name: 'Search videos' }).fill(name.replace(/\.[^.]+$/, ''));
  const start = performance.now();
  await page.getByRole('button', { name: `Play ${name}`, exact: true }).click();
  await page.waitForFunction(() => { const v = document.querySelector('.player-view video'); return v && v.readyState >= 2 && v.videoWidth > 0; }, null, { timeout: 60000 });
  const time = ms(start);
  await page.evaluate(() => document.querySelector('.player-view video')?.pause());
  await page.getByRole('button', { name: 'Back to library', exact: true }).click();
  return time;
}

const results = {};
try {
  const userData = join(work, 'user-data');
  let { app, page, startup } = await launch(userData);
  results.coldStart = startup;
  results.folderImport = await importFolder(app, page, lib);
  let start = performance.now();
  for (;;) { const rows = await libraryRows(page); if (rows.length >= libraryCount && rows.every(row => row.ready)) break; await page.waitForTimeout(100); }
  results.allPreviews = ms(start);
  results.previewPerVideo = Math.round(results.allPreviews / libraryCount);
  await app.close();

  ({ app, page, startup } = await launch(userData));
  results.warmStart = startup;
  results.subtitleLookup = await page.evaluate(async ids => {
    const begin = performance.now();
    for (const id of ids) await window.videe.listSubtitles(id);
    return Math.round((performance.now() - begin) / ids.length);
  }, (await libraryRows(page)).slice(0, 10).map(row => row.id));
  await page.locator('.library-sidebar').getByRole('button', { name: /^All videos/ }).first().click();
  results.firstFrameMp4 = await firstFrame(page, 'clip07.mp4');
  results.firstFrameMkv = await firstFrame(page, 'movie07.mkv');
  results.firstFrameHevc = await firstFrame(page, 'hevc3.mkv');
  // Files opened for the first time have not been probed yet.
  for (const [key, file] of [['firstFrameNewMp4', 'a.mp4'], ['firstFrameNewMkv', 'b.mkv']]) {
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, join(src, file));
    await page.getByRole('button', { name: 'Open video', exact: true }).click();
    results[key] = await firstFrame(page, file);
  }
  await app.close();

  if (bigCount > 0) {
    const big = join(work, 'big');
    await mkdir(big);
    for (let i = 1; i <= bigCount; i++) await link(join(src, 'c.mkv'), join(big, `v${String(i).padStart(4, '0')}.mkv`)).catch(() => copyFile(join(src, 'c.mkv'), join(big, `v${i}.mkv`)));
    ({ app, page } = await launch(join(work, 'user-data-big')));
    results[`folderImport${bigCount}`] = await importFolder(app, page, big);
    await app.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await rm(work, { recursive: true, force: true });
}
