import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { JA, JA_PATTERNS } from '../src/locales/ja.mjs';
import { DEFAULT_LANGUAGE, errorMessage, languageFromUrl, normalizeLanguage, translate } from '../src/i18n.mjs';
import { defaults, normalizePreferences } from '../src/preferences.mjs';
import { playbackPlan, subtitleLabel } from '../src/media.mjs';

const require = createRequire(import.meta.url);
const shell = require('../electron/i18n.cjs');

/** Every literal passed to t('…') in src, including both arms of t(cond ? 'a' : 'b'). */
function sourceKeys() {
  const keys = new Set();
  for (const name of readdirSync(new URL('../src', import.meta.url))) {
    if (!/\.(tsx?|mjs)$/.test(name)) continue;
    const text = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    for (const match of text.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(match[1].replace(/\\'/g, "'"));
    for (const match of text.matchAll(/\bt\([^()']*\?\s*'((?:[^'\\]|\\.)*)'\s*:\s*'((?:[^'\\]|\\.)*)'/g)) { keys.add(match[1]); keys.add(match[2]); }
  }
  return [...keys];
}
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('Japanese is the default language', () => {
  assert.equal(DEFAULT_LANGUAGE, 'ja');
  assert.equal(defaults.language, 'ja');
  assert.equal(normalizePreferences(null).language, 'ja');
  assert.equal(normalizePreferences({ language: 'en' }).language, 'en');
  assert.equal(normalizePreferences({ language: 'fr' }).language, 'ja');
  assert.equal(normalizeLanguage('xx'), null);
  assert.equal(languageFromUrl('?lang=en'), 'en');
  assert.equal(languageFromUrl('?tour&lang=ja'), 'ja');
  assert.equal(languageFromUrl('?lang=de'), null);
});

test('every UI string in src has a Japanese translation', () => {
  const keys = sourceKeys();
  assert.ok(keys.length > 300, `found only ${keys.length} strings`);
  const missing = keys.filter(key => !Object.hasOwn(JA, key));
  assert.deepEqual(missing, []);
});

test('translations keep their placeholders and are not left in English', () => {
  for (const [key, value] of Object.entries(JA)) {
    assert.deepEqual(placeholders(value), placeholders(key), key);
    assert.ok(value.trim(), key);
  }
});

test('translate fills placeholders and falls back to English', () => {
  assert.equal(translate('Volume {n}%', { n: 40 }, 'ja'), '音量 40%');
  assert.equal(translate('Volume {n}%', { n: 40 }, 'en'), 'Volume 40%');
  assert.equal(translate('Moved {n} videos to {folder}.', { n: 3, folder: 'Trips' }, 'ja'), '3 本の動画を「Trips」に移動しました。');
  assert.equal(translate('Something new', undefined, 'ja'), 'Something new');
});

test('playback reasons and subtitle labels built at run time are translated', () => {
  const plan = playbackPlan({ container: 'avi', duration: 10, bitrate: 0, video: { codec: 'mpeg4', profile: '', width: 640, height: 480, fps: 25, pixFmt: 'yuv420p', bitDepth: 8, chroma: '420', interlaced: true }, audio: [{ codec: 'mp3', profile: '', channels: 2, sampleRate: 44100, language: '' }], subtitles: 0 });
  assert.ok(plan.reasons.length >= 2);
  for (const reason of plan.reasons) assert.notEqual(translate(reason, undefined, 'ja'), reason, reason);
  assert.equal(translate(subtitleLabel('jpn', 0), undefined, 'ja'), '日本語');
  assert.equal(translate(subtitleLabel('', 2), undefined, 'ja'), '字幕 3');
  assert.ok(JA_PATTERNS.every(([pattern]) => pattern instanceof RegExp));
});

test('errors from the desktop app lose the IPC wrapper before translation', () => {
  const error = new Error("Error invoking remote method 'export-video': Error: Export cancelled.");
  assert.equal(errorMessage(error, 'Export failed.'), 'Export cancelled.');
  assert.equal(translate(errorMessage(error, 'Export failed.'), undefined, 'ja'), '書き出しをキャンセルしました。');
  assert.equal(errorMessage('nope', 'Export failed.'), 'Export failed.');
  const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
  const thrown = [...main.matchAll(/new Error\('([^']+)'\)/g)].map(match => match[1]).filter(message => !/^(timeout|Unauthorized)$/.test(message));
  assert.ok(thrown.length > 10);
  assert.deepEqual(thrown.filter(message => !Object.hasOwn(JA, message)), []);
});

test('the Mac menu and native dialogs follow the app language', () => {
  const labels = template => template.flatMap(item => [item.label, ...(item.submenu ? labels(item.submenu) : [])]).filter(Boolean);
  shell.setLanguage('ja');
  const ja = labels(shell.macMenuTemplate(() => {}));
  assert.ok(ja.includes('編集') && ja.includes('設定…') && ja.includes('Videe を終了'));
  assert.equal(shell.t('Open videos'), '動画を開く');
  shell.setLanguage('en');
  const en = labels(shell.macMenuTemplate(() => {}));
  assert.ok(en.includes('Edit') && en.includes('Settings…'));
  assert.equal(shell.t('Open videos'), 'Open videos');
  assert.equal(shell.setLanguage('fr'), false);
  shell.setLanguage('ja');
  for (const label of en) if (label !== 'Videe') assert.ok(Object.hasOwn(shell.JA, label), label);
});
