import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { keepSegments, cutFilter, cutMaps } from '../src/media.mjs';

test('ffmpeg deletes a middle segment from the sample fixture', async () => {
  const parts = keepSegments(2, 4, 12);
  assert.ok(parts);
  const dir = await mkdtemp(join(tmpdir(), 'videe-cut-'));
  const out = join(dir, 'out.mp4');
  try {
    const result = spawnSync(ffmpeg, ['-hide_banner','-nostdin','-y','-i','tests/fixtures/sample.mp4','-filter_complex',cutFilter(parts, true),...cutMaps(parts, true),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',out], {encoding:'utf8'});
    assert.equal(result.status, 0, (result.stderr || '').slice(-2500));
    assert.ok((await stat(out)).size > 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
