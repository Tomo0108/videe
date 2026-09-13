import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 3840, height: 2160 } });
try {
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(() => !document.querySelector('.header-open')?.disabled);
  await page.locator('input[type=file]').first().setInputFiles(resolve('tests/fixtures/sample.mp4'));
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  const stage = page.locator('.player-stage');
  const box = await stage.boundingBox();
  assert.ok(box && box.width > 3700, `player stage width ${box?.width}`);
  assert.ok(box && box.height > 1950, `player stage height ${box?.height}`);
  await page.getByRole('button', { name: 'Full screen', exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).waitFor();
  const full = await page.evaluate(() => {
    const el = document.querySelector('.player-stage');
    return el ? [el.clientWidth, el.clientHeight, window.innerWidth, window.innerHeight] : [];
  });
  assert.equal(full[0], full[2]);
  assert.equal(full[1], full[3]);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.getByRole('button', { name: 'Full screen', exact: true }).waitFor();
  console.log('PASS: 4K player fills the window and fullscreen toggles the control icon.');
} catch (error) {
  await page.screenshot({ path: '/tmp/videe-player-layout-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
