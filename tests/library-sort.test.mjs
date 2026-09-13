import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMedia, nextSortPref, normalizeDir, normalizeSort, sortKey } from '../src/library-sort.mjs';

const clip = (name, extra = {}) => ({ name, duration: 0, size: 0, lastPlayed: 0, added: 1, ...extra });

test('sort keys stay per folder or library view, not playlists', () => {
  assert.equal(sortKey('folder-1', 'all', false), 'folder-1');
  assert.equal(sortKey('', 'favorites', false), 'view:favorites');
  assert.equal(sortKey('pl', 'all', true), '');
});

test('clicking a heading toggles direction and switching columns uses the default', () => {
  assert.deepEqual(nextSortPref({ sort: 'name', dir: 'asc' }, 'name'), { sort: 'name', dir: 'desc' });
  assert.deepEqual(nextSortPref({ sort: 'name', dir: 'desc' }, 'size'), { sort: 'size', dir: 'desc' });
  assert.deepEqual(nextSortPref({ sort: 'size', dir: 'desc' }, 'name'), { sort: 'name', dir: 'asc' });
});

test('compareMedia orders name, duration, size, and recently played', () => {
  const a = clip('Alpha.mp4', { duration: 10, size: 100, lastPlayed: 2, added: 1 });
  const b = clip('Zulu.mp4', { duration: 40, size: 50, lastPlayed: 8, added: 3 });
  assert.ok(compareMedia(a, b, 'name', 'asc') < 0);
  assert.ok(compareMedia(a, b, 'name', 'desc') > 0);
  assert.ok(compareMedia(a, b, 'duration', 'desc') > 0);
  assert.ok(compareMedia(a, b, 'size', 'desc') < 0);
  assert.ok(compareMedia(a, b, 'recent', 'desc') > 0);
  assert.equal(normalizeSort('size'), 'size');
  assert.equal(normalizeSort('nope'), 'recent');
  assert.equal(normalizeDir('asc', 'size'), 'asc');
  assert.equal(normalizeDir('sideways', 'name'), 'asc');
});
