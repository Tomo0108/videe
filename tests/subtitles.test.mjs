import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { parseSubtitleStreams, toVtt } from '../src/media.mjs';

test('ffmpeg extracts an embedded mov_text track to WebVTT', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'videe-subs-'));
  const muxed = join(dir, 'captioned.mp4');
  const vtt = join(dir, 'out.vtt');
  try {
    const mux = spawnSync(ffmpeg, ['-hide_banner','-nostdin','-y','-i','tests/fixtures/sample.mp4','-i','tests/fixtures/subtitle.srt','-c','copy','-c:s','mov_text',muxed], { encoding: 'utf8' });
    assert.equal(mux.status, 0, (mux.stderr || '').slice(-2000));
    const probe = spawnSync(ffmpeg, ['-hide_banner','-i',muxed], { encoding: 'utf8' });
    const tracks = parseSubtitleStreams(probe.stderr);
    assert.equal(tracks.length, 1);
    const extract = spawnSync(ffmpeg, ['-hide_banner','-nostdin','-y','-i',muxed,'-map',`0:s:${tracks[0].index}`,'-f','webvtt',vtt], { encoding: 'utf8' });
    assert.equal(extract.status, 0, (extract.stderr || '').slice(-2000));
    const text = toVtt(await readFile(vtt, 'utf8'));
    assert.match(text, /^WEBVTT/);
    assert.match(text, /Videe · 字幕のテスト/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
