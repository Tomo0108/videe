import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
// Without the built-in mpv engine (macOS), an MKV with AC-3 audio plays at once through live
// conversion: no preparing step, no "optimized" wording, nothing written to disk.
const userData = await mkdtemp(join(tmpdir(), 'videe-fallback-test-'));
const mkv = join(userData, 'clip.mkv');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=640x360:r=25:d=12', '-f', 'lavfi', '-i', 'sine=f=440:d=12', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'ac3', mkv]);
assert.equal(made.status, 0, String(made.stderr));
const app = await electron.launch({ args: ['.'], env: { ...process.env, VIDEE_TEST_USER_DATA: userData, VIDEE_LANG: 'ja', VIDEE_MPV: '0' } });
const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.locator('.header-open-video').waitFor();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, mkv);
  await page.locator('.header-open-video').click();
  await page.waitForFunction(() => { const v = document.querySelector('.player-view video'); return v && v.currentSrc.startsWith('videe://live/') && !v.error && v.readyState >= 2 && v.currentTime > 0.5; }, null, { timeout: 30000 });
  assert.equal(await page.locator('.cut-progress').count(), 0, 'no preparing step');
  assert.ok(!(await page.locator('body').innerText()).includes('最適化'), 'no 最適化 wording');
  if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT });
  // Opening a file that is already in the library again (after closing the player) plays it too.
  await page.getByRole('button', { name: 'ライブラリに戻る', exact: true }).click();
  await page.getByRole('button', { name: 'プレイヤーを閉じる', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.player-view'));
  await page.locator('.header-open-video').click();
  await page.waitForFunction(() => { const v = document.querySelector('.player-view video'); return v && v.currentSrc.startsWith('videe://live/') && !v.error && v.readyState >= 2 && v.currentTime > 0.5; }, null, { timeout: 30000 });
  assert.deepEqual(await readdir(join(userData, 'converted')).catch(() => []), [], 'nothing written to disk');
  assert.deepEqual(errors, []);
  console.log('PASS: MKV/AC-3 plays at once through live conversion (also when opened again) with no preparing step and nothing on disk.');
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
