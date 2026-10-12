import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMediaInfo, playbackPlan, liveArgs, liveFilter, liveEncoderArgs, remuxArgs, codecLabel, codecName } from '../src/media.mjs';

const probe = (format, video, audio = '') => `Input #0, ${format}, from 'a':\n  Duration: 00:01:30.50, start: 0.000000, bitrate: 8000 kb/s\n  Stream #0:0[0x1](und): Video: ${video}\n${audio ? `  Stream #0:1[0x2](eng): Audio: ${audio}\n` : ''}`;

test('media info reads codec, pixel format, size and interlacing', () => {
  const info = parseMediaInfo(probe('mpegts', 'h264 (High) ([27][0][0][0] / 0x001B), yuv420p(tv, bt709, top first), 1920x1080 [SAR 1:1 DAR 16:9], 29.97 fps, 29.97 tbr', 'ac3 ([129][0][0][0] / 0x0081), 48000 Hz, 5.1(side), fltp, 384 kb/s'));
  assert.equal(info.format, 'mpegts'); assert.equal(info.duration, 90.5); assert.equal(info.bitrate, 8e6);
  assert.deepEqual({ ...info.video, rotation: 0 }, { codec: 'h264', profile: 'High', pixFmt: 'yuv420p', width: 1920, height: 1080, fps: 29.97, interlaced: true, bitDepth: 8, chroma: '420', rotation: 0 });
  assert.deepEqual(info.audio[0], { codec: 'ac3', profile: '', channels: '5.1(side)', sampleRate: 48000, language: 'eng' });
});
test('10-bit and 4:2:2 pixel formats inside parentheses are parsed', () => {
  const hevc = parseMediaInfo(probe('matroska,webm', 'hevc (Main 10), yuv420p10le(tv, bt2020nc/bt2020/smpte2084, progressive), 3840x2160, 23.98 fps'));
  assert.equal(hevc.video?.bitDepth, 10); assert.equal(hevc.video?.chroma, '420'); assert.equal(hevc.video?.interlaced, false); assert.equal(hevc.video?.height, 2160);
  const prores = parseMediaInfo(probe('mov,mp4,m4a,3gp,3g2,mj2', 'h264 (High 4:2:2) (avc1 / 0x31637661), yuv422p10le(progressive), 1280x720, 25 fps'));
  assert.equal(prores.video?.chroma, '422'); assert.equal(prores.video?.bitDepth, 10);
});
test('cover art is not mistaken for the video stream', () => {
  const info = parseMediaInfo(`Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a':\n  Duration: 00:00:10.00, start: 0.000000, bitrate: 100 kb/s\n  Stream #0:0[0x1](und): Video: mjpeg (Baseline), yuvj420p(pc), 600x600, 90k tbr (attached pic)\n  Stream #0:1[0x2](und): Video: h264 (Main), yuv420p(progressive), 640x360, 30 fps\n`);
  assert.equal(info.video?.codec, 'h264'); assert.equal(info.video?.width, 640);
});
test('playback plan picks direct, remux or live conversion like a native player', () => {
  const mp4 = parseMediaInfo(probe('mov,mp4,m4a,3gp,3g2,mj2', 'h264 (High), yuv420p(progressive), 1920x1080, 30 fps', 'aac (LC), 48000 Hz, stereo, fltp'));
  assert.equal(playbackPlan(mp4).mode, 'direct');
  const mkvAc3 = parseMediaInfo(probe('matroska,webm', 'h264 (High), yuv420p(progressive), 1920x1080, 24 fps', 'ac3, 48000 Hz, 5.1, fltp'));
  assert.deepEqual(playbackPlan(mkvAc3), { mode: 'remux', reasons: ['AC-3 audio is converted to AAC', 'Container is repackaged as MP4'], audio: 'aac', deinterlace: false });
  const interlaced = parseMediaInfo(probe('mpegts', 'h264 (High), yuv420p(tv, top first), 1920x1080, 29.97 fps'));
  assert.equal(playbackPlan(interlaced).mode, 'transcode'); assert.equal(playbackPlan(interlaced).deinterlace, true);
  const hi10 = parseMediaInfo(probe('mov,mp4,m4a,3gp,3g2,mj2', 'h264 (High 10), yuv420p10le(progressive), 1920x1080, 24 fps'));
  assert.equal(playbackPlan(hi10).mode, 'transcode');
  const hevc = parseMediaInfo(probe('matroska,webm', 'hevc (Main 10), yuv420p10le(progressive), 1920x1080, 24 fps', 'opus, 48000 Hz, stereo, fltp'));
  assert.equal(playbackPlan(hevc, { platform: 'darwin' }).mode, 'remux');
  assert.equal(playbackPlan(hevc, { platform: 'linux' }).mode, 'transcode');
  const avi = parseMediaInfo(probe('avi', 'mpeg4 (Simple Profile) (XVID / 0x44495658), yuv420p, 640x480, 25 fps', 'mp3, 44100 Hz, stereo, fltp'));
  assert.equal(playbackPlan(avi).mode, 'transcode');
});
test('live arguments seek, deinterlace and stream fragmented MP4', () => {
  const info = parseMediaInfo(probe('mpegts', 'h264 (High), yuv420p(tv, top first), 1920x1080, 29.97 fps'));
  const args = liveArgs('/v/a.ts', 12.5, info);
  assert.deepEqual(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 4), ['-ss', '12.500', '-i', '/v/a.ts']);
  assert.ok(args.includes('frag_keyframe+empty_moov+default_base_moof')); assert.equal(args.at(-1), 'pipe:1');
  assert.ok(!args.includes('-hwaccel')); assert.ok(liveArgs('/v/a.ts', 0, info, 'h264_videotoolbox').includes('-hwaccel'));
  assert.ok(!liveArgs('/v/a.ts', 0, info).includes('-ss'));
  assert.match(liveFilter(info), /^bwdif/); assert.doesNotMatch(liveFilter(parseMediaInfo(probe('avi', 'mpeg4, yuv420p, 640x480, 25 fps'))), /bwdif/);
  assert.equal(liveEncoderArgs('libx264', 60)[liveEncoderArgs('libx264', 60).indexOf('-preset') + 1], 'superfast');
  assert.equal(liveEncoderArgs('h264_nvenc', 30)[1], 'h264_nvenc');
});
test('remux keeps video, tags HEVC for QuickTime and converts audio when needed', () => {
  const hevc = parseMediaInfo(probe('matroska,webm', 'hevc (Main), yuv420p(progressive), 1920x1080, 24 fps', 'ac3, 48000 Hz, 5.1, fltp'));
  const args = remuxArgs('/v/a.mkv', playbackPlan(hevc, { platform: 'darwin' }), hevc);
  assert.ok(args.includes('hvc1')); assert.deepEqual(args.slice(-4), ['-c:a', 'aac', '-b:a', '256k']);
  assert.equal(codecLabel(hevc), 'HEVC 1080p 24fps · AC-3'); assert.equal(codecName('pcm_s16le'), 'PCM'); assert.equal(codecName('xyz'), 'XYZ');
});
