import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFolderName, sourceFolderGroups, placeInFolder, placeInFolders, moveToFolder } from '../src/collections.mjs';

test('source folder name uses the shared directory-picker root', () => {
  assert.equal(sourceFolderName([{ webkitRelativePath: 'Movies/clip.mp4' }, { webkitRelativePath: 'Movies/nested/deep.mkv' }]), 'Movies');
  assert.equal(sourceFolderName([{ webkitRelativePath: 'Shows\\episode.mp4' }]), 'Shows');
  assert.equal(sourceFolderName([{ webkitRelativePath: '' }, { name: 'loose.mp4' }]), '');
  assert.equal(sourceFolderName([{ webkitRelativePath: 'A/one.mp4' }, { webkitRelativePath: 'B/two.mp4' }]), '');
});

test('source folder groups keep root files together and lift first-level subfolders', () => {
  const groups = sourceFolderGroups([
    { webkitRelativePath: 'Movies/clip.mp4', name: 'clip.mp4' },
    { webkitRelativePath: 'Movies/Action/one.mkv', name: 'one.mkv' },
    { webkitRelativePath: 'Movies/Action/2024/two.mov', name: 'two.mov' },
    { webkitRelativePath: 'Movies/Drama/three.mp4', name: 'three.mp4' },
    { name: 'loose.mp4' },
  ]);
  assert.deepEqual(groups.map(group => [group.name, group.files.map(file => file.name)]), [
    ['Movies', ['clip.mp4']],
    ['Action', ['one.mkv', 'two.mov']],
    ['Drama', ['three.mp4']],
  ]);
});

test('placeInFolders creates exclusive folders and focuses the imported root', () => {
  const placed = placeInFolders([], [
    { name: 'Movies', ids: ['root'] },
    { name: 'Action', ids: ['nested'] },
  ], 'Movies');
  assert.equal(placed.collections.length, 2);
  assert.deepEqual(placed.collections.find(c => c.name === 'Movies').ids, ['root']);
  assert.deepEqual(placed.collections.find(c => c.name === 'Action').ids, ['nested']);
  assert.equal(placed.folderId, placed.collections.find(c => c.name === 'Movies').id);
});

test('placeInFolder creates or merges exclusive folders by source name', () => {
  const created = placeInFolder([], ' Movies ', ['a', 'b']);
  assert.equal(created.collections.length, 1);
  assert.equal(created.collections[0].name, 'Movies');
  assert.equal(created.collections[0].kind, 'folder');
  assert.deepEqual(created.collections[0].ids, ['a', 'b']);
  assert.equal(created.folderId, created.collections[0].id);

  const playlist = { id: 'pl', name: 'Evening', kind: 'playlist', ids: ['a'] };
  const other = { id: 'f1', name: 'Other', kind: 'folder', ids: ['b', 'c'] };
  const merged = placeInFolder([playlist, other, created.collections[0]], 'Movies', ['b', 'd']);
  assert.equal(merged.folderId, created.folderId);
  const movies = merged.collections.find(c => c.id === created.folderId);
  const remaining = merged.collections.find(c => c.id === 'f1');
  assert.deepEqual(movies.ids, ['a', 'b', 'd']);
  assert.deepEqual(remaining.ids, ['c']);
  assert.deepEqual(merged.collections.find(c => c.id === 'pl').ids, ['a']);
});

test('moveToFolder sends videos between folders or out of folders without touching playlists', () => {
  const collections = [
    { id: 'f1', name: 'A', kind: 'folder', ids: ['one', 'two'] },
    { id: 'f2', name: 'B', kind: 'folder', ids: ['three'] },
    { id: 'pl', name: 'Mix', kind: 'playlist', ids: ['one'] },
  ];
  const toB = moveToFolder(collections, ['one'], 'f2');
  assert.deepEqual(toB.find(c => c.id === 'f1').ids, ['two']);
  assert.deepEqual(toB.find(c => c.id === 'f2').ids, ['three', 'one']);
  assert.deepEqual(toB.find(c => c.id === 'pl').ids, ['one']);
  const unfiled = moveToFolder(toB, ['one', 'two'], '');
  assert.deepEqual(unfiled.find(c => c.id === 'f1').ids, []);
  assert.deepEqual(unfiled.find(c => c.id === 'f2').ids, ['three']);
  assert.deepEqual(unfiled.find(c => c.id === 'pl').ids, ['one']);
});
