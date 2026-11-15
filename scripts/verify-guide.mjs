// Checks the first-launch tour and the quick guide. Needs `npm run dev`.
// Pass a folder to also save screenshots: node scripts/verify-guide.mjs /tmp/shots
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const URL = process.env.VIDEE_URL || 'http://127.0.0.1:5173';
const shotsDir = process.argv[2];
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const shot = async (page, name) => { if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png` }); };

for (const [label, viewport, scheme] of [['desktop', { width: 1440, height: 900 }, 'light'], ['phone', { width: 390, height: 844 }, 'light'], ['desktop-dark', { width: 1440, height: 900 }, 'dark']]) {
  const page = await browser.newPage({ viewport, colorScheme: scheme, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));

  // Automated browsers never get the tour on their own, so other scripts stay unblocked.
  await page.goto(URL);
  await page.waitForSelector('.no-results h2');
  assert.equal(await page.locator('dialog.tour').count(), 0, 'tour must not auto-start under automation');

  // ?tour starts it like a first launch.
  await page.goto(`${URL}/?tour`);
  const tour = page.locator('dialog.tour');
  await tour.waitFor();
  assert.equal(await tour.locator('h2').textContent(), 'Videe へようこそ');
  await shot(page, `tour-1-${label}`);
  await tour.getByRole('button', { name: 'はじめる' }).click();
  for (let step = 2; step <= 5; step++) {
    await page.waitForTimeout(150);
    const spot = await tour.locator('.tour-spot').boundingBox();
    assert.ok(spot && spot.width > 10, `step ${step} highlights its control`);
    const card = await tour.locator('.tour-card').boundingBox();
    assert.ok(card.x >= 0 && card.y >= 0 && card.x + card.width <= viewport.width + 1 && card.y + card.height <= viewport.height + 1, `step ${step} card fits the window`);
    if (step === 4) {
      // Settings changed in the tour apply right away.
      const resume = tour.getByRole('switch', { name: '続きから再生' });
      assert.equal(await resume.isChecked(), true);
      await resume.click();
      assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('videe-preferences'))).resume, false);
      await resume.click();
    }
    await shot(page, `tour-${step}-${label}`);
    if (step < 5) await tour.getByRole('button', { name: '次へ' }).click();
  }
  // The last step hands off to the guide and remembers the tour was seen.
  await tour.getByRole('button', { name: 'クイックガイドを開く' }).click();
  await page.locator('dialog.guide-modal').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('videe-tour')), '1');
  assert.equal(await page.locator('dialog.tour').count(), 0);
  const images = page.locator('.guide-figure img');
  assert.equal(await images.count(), 5);
  for (const img of await images.all()) { await img.scrollIntoViewIfNeeded(); await page.waitForFunction(el => el.complete && el.naturalWidth > 0, await img.elementHandle()); }
  assert.ok(await page.locator('.guide-mark').count() >= 20, 'callouts drawn over screenshots');
  assert.ok(await page.locator('.guide .guide-ui svg').count() >= 20, 'app icons shown inline in the text');
  await page.locator('dialog.guide-modal').evaluate(el => { el.scrollTop = 0; });
  await shot(page, `guide-top-${label}`);
  await page.getByRole('button', { name: '設定を確認する' }).click();
  await page.waitForTimeout(800);
  if (viewport.width > 860) {
    // The side panel stays in view and follows the step being read.
    assert.ok(await page.locator('.guide-side').isVisible(), 'side panel on wide windows');
    assert.match(await page.locator('.guide-nav [aria-current]').textContent(), /設定を確認する/);
    assert.ok((await page.locator('.guide-side').boundingBox()).y < 120, 'side panel stays at the top while scrolling');
  }
  await shot(page, `guide-settings-${label}`);
  await page.getByRole('button', { name: '再生する' }).first().click();
  await page.waitForTimeout(400);
  await shot(page, `guide-play-${label}`);
  await page.locator('dialog.guide-modal .modal-head [aria-label="Close"]').click();
  await page.locator('dialog.guide-modal').waitFor({ state: 'detached' });

  // Seen: no tour on the next normal launch even outside automation logic.
  await page.goto(URL);
  await page.waitForSelector('.no-results h2');
  assert.equal(await page.locator('dialog.tour').count(), 0);

  // F1 opens the guide; Esc closes it.
  await page.keyboard.press('F1');
  await page.locator('dialog.guide-modal').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('dialog.guide-modal').waitFor({ state: 'detached' });

  // Header help button and Settings rows reopen both.
  await page.getByRole('button', { name: 'Quick guide' }).first().click();
  await page.locator('dialog.guide-modal').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('dialog.guide-modal').waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /Take the tour/ }).click();
  await tour.waitFor();
  await page.keyboard.press('Escape');
  await tour.waitFor({ state: 'detached' });
  await page.close();
}
// A Mac browser (and the Mac app) gets the Mac edition with its own screenshots and ⌘? shortcut.
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`mac: ${error.message}`));
  await page.goto(URL);
  await page.waitForSelector('.no-results h2');
  await page.keyboard.press('Meta+Shift+Slash');
  await page.locator('dialog.guide-modal').waitFor();
  assert.match(await page.locator('.guide-meta >> visible=true').textContent(), /^Mac 版/);
  assert.match(await page.locator('#guide-install').textContent(), /mac-arm64\.dmg/);
  const srcs = await page.locator('.guide-figure img').evaluateAll(imgs => imgs.map(img => img.getAttribute('src')));
  assert.equal(srcs.length, 5);
  assert.ok(srcs.every(src => /-mac/.test(src)), 'Mac screenshots');
  if (shotsDir) { await page.getByRole('button', { name: 'ライブラリを整理する' }).click(); await page.waitForTimeout(400); await shot(page, 'guide-library-mac'); }
  await context.close();
}
// Mac app: dialogs must not sit under the header's window-drag area, or their buttons stop responding.
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(URL);
  await page.waitForSelector('.no-results h2');
  await page.evaluate(() => document.querySelector('.app-shell').classList.add('native-mac'));
  const region = selector => page.evaluate(sel => { const style = getComputedStyle(document.querySelector(sel)); return style.getPropertyValue('-webkit-app-region') || style.webkitAppRegion || ''; }, selector);
  const before = await region('.app-header');
  await page.keyboard.press('F1');
  await page.locator('dialog.guide-modal').waitFor();
  assert.notEqual(await region('.app-header'), 'drag', 'header stops dragging while a dialog is open');
  assert.notEqual(await region('dialog.guide-modal .modal-head [aria-label="Close"]'), 'drag');
  await page.locator('dialog.guide-modal .modal-head [aria-label="Close"]').click();
  await page.locator('dialog.guide-modal').waitFor({ state: 'detached' });
  assert.equal(await region('.app-header'), before, 'header drags again after closing');
  console.log(`app-region: header ${before || '(not exposed)'}`);
  await page.close();
}
await browser.close();
assert.deepEqual(errors, []);
console.log('Quick guide and tour OK');
