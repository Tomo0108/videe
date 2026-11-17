import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
// An MKV whose picture the player can decode is repackaged, not re-encoded and not handed to mpv:
// full resolution, exact seeking (keyframes are 5 s apart here), nothing on disk.
const userData = await mkdtemp(join(tmpdir(), 'videe-repack-test-'));
const mkv = join(userData, 'clip.mkv');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=320x180:r=25:d=240', '-f', 'lavfi', '-i', 'sine=f=440:d=240', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '125', '-keyint_min', '125', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-c:a', 'ac3', mkv]);
assert.equal(made.status, 0, String(made.stderr));
const app = await electron.launch({ args: ['.'], env: { ...process.env, VIDEE_TEST_USER_DATA: userData, VIDEE_LANG: 'en', VIDEE_MPV: process.env.VIDEE_MPV || '0', ...(process.env.VIDEE_MPV === '1' ? { VIDEE_MPV_NODE: process.env.VIDEE_MPV_NODE || 'node' } : {}) } });
const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const position = () => page.evaluate(() => Number(document.querySelector('.seek-play')?.value));
try {
  await page.locator('.header-open-video').waitFor();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, mkv);
  await page.locator('.header-open-video').click();
  await page.waitForFunction(() => { const v = document.querySelector('.player-view video'); return v && v.currentSrc.startsWith('blob:') && v.readyState >= 2 && v.currentTime > 0.3; }, null, { timeout: 30000 });
  assert.equal(await page.locator('.mpv-surface').count(), 0, 'not handed to mpv');
  assert.equal(await page.locator('.engine-badge').count(), 0, 'no conversion badge');
  assert.equal(await page.evaluate(() => document.querySelector('.player-view video').videoHeight), 180, 'full resolution');
  for (const target of [7.3, 201.3, 150.7, 2.2]) {
    await page.getByRole('slider', { name: 'Playback position', exact: true }).fill(String(target));
    await page.waitForTimeout(400);
    await page.waitForFunction(() => { const v = document.querySelector('.player-view video'); return v && v.readyState >= 2 && !v.seeking; }, null, { timeout: 20000 });
    await page.waitForTimeout(300);
    const at = await position();
    assert.ok(at >= target - 0.15 && at < target + 1, `seek to ${target} landed at ${at}`);
  }
  assert.deepEqual(await readdir(join(userData, 'converted')).catch(() => []), [], 'nothing on disk');
  assert.deepEqual(errors, []);
  console.log('PASS: MKV is repackaged at full quality with exact seeking and nothing on disk.');
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
