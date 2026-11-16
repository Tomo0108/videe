import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
// An H.264 + AAC Matroska file plays natively once it is repackaged as MP4: Videe should do that
// in the background after the file is added, so opening it never waits and plays the copy directly.
const userData = await mkdtemp('/tmp/videe-prepare-test-');
const mkv = join(userData, 'clip.mkv');
const made = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', resolve('tests/fixtures/sample.mp4'), '-c', 'copy', mkv]);
assert.equal(made.status, 0, String(made.stderr));
const app = await electron.launch({ args: ['.'], env: { ...process.env, VIDEE_TEST_USER_DATA: userData, VIDEE_LANG: 'en' } });
const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.getByRole('button', { name: 'Open folder', exact: true }).waitFor();
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, mkv);
  await page.getByRole('button', { name: 'Open video', exact: true }).click();
  // The open plays at once (no blocking progress) and the background copy replaces live conversion.
  await page.waitForFunction(() => { const v = document.querySelector('video'); return v && !v.error && v.readyState >= 2; }, null, { timeout: 30000 });
  assert.equal(await page.locator('.cut-progress').count(), 0);
  const registryHasCopy = async () => Object.values(JSON.parse(await readFile(join(userData, 'library.json'), 'utf8'))).some(entry => entry.converted && entry.convertedKind === 'optimized');
  for (let i = 0; i < 100 && !(await registryHasCopy()); i++) await new Promise(r => setTimeout(r, 200));
  assert.ok(await registryHasCopy(), 'background copy was not made');
  const files = await readdir(join(userData, 'converted'));
  assert.ok(files.some(name => /\.mp4$/.test(name) && !name.includes('partial')), files.join(','));
  // A short file is ready before the player asks for it, so it plays the copy directly.
  await page.waitForFunction(() => { const v = document.querySelector('.player-view video'); return v && v.currentSrc.startsWith('videe://media/') && !v.error && v.readyState >= 2; }, null, { timeout: 20000 });
  assert.equal(await page.locator('.engine-badge').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: Matroska file is repackaged in the background and plays directly without a preparing step.');
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
