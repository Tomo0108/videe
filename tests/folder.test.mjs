import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const { collectVideoPaths } = createRequire(import.meta.url)('../electron/folder.cjs');

test('folder scan finds nested videos and skips notes, hidden files, and links', async () => {
  const root = await mkdtemp(join(tmpdir(), 'videe-folder-'));
  try {
    await mkdir(join(root, 'nested', 'deeper'), { recursive: true });
    await mkdir(join(root, '.hidden'), { recursive: true });
    await writeFile(join(root, 'Show.MP4'), 'x');
    await writeFile(join(root, 'nested', 'Inside.mkv'), 'x');
    await writeFile(join(root, 'nested', 'deeper', 'Clip.mov'), 'x');
    await writeFile(join(root, 'note.txt'), 'no');
    await writeFile(join(root, '.hidden', 'Secret.mp4'), 'x');
    await symlink(join(root, 'Show.MP4'), join(root, 'alias.mp4'));
    const found = await collectVideoPaths(root);
    assert.deepEqual(found.map(path => path.slice(root.length + 1)).sort(), ['Show.MP4', join('nested', 'Inside.mkv'), join('nested', 'deeper', 'Clip.mov')].sort());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('folder scan respects file and depth limits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'videe-folder-limit-'));
  try {
    await mkdir(join(root, 'a', 'b', 'c'), { recursive: true });
    await writeFile(join(root, 'One.mp4'), 'x');
    await writeFile(join(root, 'Two.mp4'), 'x');
    await writeFile(join(root, 'a', 'b', 'c', 'Deep.mp4'), 'x');
    assert.equal((await collectVideoPaths(root, { maxFiles: 1 })).length, 1);
    assert.equal((await collectVideoPaths(root, { maxDepth: 1 })).includes(join(root, 'a', 'b', 'c', 'Deep.mp4')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
