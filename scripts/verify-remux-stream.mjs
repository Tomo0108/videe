import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
// MKV with H.264 + AC-3 (keyframes every 5 s): the player can decode the codecs but not the
// container, so Videe repackages it on the fly. Nothing is written to disk, there is no preparing
// step, and seeking between keyframes lands on the requested frame.
const userData = await mkdtemp('/tmp/videe-remux-test-');
const mkv = join(userData, 'clip.mkv');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=640x360:r=25:d=20', '-f', 'lavfi', '-i', 'sine=f=440:d=20', '-c:v', 'libx264', '-g', '125', '-keyint_min', '125', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-c:a', 'ac3', mkv]);
assert.equal(made.status, 0, String(made.stderr));
const frameAt = time => {
  const out = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(time), '-i', mkv, '-frames:v', '1', '-vf', 'scale=64:36', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
  return [...out.stdout];
};
const app = await electron.launch({ args: ['.'], env: { ...process.env, VIDEE_TEST_USER_DATA: userData, VIDEE_LANG: 'en' } });
const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const shown = () => page.evaluate(() => {
  const v = document.querySelector('.player-view video'); const c = document.createElement('canvas'); c.width = 64; c.height = 36;
  const g = c.getContext('2d'); g.drawImage(v, 0, 0, 64, 36); const d = g.getImageData(0, 0, 64, 36).data;
  return Array.from({ length: 64 * 36 }, (_, i) => Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]));
});
const distance = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
try {
  await page.getByRole('button', { name: 'Open folder', exact: true }).waitFor();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, mkv);
  await page.getByRole('button', { name: 'Open video', exact: true }).click();
  await page.waitForFunction(() => { const v = document.querySelector('.player-view video'); return v && v.currentSrc.includes('c=1') && !v.error && v.readyState >= 2 && v.currentTime > 0.3; }, null, { timeout: 30000 });
  assert.equal(await page.locator('.cut-progress').count(), 0, 'no preparing step');
  assert.equal(await page.locator('.engine-badge').count(), 0, 'no conversion badge');
  // Seek to 7.3 s, between keyframes at 5 s and 10 s.
  await page.locator('.transport-play').click();
  await page.waitForFunction(() => document.querySelector('.player-view video')?.paused);
  await page.getByRole('slider', { name: 'Playback position', exact: true }).fill('7.3');
  await page.waitForFunction(() => { const v = document.querySelector('.player-view video'); const s = document.querySelector('.seek-play'); return v && v.currentSrc.includes('t=7.3') && v.readyState >= 2 && !v.seeking && Math.abs(Number(s.value) - 7.3) < 0.15; }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  const picture = await shown();
  const near = distance(picture, frameAt(7.3)), keyframe = distance(picture, frameAt(5));
  assert.ok(near < keyframe && near < 12, `shown frame is not 7.3 s (diff ${near.toFixed(1)} vs keyframe ${keyframe.toFixed(1)})`);
  // Plays on from there with sound and picture.
  await page.locator('.transport-play').click();
  await page.waitForFunction(() => Number(document.querySelector('.seek-play')?.value) > 8, null, { timeout: 10000 });
  const cached = await readdir(join(userData, 'converted')).catch(() => []);
  assert.deepEqual(cached, [], 'nothing written to the cache');
  assert.deepEqual(errors, []);
  console.log(`PASS: MKV repackaged on the fly without disk copies or a preparing step; seek lands on the right frame (diff ${near.toFixed(1)}).`);
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
