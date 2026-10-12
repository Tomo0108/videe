import test from 'node:test';
import assert from 'node:assert/strict';
import { timecode, parseTimecode, normalizeSegments, splitSegments, segmentsDuration, exportEncodeArgs, exportCopySegmentArgs, concatList } from '../src/media.mjs';

test('timecodes are frame accurate and round trip', () => {
  assert.equal(timecode(0, 30), '00:00:00:00'); assert.equal(timecode(3661.5, 30), '01:01:01:15'); assert.equal(timecode(NaN, 24), '00:00:00:00');
  assert.equal(parseTimecode('01:01:01:15', 30), 3661.5); assert.equal(parseTimecode('1:05', 30), 65); assert.equal(parseTimecode('00:00:02.25'), 2.25); assert.equal(parseTimecode('12.5'), 12.5);
  assert.ok(Number.isNaN(parseTimecode('abc')));
  for (const t of [0, 1 / 30, 59.9, 3599.5]) assert.equal(parseTimecode(timecode(t, 30), 30), Math.floor(t * 30 + 1e-6) / 30);
});
test('segments are sorted, clamped and merged', () => {
  assert.deepEqual(normalizeSegments([{ id: 'b', start: 8, end: 12 }, { id: 'a', start: 5, end: 2 }, { id: 'c', start: 9, end: 11 }, { id: 'd', start: 3, end: 3.01 }], 10).map(({ start, end }) => [start, end]), [[2, 5], [8, 10]]);
  assert.equal(segmentsDuration([], 30), 30); assert.equal(segmentsDuration([{ start: 0, end: 5 }, { start: 10, end: 12 }], 30), 7);
});
test('split divides the segment under the playhead', () => {
  let n = 0; const id = () => `s${++n}`;
  const whole = splitSegments([], 4, 10, id);
  assert.deepEqual(whole, [{ id: 's1', start: 0, end: 4 }, { id: 's2', start: 4, end: 10 }]);
  assert.equal(splitSegments(whole, 4, 10, id), whole);
  assert.deepEqual(splitSegments(whole, 7, 10, id).map(s => [s.start, s.end]), [[0, 4], [4, 7], [7, 10]]);
});
test('re-encode export trims, concatenates and applies output options', () => {
  const args = exportEncodeArgs({ segments: [{ start: 1, end: 2 }, { start: 5, end: 10 }], codec: 'h264', quality: 'high', height: 720, rotate: 90, fps: 30 }, { duration: 10, hasAudio: true });
  const graph = args[1];
  assert.match(graph, /\[0:V:0\]trim=start=1\.000:end=2\.000,setpts=PTS-STARTPTS\[v0\]/);
  assert.match(graph, /\[0:V:0\]trim=start=5\.000,setpts/);
  assert.match(graph, /\[v0\]\[a0\]\[v1\]\[a1\]concat=n=2:v=1:a=1\[cv\]\[a\]/);
  assert.match(graph, /scale=-2:'min\(720,ih\)',transpose=1,fps=30/);
  assert.deepEqual(args.slice(-8), ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high']);
  assert.ok(args.includes('[a]')); assert.ok(args.includes('18'));
  const silent = exportEncodeArgs({ segments: [], codec: 'hevc', audio: false }, { duration: 10, hasAudio: true });
  assert.ok(silent.includes('-an')); assert.ok(silent.includes('libx265')); assert.ok(silent.includes('hvc1'));
  assert.ok(exportEncodeArgs({ segments: [], encoder: 'h264_videotoolbox', quality: 'small' }, { duration: 5, hasAudio: false }).includes('6M'));
});
test('lossless export copies each segment and builds a safe concat list', () => {
  assert.deepEqual(exportCopySegmentArgs('/in.mkv', { start: 2, end: 5 }, '/out.mkv', false).slice(3, 9), ['-ss', '2.000', '-i', '/in.mkv', '-t', '3.000']);
  assert.equal(concatList(["/tmp/a.mp4", "/tmp/it's.mp4"]), "file '/tmp/a.mp4'\nfile '/tmp/it'\\''s.mp4'\n");
});
