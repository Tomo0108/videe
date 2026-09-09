import ffmpeg from 'ffmpeg-static';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('tests/fixtures',{recursive:true});
for (const args of [
  ['-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','12','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','tests/fixtures/sample.mp4'],
  ['-i','tests/fixtures/sample.mp4','-c:v','mpeg4','-c:a','pcm_s16le','tests/fixtures/legacy.avi']
]) { const result = spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'}); if(result.status!==0) process.exit(result.status||1); }
