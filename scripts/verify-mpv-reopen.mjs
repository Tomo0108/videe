import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
// Opening the same MKV again and again (closing the player, opening from the header, double opens)
// keeps it on the built-in mpv engine; it never drops to live conversion.
const userData = await mkdtemp(join(tmpdir(), 'videe-mpv-reopen-'));
const mkv = join(userData, 'clip.mkv');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=s=640x360:r=25:d=20', '-f', 'lavfi', '-i', 'sine=f=440:d=20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'ac3', mkv]);
assert.equal(made.status, 0, String(made.stderr));
const app = await electron.launch({ args: ['.'], env: { ...process.env, VIDEE_TEST_USER_DATA: userData, VIDEE_LANG: 'en', ...(process.platform === 'linux' ? { VIDEE_MPV: '1', VIDEE_MPV_NODE: process.env.VIDEE_MPV_NODE || 'node' } : {}) } });
const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const onMpv = async round => {
  await page.waitForFunction(() => !!document.querySelector('.mpv-surface') && Number(document.querySelector('.seek-play')?.value) > 0.3, null, { timeout: 20000 }).catch(() => {});
  const state = await page.evaluate(() => ({ mpv: !!document.querySelector('.mpv-surface'), video: !!document.querySelector('.player-view video'), badge: document.querySelector('.engine-badge')?.textContent || '' }));
  assert.ok(state.mpv && !state.video && !state.badge, `round ${round}: ${JSON.stringify(state)}`);
};
try {
  await page.locator('.header-open-video').waitFor();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, mkv);
  for (let round = 1; round <= 8; round++) {
    await page.locator('.header-open-video').click();
    if (round % 3 === 0) { await page.waitForTimeout(150); await page.locator('.header-open-video').click().catch(() => {}); }
    await onMpv(round);
    if (round % 2) await page.getByRole('slider', { name: 'Playback position', exact: true }).fill(String(2 + round));
    await page.waitForTimeout(round % 2 ? 900 : 200);
    await page.getByRole('button', { name: 'Back to library', exact: true }).click();
    await page.getByRole('button', { name: 'Close player', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.player-view'));
  }
  assert.deepEqual(errors, []);
  console.log('PASS: the same MKV opened 8 times stays on mpv.');
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
