import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const browser = await chromium.launch({ channel: 'chromium', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const root = await mkdtemp(join(tmpdir(), 'videe-folder-ui-'));
try {
  await mkdir(join(root, 'nested'), { recursive: true });
  await copyFile(resolve('tests/fixtures/sample.mp4'), join(root, 'Inside.mp4'));
  await copyFile(resolve('tests/fixtures/sample.mp4'), join(root, 'nested', 'Deep.mp4'));
  await writeFile(join(root, 'note.txt'), 'skip');
  await page.goto('http://127.0.0.1:5173');
  await page.waitForFunction(() => !document.querySelector('.header-open')?.disabled);
  assert.equal(await page.locator('input.folder-input').evaluate(el => el.hasAttribute('webkitdirectory')), true);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('.app-header .header-open').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(root);
  await page.locator('.video-card').nth(1).waitFor();
  assert.equal(await page.locator('.video-card').count(), 2);
  await page.waitForFunction(() => document.querySelectorAll('.video-thumbnail img').length === 2, null, { timeout: 20000 });
  assert.equal(await page.locator('.video-list').count(), 1);
  assert.equal(await page.locator('.collection-name').innerText(), basename(root));
  await page.getByRole('checkbox', { name: 'Select Inside.mp4', exact: true }).check();
  await page.locator('.library-selection .choice-menu > summary').click();
  await page.locator('.library-selection .choice-options').getByRole('button', { name: 'Unfiled', exact: true }).click();
  assert.equal(await page.locator('.video-card').count(), 1);
  await page.locator('summary[aria-label^="Options for"]').click();
  await page.getByRole('button', { name: 'Move to Unfiled', exact: true }).click();
  await page.getByText('Empty collection').waitFor();
  await page.locator('.organization summary[aria-label="Collection"]').click();
  await page.locator('.organization .choice-options').getByRole('button', { name: 'Unfiled', exact: true }).click();
  assert.equal(await page.locator('.video-card').count(), 2);
  await page.locator('.organization summary[aria-label="Collection"]').click();
  await page.locator('.organization .choice-options').getByRole('button', { name: basename(root), exact: true }).click();
  await page.getByRole('button', { name: 'Delete folder', exact: true }).click();
  await page.locator('dialog.modal').getByRole('button', { name: 'Delete folder', exact: true }).click();
  await page.locator('dialog.modal').waitFor({ state: 'detached' });
  assert.equal(await page.locator('.collection-name').count(), 0);
  await page.getByRole('button', { name: 'Open folder', exact: true }).waitFor();
  console.log('PASS: Open folder icon imports into a named folder, defaults to list, moves videos, and deletes the folder.');
} catch (error) {
  await page.screenshot({ path: '/tmp/videe-folder-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
  await rm(root, { recursive: true, force: true });
}
