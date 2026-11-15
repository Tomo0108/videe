import test from 'node:test';
import assert from 'node:assert/strict';

const THUMBNAIL_VERSION = 2;
function needsThumbnail(item) {
  return !item.thumbnail || item.thumbnailVersion !== THUMBNAIL_VERSION;
}
function thumbnailSeekTime(duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, duration / 10);
}

test('thumbnail seek stays inside short clips and ignores unknown duration', () => {
  assert.equal(thumbnailSeekTime(0), 0);
  assert.equal(thumbnailSeekTime(Number.NaN), 0);
  assert.equal(thumbnailSeekTime(2), 0.2);
  assert.equal(thumbnailSeekTime(30), 1);
});

function needsPreview(item) {
  return needsThumbnail(item) || !(item.duration > 0);
}
test('library rows without a current-version still need a thumbnail', () => {
  assert.equal(needsThumbnail({}), true);
  assert.equal(needsThumbnail({ thumbnail: 'data:image/jpeg;base64,xx' }), true);
  assert.equal(needsThumbnail({ thumbnail: 'data:image/jpeg;base64,xx', thumbnailVersion: THUMBNAIL_VERSION }), false);
});
test('known thumbnails still need a duration probe', () => {
  const ready = { thumbnail: 'data:image/jpeg;base64,xx', thumbnailVersion: THUMBNAIL_VERSION, duration: 12 };
  assert.equal(needsPreview(ready), false);
  assert.equal(needsPreview({ ...ready, duration: 0 }), true);
});

import { thumbnailBatch, NATIVE_THUMBNAIL_JOBS } from '../src/thumbnail-queue.mjs';
const needs = item => !item.done;
test('desktop previews run a few at a time, in library order', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, native: true, done: i === 1 }));
  assert.deepEqual(thumbnailBatch(items, { needs, nativeFrames: true }).map(i => i.id), ['v0', 'v2', 'v3'].slice(0, NATIVE_THUMBNAIL_JOBS));
  assert.deepEqual(thumbnailBatch(items, { needs, nativeFrames: true, skip: 'v2', attempted: new Set(['v0']) }).map(i => i.id), ['v3', 'v4', 'v5']);
});
test('previews decoded in the page run alone', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c', native: true }];
  assert.deepEqual(thumbnailBatch(items, { needs, nativeFrames: true }).map(i => i.id), ['a']);
  assert.deepEqual(thumbnailBatch([{ id: 'n', native: true }, { id: 'p' }, { id: 'q', native: true }], { needs, nativeFrames: true }).map(i => i.id), ['n']);
  // Without FFmpeg (web, iOS) even library files are decoded in the page, one at a time.
  assert.deepEqual(thumbnailBatch([{ id: 'n', native: true }, { id: 'm', native: true }], { needs }).map(i => i.id), ['n']);
});
