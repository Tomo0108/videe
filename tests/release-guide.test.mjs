import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releaseGuideSection, releaseNotesWithGuide } from '../src/release-guide.mjs';

const guide = JSON.parse(readFileSync(new URL('../docs/release-guide/guide.json', import.meta.url), 'utf8'));

test('release guide has a section per edition with icons and screenshots from the tag', () => {
  const html = releaseGuideSection(guide, '9.9.9');
  assert.equal((html.match(/<details>/g) || []).length, 3);
  for (const label of ['Mac 版', 'Windows 版', 'iPhone / iPad 版']) assert.ok(html.includes(label), label);
  assert.match(html, /raw\.githubusercontent\.com\/Tomo0108\/videe\/v9\.9\.9\/docs\/release-guide\/icons\/laptop\.png/);
  assert.match(html, /v9\.9\.9\/docs\/release-guide\/images\/ios-play\.webp/);
  assert.doesNotMatch(html, /\{icon:|<style|<script|<svg/);
});

test('release notes keep the version notes and stay under the GitHub limit', () => {
  const body = releaseNotesWithGuide('Fix things.\n', guide, '9.9.9');
  assert.ok(body.startsWith('Fix things.\n\n## クイックガイド'));
  assert.ok(body.length < 125000, `${body.length} characters`);
});

test('every icon and image the release guide links to is committed', () => {
  const html = releaseGuideSection(guide, '9.9.9');
  for (const [, path] of html.matchAll(/v9\.9\.9\/docs\/release-guide\/([^"]+)"/g)) {
    assert.doesNotThrow(() => readFileSync(new URL(`../docs/release-guide/${path}`, import.meta.url)), path);
  }
});
