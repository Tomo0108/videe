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

test('library rows without a current-version still need a thumbnail', () => {
  assert.equal(needsThumbnail({}), true);
  assert.equal(needsThumbnail({ thumbnail: 'data:image/jpeg;base64,xx' }), true);
  assert.equal(needsThumbnail({ thumbnail: 'data:image/jpeg;base64,xx', thumbnailVersion: THUMBNAIL_VERSION }), false);
});
