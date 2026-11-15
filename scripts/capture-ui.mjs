// Screenshots of the main screens for design reviews (light/dark, desktop/tablet/phone).
// Usage: npm run dev, then `node scripts/capture-ui.mjs <out-dir> [fixture-dir] [--lang=en]`.
// The fixture dir holds the .mp4 files to import (default: tests/fixtures).
import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
const lang = process.argv.find(arg => arg.startsWith('--lang='))?.slice(7) || 'ja';
const out = resolve(args[0] || '/tmp/videe-ui');
const fixtureDir = resolve(args[1] || 'tests/fixtures');
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const files = readdirSync(fixtureDir).filter(name => /\.(mp4|webm|mov)$/i.test(name)).map(name => ({ name, mimeType: 'video/mp4', buffer: readFileSync(join(fixtureDir, name)) }));
mkdirSync(out, { recursive: true });
const ja = lang === 'ja';
const L = (en, jp) => (ja ? jp : en);
const sizes = [
  { name: '1440', width: 1440, height: 900, themes: ['light', 'dark'] },
  { name: '820', width: 820, height: 1100, themes: ['light'] },
  { name: '390', width: 390, height: 844, themes: ['light', 'dark'], mobile: true },
];
const browser = await chromium.launch({ headless: true });
const want = scene => !only || only.includes(scene);

for (const size of sizes) for (const theme of size.themes) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, colorScheme: theme, hasTouch: !!size.mobile, isMobile: !!size.mobile });
  const page = await context.newPage();
  const shot = async scene => { if (want(scene)) await page.screenshot({ path: join(out, `${scene}-${size.name}-${theme}.png`) }); };
  const settle = () => page.waitForTimeout(700);
  await page.goto(`${process.env.VIDEE_URL || 'http://127.0.0.1:5173'}/?lang=${lang}`);
  await page.locator('.no-results').waitFor();
  await settle();
  await shot('empty');
  await page.locator('input[type=file]').first().setInputFiles(files);
  await page.waitForFunction(() => document.querySelector('.player-view video')?.readyState >= 2);
  await page.locator('.player-view video').evaluate(video => { video.pause(); video.currentTime = 2.4; });
  await page.waitForTimeout(400);
  // Player with its controls showing.
  await page.mouse.move(size.width / 2, size.height / 2);
  await page.mouse.move(size.width / 2 + 10, size.height / 2 + 10);
  await page.waitForTimeout(300);
  await shot('player');
  const more = page.getByRole('button', { name: L('More controls', 'その他の操作') });
  if (await more.isVisible()) {
    await more.click();
    await page.waitForTimeout(400);
    await shot('player-more');
    await more.click();
  }
  await page.getByRole('button', { name: L('Back to library', 'ライブラリに戻る') }).click();
  await page.locator('.library-section').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.video-thumbnail img').length >= document.querySelectorAll('.video-card').length, null, { timeout: 30000 }).catch(() => {});
  await settle();
  await shot('mini-grid');
  await page.getByRole('button', { name: L('Close player', 'プレイヤーを閉じる') }).click();
  await settle();
  await shot('grid');
  await page.locator('.video-card').first().hover().catch(() => {});
  await page.waitForTimeout(300);
  await shot('grid-hover');
  await page.mouse.move(2, size.height - 2);
  const info = page.locator('.video-info-button').first();
  await info.click();
  await page.locator('dialog').waitFor();
  await settle();
  await shot('info');
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: L('List view', 'リスト表示') }).click();
  await settle();
  await shot('list');
  await page.getByRole('button', { name: L('Grid view', 'サムネイル表示') }).click();
  await page.getByRole('button', { name: L('Settings', '設定'), exact: true }).click();
  await page.locator('dialog').waitFor();
  await settle();
  await shot('settings');
  await page.keyboard.press('Escape');
  await page.locator('dialog').waitFor({ state: 'detached' });
  if (!size.mobile) {
    await page.getByRole('button', { name: L('Quick guide', 'クイックガイド'), exact: true }).click();
    await page.locator('dialog').waitFor();
    await settle();
    await shot('guide');
    await page.keyboard.press('Escape');
    await page.locator('dialog').waitFor({ state: 'detached' });
  }
  await context.close();
  console.log(`captured ${size.name} ${theme}`);
}
await browser.close();
