import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button', { name: 'Open folder', exact: true }).waitFor();
  await page.locator('input[type=file]').first().setInputFiles(resolve('tests/fixtures/sample.mp4'));
  await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
  await page.locator('.transport-play').click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  // Modified keys must remain available to browser/OS shortcuts.
  assert.equal(await page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { code: 'Space', key: ' ', ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e); return e.defaultPrevented;
  }), false);
  await page.keyboard.press('m');
  await page.getByRole('button', { name: 'Unmute', exact: true }).waitFor();
  await page.keyboard.press('Control+m');
  await page.getByRole('button', { name: 'Unmute', exact: true }).waitFor();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !document.querySelector('video').paused);
  const volume = await page.locator('video').evaluate(v => v.volume);
  await page.keyboard.press('ArrowDown');
  assert.ok(await page.locator('video').evaluate(v => v.volume) < volume);
  await page.keyboard.press('Digit5');
  await page.waitForFunction(() => {
    const v = document.querySelector('video');
    return v && Number.isFinite(v.duration) && Math.abs(v.currentTime - v.duration * 0.5) < 0.5;
  });
  await page.keyboard.press(']');
  assert.equal(await page.locator('video').evaluate(v => v.playbackRate), 1.25);
  await page.getByRole('button', { name: 'Back to library' }).click();
  await page.locator('.library-section').waitFor();
  assert.equal(await page.getByRole('heading', { name: 'All videos', exact: true }).count(), 0);
  assert.equal(await page.locator('.library-sidebar nav button').first().innerText(), '');
  assert.equal(await page.locator('.library-tabs button').first().innerText(), '');
  assert.equal(await page.locator('.library-count').isVisible(), true);
  const menu = page.locator('summary[aria-label="Options for sample.mp4"]');
  await menu.focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Video info', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.file-menu').getAttribute('open'), null);
  assert.equal(await menu.evaluate(el => el === document.activeElement), true);
  await page.getByRole('searchbox', { name: 'Search videos' }).fill('missing');
  await page.getByRole('button', { name: 'Reset search' }).click();
  assert.equal(await page.locator('.video-card').count(), 1);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 940 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}: library overflow`);
      if (width === 390 || width === 1440) await page.screenshot({ path: `/tmp/videe-app-${theme}-${width}.png` });
      await page.getByRole('button', { name: 'Settings', exact: true }).click();
      assert.ok(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth), `${theme}/${width}: settings overflow`);
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await page.locator('dialog').waitFor({ state: 'detached' });
    }
  }
  await page.setViewportSize({ width: 640, height: 940 });
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '200% text overflow');
  assert.deepEqual(errors, []);
  console.log('App design checks passed: keyboard isolation, menu dismissal, search recovery, 8 responsive/theme layouts, settings.');
} finally {
  await browser.close();
}
