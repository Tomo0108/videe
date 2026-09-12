import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const out = '/tmp/videe-landing-loop';
mkdirSync(out, { recursive: true });
const url = process.env.VIDEE_SITE_URL || 'http://127.0.0.1:5173/site.html';
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const errors = [];

async function shot(page, name) {
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Videe', exact: true }).waitFor();
  assert.equal(await page.locator('text=Your films').count(), 0);
  assert.equal(await page.locator('text=LOCAL CINEMA').count(), 0);
  assert.equal(await page.locator('text=Why the apps exist').count(), 0);
  assert.equal(await page.locator('img[src*="promo/"]').count(), 0);
  assert.equal(await page.locator('.hero-visual, .shots, .why, .install').count(), 0);
  await shot(page, 'desktop-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'desktop-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  const overflowX = () => page.evaluate(() => [...document.querySelectorAll('body *')].some(el => el.getBoundingClientRect().right > innerWidth + 2));
  await page.setViewportSize({ width: 768, height: 1024 });
  assert.equal(await overflowX(), false, 'tablet horizontal overflow');
  await shot(page, 'tablet-light');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await overflowX(), false, 'mobile horizontal overflow');
  await shot(page, 'mobile-light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot(page, 'mobile-dark');
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('PASS: lean landing, no promo shots/copy, dark + mobile, no pageerror');
} finally {
  await browser.close();
}
