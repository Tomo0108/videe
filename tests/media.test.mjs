import test from 'node:test';
import assert from 'node:assert/strict';
import { timeLabel, sizeLabel, toVtt, clampTime, isVideo } from '../src/media.mjs';
test('time formatting handles unknown values and long movies', () => {
  assert.equal(timeLabel(NaN),'0:00'); assert.equal(timeLabel(Infinity),'0:00'); assert.equal(timeLabel(-1),'0:00'); assert.equal(timeLabel(65.8),'1:05'); assert.equal(timeLabel(7384),'2:03:04');
});
test('seeking is clamped to a playable range', () => { assert.equal(clampTime(-10,20),0); assert.equal(clampTime(30,20),20); assert.equal(clampTime(10,Infinity),0); });
test('SRT accepts BOM and Windows line endings without corrupting text', () => {
  const result = toVtt('\uFEFF1\r\n00:00:01,500 --> 00:00:03,000\r\nこんにちは, Videe\r\n');
  assert.match(result,/^WEBVTT\n\n/); assert.match(result,/00:00:01\.500 --> 00:00:03\.000/); assert.match(result,/こんにちは, Videe/);
});
test('WebVTT is retained; invalid subtitles are rejected', () => { const vtt='WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello'; assert.equal(toVtt(vtt),vtt); assert.throws(()=>toVtt('not subtitles')); });
test('video import is case insensitive and excludes unrelated files', () => { assert.equal(isVideo('Film.MKV'),true); assert.equal(isVideo('film.odd','video/custom'),true); assert.equal(isVideo('note.txt'),false); assert.equal(sizeLabel(1024**3),'1.0 GB'); });
