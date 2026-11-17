import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
// The built-in mpv engine plays files the page can't (MPEG-2 in MKV with AC-3 here, an old AVI) as they are:
// no conversion, nothing written to disk, and the player's own controls drive it.
// Runs on Linux with the system libmpv (VIDEE_MPV=1); on Windows the bundled libmpv is used.
const userData = await mkdtemp(join(tmpdir(), 'videe-mpv-test-'));
const mkv = join(userData, 'clip.mkv');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=640x360:r=25:d=12', '-f', 'lavfi', '-i', 'sine=f=440:d=12', '-c:v', 'mpeg2video', '-q:v', '4', '-c:a', 'ac3', mkv]);
assert.equal(made.status, 0, String(made.stderr));
const app = await electron.launch({ args: ['.'], env: { ...process.env, VIDEE_TEST_USER_DATA: userData, VIDEE_LANG: 'en', ...(process.platform === 'linux' ? { VIDEE_MPV: '1', VIDEE_MPV_NODE: process.env.VIDEE_MPV_NODE || 'node' } : {}) } });
const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const position = () => page.evaluate(() => Number(document.querySelector('.seek-play')?.value));
try {
  await page.getByRole('button', { name: 'Open folder', exact: true }).waitFor();
  await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, [mkv, resolve('tests/fixtures/legacy.avi')]);
  await page.getByRole('button', { name: 'Open video', exact: true }).click();
  await page.locator('.mpv-surface').waitFor({ timeout: 20000 });
  assert.equal(await page.locator('.player-view video').count(), 0, 'no <video> element: mpv plays it');
  assert.equal(await page.locator('.engine-badge').count(), 0, 'no conversion badge');
  // Duration comes from mpv and playback advances.
  await page.waitForFunction(() => /0:12/.test(document.querySelector('.player-controls')?.textContent || ''), null, { timeout: 15000 });
  await page.waitForFunction(() => Number(document.querySelector('.seek-play')?.value) > 1, null, { timeout: 15000 });
  // Pause, seek, resume.
  await page.locator('.transport-play').click();
  await page.waitForTimeout(400);
  const paused = await position();
  await page.waitForTimeout(700);
  assert.ok(Math.abs(await position() - paused) < 0.05, 'paused');
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('7.5');
  await page.waitForTimeout(700);
  assert.ok(Math.abs(await position() - 7.5) < 0.2, `seeked to ${await position()}`);
  await page.locator('.transport-play').click();
  await page.waitForFunction(() => Number(document.querySelector('.seek-play')?.value) > 8, null, { timeout: 10000 });
  // At the end the next video (an AVI) opens and plays through mpv too.
  await page.waitForFunction(() => /legacy/.test(document.querySelector('.player-heading h1')?.textContent || ''), null, { timeout: 20000 });
  await page.waitForFunction(() => Number(document.querySelector('.seek-play')?.value) > 0.5 && !!document.querySelector('.mpv-surface'), null, { timeout: 15000 });
  const cached = await readdir(join(userData, 'converted')).catch(() => []);
  assert.deepEqual(cached, [], 'nothing written to the cache');
  assert.deepEqual(errors, []);
  console.log('PASS: mpv engine plays MKV/AC-3 and AVI with the player controls, seek and auto-advance, nothing on disk.');
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
