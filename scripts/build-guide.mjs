// Captures the quick guide screenshots (Windows and Mac editions, Japanese and English UI) and the callout positions drawn over them.
// Usage: npm run dev, then `npm run guide:build`. Sample videos are plain two-color gradients made here.
// Writes src/guide/<scene>-<win|mac>-<ja|en>.webp and src/guide/shots.json (callouts in percent of each image).
import { chromium } from 'playwright';
import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { translate } from '../src/i18n.mjs';

const URL = process.env.VIDEE_URL || 'http://127.0.0.1:5173';
const out = 'src/guide';
const tmp = mkdtempSync(join(tmpdir(), 'videe-guide-'));
// Name (English, Japanese), seconds, and the two colors of a slow, soft gradient.
const SAMPLES = [['Morning walk', '朝の散歩', 192, '0x8ec5fc', '0xe0c3fc'], ['Family trip', '家族旅行', 105, '0xffd194', '0xd1913c'], ['Weekend vlog', '週末の Vlog', 58, '0xa1c4fd', '0xc2e9fb'], ['Ocean lights', '海の光', 260, '0x2b5876', '0x4e4376'], ['Sunset timelapse', '夕焼けのタイムラプス', 126, '0xf6d365', '0xfda085'], ['Forest trail', '森の小道', 42, '0x96e6a1', '0xd4fc79']];
const SAMPLE_FILES = {};
for (const [language, column] of [['en', 0], ['ja', 1]]) {
  mkdirSync(join(tmp, language));
  SAMPLE_FILES[language] = SAMPLES.map(sample => {
    const [name, seconds, from, to] = [sample[column], sample[2], sample[3], sample[4]];
    const file = join(tmp, language, `${name}.mp4`);
    const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `gradients=size=960x540:rate=6:n=2:c0=${from}:c1=${to}:speed=0.004:type=linear`, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(seconds), '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', file], { stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`Could not make ${name}`);
    return file;
  });
}
// The playing sample in the player shot: "Ocean lights" in either language.
const OCEAN = 3;
const SCALE = 1.5;
const shots = {};

