import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';

const dir = await mkdtemp(join(tmpdir(), 'videe-embed-ui-'));
const muxed = join(dir, 'captioned.mp4');
const mux = spawnSync(ffmpeg, ['-hide_banner','-nostdin','-y','-i','tests/fixtures/sample.mp4','-i','tests/fixtures/subtitle.srt','-c','copy','-c:s','mov_text',muxed], { encoding: 'utf8' });
if (mux.status !== 0) throw new Error((mux.stderr || '').slice(-2000));
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
try {
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(() => !document.querySelector('.header-open')?.disabled);
  await page.locator('input[type=file]').first().setInputFiles(muxed);
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.getByRole('button', { name: 'Subtitles', exact: true }).click();
  await page.getByRole('button', { name: 'Open subtitles', exact: true }).waitFor();
  const inband = await page.evaluate(() => [...document.querySelector('video').textTracks].filter(track => track.kind === 'subtitles' || track.kind === 'captions').length);
  if (inband > 0) {
    await page.waitForFunction(() => [...document.querySelector('video').textTracks].some(track => track.mode === 'showing' || track.cues?.length));
  }
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  console.log(`PASS: captioned file opens the subtitle panel${inband ? ` and exposes ${inband} embedded text track(s)` : ' (browser in-band tracks are optional)'}.`);
} catch (error) {
  await page.screenshot({ path: '/tmp/videe-embedded-subs-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
  await rm(dir, { recursive: true, force: true });
}
