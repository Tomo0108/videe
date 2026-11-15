// Captures the quick guide screenshots and the callout positions drawn over them.
// Usage: npm run dev, then `npm run guide:build -- <folder of sample videos>`.
// Writes src/guide/*.webp and src/guide/shots.json (callouts in percent of each image).
import { chromium } from 'playwright';
import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const URL = process.env.VIDEE_URL || 'http://127.0.0.1:5173';
const media = resolve(process.argv[2] || 'tests/fixtures');
const videos = readdirSync(media).filter(name => /\.(mp4|webm|mov)$/i.test(name)).sort().map(name => join(media, name));
if (!videos.length) { console.error(`No sample videos in ${media}`); process.exit(1); }
const out = 'src/guide';
const tmp = mkdtempSync(join(tmpdir(), 'videe-guide-'));
const SCALE = 1.5;
const shots = {};

const browser = await chromium.launch();
async function newPage({ width = 1280, height = 800, desktop = false, prefs = { theme: 'light', layout: 'list', autoplay: false } } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: SCALE, colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(value => localStorage.setItem('videe-preferences', value), JSON.stringify(prefs));
  if (desktop) await page.addInitScript(() => {
    // Just enough of the Windows desktop bridge to show its settings rows.
    const status = { videoDecode: 'enabled', gpuCompositing: 'enabled', rasterization: 'enabled', encoder: 'h264_nvenc' };
    const known = { platform: 'win32', getGpuStatus: async () => status, cacheInfo: async () => ({ bytes: 1.4 * 1024 ** 3 }), onConversionProgress: () => () => {}, onOpenFiles: () => () => {}, takeOpenedFiles: async () => [] };
    window.videe = new Proxy(known, { get: (target, key) => key in target ? target[key] : async () => null });
  });
  await page.goto(URL);
  await page.waitForSelector('.app-header');
  return page;
}
/** Screenshot `clip` (or the viewport) and record each selector's box relative to it. */
async function capture(page, name, marks, clip) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  const area = clip || { x: 0, y: 0, ...page.viewportSize() };
  const rects = {};
  for (const [key, spec] of Object.entries(marks)) {
    const [selector, badge] = Array.isArray(spec) ? spec : [spec];
    const boxes = [];
    for (const handle of await page.locator(selector).all()) { const box = await handle.boundingBox(); if (box && box.width && box.height) boxes.push(box); }
    if (!boxes.length) throw new Error(`${name}: nothing matches ${key} (${selector})`);
    const pad = 6;
    const x1 = Math.max(area.x, Math.min(...boxes.map(b => b.x)) - pad), y1 = Math.max(area.y, Math.min(...boxes.map(b => b.y)) - pad);
    const x2 = Math.min(area.x + area.width, Math.max(...boxes.map(b => b.x + b.width)) + pad), y2 = Math.min(area.y + area.height, Math.max(...boxes.map(b => b.y + b.height)) + pad);
    const pct = (v, total) => Math.round(v / total * 10000) / 100;
    rects[key] = [pct(x1 - area.x, area.width), pct(y1 - area.y, area.height), pct(x2 - x1, area.width), pct(y2 - y1, area.height), ...(badge ? [badge] : [])];
  }
  const png = join(tmp, `${name}.png`);
  await page.screenshot({ path: png, clip });
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6', join(out, `${name}.webp`)], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Could not encode ${name}.webp`);
  shots[name] = { width: Math.round(area.width * SCALE), height: Math.round(area.height * SCALE), marks: rects };
  console.log(`${name}: ${Object.keys(rects).join(', ')}`);
}

// 1. Empty library.
let page = await newPage();
await page.waitForSelector('.no-results h2');
await capture(page, 'start', { openVideo: '.header-open-video', openFolder: '.header-open', drop: '.no-results' });

// 2. Library with folders, a playlist and a favorite.
await page.locator('input.file-input').setInputFiles(videos);
// Importing opens the first video; return to a clean library.
await page.getByRole('button', { name: 'Back to library', exact: true }).click();
await page.getByRole('button', { name: 'Close player', exact: true }).click();
await page.waitForFunction(count => document.querySelectorAll('.video-card').length >= count, videos.length);
await page.waitForFunction(() => [...document.querySelectorAll('.video-card img')].every(img => img.complete && img.naturalWidth > 0) && document.querySelectorAll('.video-card img').length > 0, null, { timeout: 120000 }).catch(() => {});
const names = videos.map(file => file.split(/[\\/]/).pop());
const make = async (button, title, picks) => {
  for (const pick of picks) await page.getByLabel(`Select ${pick}`, { exact: true }).check({ force: true });
  await page.getByRole('button', { name: button }).first().click();
  await page.locator('dialog.modal input').fill(title);
  await page.locator('dialog.modal input').press('Enter');
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  await page.locator('.library-sidebar nav button').first().click();
};
await make('Create folder', 'Travel', names.slice(0, 2));
await make('Create playlist', 'Weekend picks', names.slice(2, 4));
await page.getByLabel(`Add ${names[names.length - 1]} to favorites`, { exact: true }).click({ force: true });
await page.waitForTimeout(800);
await capture(page, 'library', { nav: '.library-sidebar nav', collections: '.library-sidebar .sidebar-section', search: '.search-box', layout: '.layout-switch', row: '.video-list .video-card >> nth=0' });

// 3. Player, paused partway with the controls showing.
await page.getByLabel(`Play ${names.find(name => /ocean/i.test(name)) || names[0]}`, { exact: true }).click();
await page.waitForFunction(() => (document.querySelector('.player-view video')?.readyState || 0) >= 2);
await page.evaluate(() => { const video = document.querySelector('.player-view video'); video.pause(); video.currentTime = video.duration * 0.38; });
await page.waitForTimeout(600);
await page.mouse.move(640, 420);
await capture(page, 'player', { back: '[aria-label="Back to library"]', seek: ['.seek-bar', 'right'], transport: '.transport', options: '.playback-options [aria-label="Playback speed"], .playback-options [aria-label="Save frame"]', fullscreen: ['.player-controls [aria-label="Full screen"]', 'right'] });

// 4. Editor with one cut.
await page.getByRole('button', { name: 'Edit video' }).click();
await page.waitForSelector('[aria-label="Timeline"]');
await page.waitForTimeout(800);
await capture(page, 'editor', { toggle: '.app-header [aria-label="Close editor"]', timeline: '[aria-label="Timeline"]', export: '.editor-export' });
await page.close();

// 5. Settings as they appear in the Windows app.
page = await newPage({ height: 1500, desktop: true, prefs: { theme: 'light' } });
await page.getByRole('button', { name: 'Settings' }).click();
await page.waitForSelector('section[aria-label="Video diagnostics"] .diagnostic-details');
const dialog = await page.locator('dialog.modal').boundingBox();
const diagnostics = await page.locator('section[aria-label="Video diagnostics"]').boundingBox();
await capture(page, 'settings', {
  appearance: '.setting-row:has([aria-label="Appearance"])', resume: '.setting-row:has([aria-label="Resume playback"])', smooth: '.setting-row:has([aria-label="Smooth playback"])', hardware: '.setting-row:has([aria-label="Hardware acceleration"])', diagnostics: 'section[aria-label="Video diagnostics"] .settings-group',
}, { x: dialog.x, y: dialog.y, width: dialog.width, height: diagnostics.y + diagnostics.height + 16 - dialog.y });

await browser.close();
writeFileSync(join(out, 'shots.json'), JSON.stringify(shots, null, 2) + '\n');
rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote ${out}/shots.json`);
