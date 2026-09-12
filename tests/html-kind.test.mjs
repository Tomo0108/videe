import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlayerHtml } from '../scripts/html-kind.mjs';

test('player HTML is index.html, not the marketing page', () => {
  assert.equal(isPlayerHtml('index.html'), true);
  assert.equal(isPlayerHtml('site.html'), false);
});