const browser = await chromium.launch();
let lang = 'ja';
/** A control's label as the app shows it in the language being captured. */
const L = (text, vars) => translate(text, vars, lang);
async function newPage(os, { width = 1280, height = 800, desktop = false, prefs = { theme: 'light', layout: 'list', autoplay: false } } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: SCALE, colorScheme: 'light', reducedMotion: 'reduce' });
  await page.addInitScript(value => localStorage.setItem('videe-preferences', value), JSON.stringify(prefs));
  if (desktop) await page.addInitScript(platform => {
    // Just enough of the desktop bridge to show its settings rows.
    const status = { videoDecode: 'enabled', gpuCompositing: 'enabled', rasterization: 'enabled', encoder: platform === 'darwin' ? 'h264_videotoolbox' : 'h264_nvenc' };
    const known = { platform, getGpuStatus: async () => status, cacheInfo: async () => ({ bytes: 1.4 * 1024 ** 3 }), onConversionProgress: () => () => {}, onOpenFiles: () => () => {}, takeOpenedFiles: async () => [] };
    window.videe = new Proxy(known, { get: (target, key) => key in target ? target[key] : async () => null });
  }, os === 'mac' ? 'darwin' : 'win32');
  page.os = os;
  await page.goto(`${URL}/?lang=${lang}`);
  await page.waitForSelector('.app-header');
  return page;
}
/** Screenshot `clip` (or the viewport) and record each selector's box relative to it. */
async function capture(page, scene, marks, clip) {
  const name = `${scene}-${page.os}-${lang}`;
  // The Mac app draws its window buttons over the header; show them so the shot matches.
  if (page.os === 'mac' && !clip) await page.evaluate(() => {
    document.querySelector('.app-shell')?.classList.add('native-mac');
    if (document.getElementById('guide-window-buttons')) return;
    const dots = document.createElement('div'); dots.id = 'guide-window-buttons';
    dots.style.cssText = 'position:fixed;left:22px;top:29px;display:flex;gap:8px;z-index:99;pointer-events:none';
    for (const color of ['#ff5f57', '#febc2e', '#28c840']) { const dot = document.createElement('span'); dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${color};box-shadow:inset 0 0 0 .5px #0002`; dots.append(dot); }
    document.body.append(dots);
  });
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

async function edition(os) {
const videos = SAMPLE_FILES[lang];
// 1. Empty library.
let page = await newPage(os);
await page.waitForSelector('.no-results h2');
await capture(page, 'start', { openVideo: '.header-open-video', openFolder: '.header-open', drop: '.no-results' });

// 2. Library with folders, a playlist and a favorite.
// Passed as data: Chromium drops file paths with Japanese names in some locales.
await page.locator('input.file-input').setInputFiles(videos.map(file => ({ name: basename(file), mimeType: 'video/mp4', buffer: readFileSync(file) })));
// Importing opens the first video; return to a clean library.
await page.getByRole('button', { name: L('Back to library'), exact: true }).click();
await page.getByRole('button', { name: L('Close player'), exact: true }).click();
await page.waitForFunction(count => document.querySelectorAll('.video-card').length >= count, videos.length);
await page.waitForFunction(() => [...document.querySelectorAll('.video-card img')].every(img => img.complete && img.naturalWidth > 0) && document.querySelectorAll('.video-card img').length > 0, null, { timeout: 120000 }).catch(() => {});
const names = videos.map(file => file.split(/[\\/]/).pop());
const make = async (button, title, picks) => {
  for (const pick of picks) await page.getByLabel(L('Select {name}', { name: pick }), { exact: true }).check({ force: true });
  await page.getByRole('button', { name: L(button) }).first().click();
  await page.locator('dialog.modal input').fill(title);
  await page.locator('dialog.modal input').press('Enter');
  await page.waitForSelector('dialog.modal', { state: 'detached' });
  await page.locator('.library-sidebar nav button').first().click();
};
await make('Create folder', lang === 'ja' ? '旅行' : 'Travel', names.slice(0, 2));
await make('Create playlist', lang === 'ja' ? '週末のおすすめ' : 'Weekend picks', names.slice(2, 4));
await page.getByLabel(L('Add {name} to favorites', { name: names[names.length - 1] }), { exact: true }).click({ force: true });
await page.waitForTimeout(800);
await capture(page, 'library', { nav: '.library-sidebar nav', collections: '.library-sidebar .sidebar-section', search: '.search-box', layout: '.layout-switch', row: '.video-list .video-card >> nth=0' });

// 3. Player, paused partway with the controls showing.
await page.getByLabel(L('Play {name}', { name: names[OCEAN] }), { exact: true }).click();
await page.waitForFunction(() => (document.querySelector('.player-view video')?.readyState || 0) >= 2);
await page.evaluate(() => { const video = document.querySelector('.player-view video'); video.pause(); video.currentTime = video.duration * 0.38; });
await page.waitForTimeout(600);
await page.mouse.move(640, 420);
await capture(page, 'player', { back: `[aria-label="${L('Back to library')}"]`, seek: ['.seek-bar', 'right'], transport: '.transport', options: `.playback-options [aria-label="${L('Playback speed')}"], .playback-options [aria-label="${L('Save frame')}"]`, fullscreen: [`.player-controls [aria-label="${L('Full screen')}"]`, 'right'] });

// 4. Editor with one cut.
await page.getByRole('button', { name: L('Edit video') }).click();
await page.waitForSelector(`[aria-label="${L('Timeline')}"]`);
await page.waitForTimeout(800);
await capture(page, 'editor', { toggle: `.app-header [aria-label="${L('Close editor')}"]`, timeline: `[aria-label="${L('Timeline')}"]`, export: '.editor-export' });
await page.close();

// 5. Settings as they appear in the desktop app.
page = await newPage(os, { height: 1500, desktop: true, prefs: { theme: 'light' } });
await page.getByRole('button', { name: L('Settings'), exact: true }).click();
const diagnosticsSection = `section[aria-label="${L('Video diagnostics')}"]`;
await page.waitForSelector(`${diagnosticsSection} .diagnostic-details`);
const dialog = await page.locator('dialog.modal').boundingBox();
const diagnostics = await page.locator(diagnosticsSection).boundingBox();
await capture(page, 'settings', {
  appearance: `.setting-row:has([aria-label="${L('Language')}"]), .setting-row:has([aria-label="${L('Appearance')}"])`, resume: `.setting-row:has([aria-label="${L('Resume playback')}"])`, smooth: `.setting-row:has([aria-label="${L('Smooth playback')}"])`, hardware: `.setting-row:has([aria-label="${L('Hardware acceleration')}"])`, diagnostics: `${diagnosticsSection} .settings-group`,
}, { x: dialog.x, y: dialog.y, width: dialog.width, height: diagnostics.y + diagnostics.height + 16 - dialog.y });
await page.close();
}
for (lang of ['ja', 'en']) {
  await edition('win');
  await edition('mac');
}

await browser.close();
writeFileSync(join(out, 'shots.json'), JSON.stringify(shots, null, 2) + '\n');
rmSync(tmp, { recursive: true, force: true });
console.log(`Wrote ${out}/shots.json`);
