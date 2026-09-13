import test from 'node:test';
import assert from 'node:assert/strict';
import { timeLabel, sizeLabel, toVtt, clampTime, clipLoop, keepSegments, cutFilter, cutMaps, isVideo, filesFromDirectory } from '../src/media.mjs';
test('time formatting handles unknown values and long movies', () => {
  assert.equal(timeLabel(NaN),'0:00'); assert.equal(timeLabel(Infinity),'0:00'); assert.equal(timeLabel(-1),'0:00'); assert.equal(timeLabel(65.8),'1:05'); assert.equal(timeLabel(7384),'2:03:04');
});
test('seeking is clamped to a playable range', () => { assert.equal(clampTime(-10,20),0); assert.equal(clampTime(30,20),20); assert.equal(clampTime(10,Infinity),0); });
test('deleted segments keep the rest and reject emptying the file', () => {
  assert.deepEqual(keepSegments(2,5,10),[{start:0,end:2},{start:5}]);
  assert.deepEqual(keepSegments(0,4,10),[{start:4}]);
  assert.deepEqual(keepSegments(8,10,10),[{start:0,end:8}]);
  assert.equal(keepSegments(0,10,10),null);
  assert.equal(keepSegments(1,1.1,10),null);
});
test('cut filters scale each kept part and concat when needed', () => {
  assert.equal(cutFilter([{start:4}],false),'[0:v]trim=start=4.000,setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2[v0]');
  assert.deepEqual(cutMaps([{start:4}],false),['-map','[v0]']);
  assert.equal(cutFilter([{start:0,end:2},{start:5}],true),'[0:v]trim=start=0.000:end=2.000,setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2[v0];[0:v]trim=start=5.000,setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2[v1];[0:a]atrim=start=0.000:end=2.000,asetpts=PTS-STARTPTS[a0];[0:a]atrim=start=5.000,asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]');
  assert.deepEqual(cutMaps([{start:0,end:2},{start:5}],true),['-map','[v]','-map','[a]']);
});
test('SRT accepts BOM and Windows line endings without corrupting text', () => {
  const result = toVtt('\uFEFF1\r\n00:00:01,500 --> 00:00:03,000\r\nこんにちは, Videe\r\n');
  assert.match(result,/^WEBVTT\n\n/); assert.match(result,/00:00:01\.500 --> 00:00:03\.000/); assert.match(result,/こんにちは, Videe/);
});
test('WebVTT is retained; invalid subtitles are rejected', () => { const vtt='WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello'; assert.equal(toVtt(vtt),vtt); assert.throws(()=>toVtt('not subtitles')); });
test('video import is case insensitive and excludes unrelated files', () => { assert.equal(isVideo('Film.MKV'),true); assert.equal(isVideo('film.odd','video/custom'),true); assert.equal(isVideo('note.txt'),false); assert.equal(sizeLabel(1024**3),'1.0 GB'); });
test('browser folder walk collects nested videos and skips notes', async () => {
  const handle = {
    async *values() {
      yield { name: '.hidden', kind: 'directory' };
      yield { name: 'note.txt', kind: 'file', getFile: async () => ({ name: 'note.txt' }) };
      yield { name: 'nested', kind: 'directory', async *values() { yield { name: 'Clip.MP4', kind: 'file', getFile: async () => ({ name: 'Clip.MP4' }) }; } };
    }
  };
  const files = await filesFromDirectory(handle);
  assert.deepEqual(files.map(file => file.name), ['Clip.MP4']);
});
