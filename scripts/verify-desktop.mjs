import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { parseMediaInfo } from '../src/media.mjs';
const userData = await mkdtemp('/tmp/videe-electron-test-');
const app = await electron.launch({ args: ['.'], env: {...process.env,VIDEE_TEST_USER_DATA:userData} });
const page = await app.firstWindow(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.getByRole('button',{name:'Open folder',exact:true}).waitFor();
  const gpuStatus = await page.evaluate(() => window.videe?.getGpuStatus());
  assert.equal(typeof gpuStatus?.videoDecode, 'string');
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},resolve('tests/fixtures/legacy.avi'));
  await page.getByRole('button',{name:'Open video',exact:true}).click();
  // Unsupported codecs stream through live conversion instead of failing.
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.currentSrc.startsWith('videe://live/')&&!v.error&&v.readyState>=2&&v.currentTime>0.2;},null,{timeout:60000});
  await page.locator('.engine-badge').waitFor();
  await page.locator('.transport-play').click();
  await page.waitForFunction(()=>document.querySelector('video')?.paused);
  await page.getByRole('slider',{name:'Playback position',exact:true}).fill('6');
  await page.waitForFunction(()=>{const v=document.querySelector('video');const s=document.querySelector('.seek-play');return v&&v.currentSrc.includes('t=6')&&v.readyState>=2&&Math.abs(Number(s.value)-6)<0.3;},null,{timeout:20000});
  // Playback details offer a seekable optimized copy.
  await page.getByRole('button',{name:'Playback details',exact:true}).first().click();
  await page.getByText('Smooth playback',{exact:false}).first().waitFor();
  await page.getByRole('button',{name:'Create optimized copy',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.currentSrc.includes('converted=')&&!v.error&&v.readyState>=2;},null,{timeout:60000});
  assert.match(await page.locator('video').getAttribute('src'),/^videe:\/\/media\//);
  await page.getByRole('slider',{name:'Playback position',exact:true}).fill('6');
  await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&Math.abs(video.currentTime-6)<0.2;},null,{timeout:5000});
  // Editor: keep 1–3 s and export a new file.
  const exported = resolve(userData, 'clip.mp4');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exported);
  await page.getByRole('button',{name:'Edit video',exact:true}).click();
  await page.locator('.editor-panel').waitFor();
  await page.locator('video').evaluate(v=>{v.pause();v.currentTime=1;});
  await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-1)<0.05);
  await page.getByRole('button',{name:/^Mark in/}).click();
  await page.locator('video').evaluate(v=>{v.currentTime=3;});
  await page.waitForFunction(()=>Math.abs(document.querySelector('video').currentTime-3)<0.05);
  await page.getByRole('button',{name:/^Mark out/}).click();
  await page.getByRole('button',{name:'Export…',exact:true}).click();
  await page.locator('dialog').getByRole('button',{name:'Export',exact:true}).click();
  for (let i = 0; i < 120 && !(await stat(exported).catch(()=>null))?.size; i++) await new Promise(r=>setTimeout(r,500));
  await page.waitForFunction(()=>!document.querySelector('.editor-job'),null,{timeout:60000});
  const probe = spawnSync(ffmpeg, ['-hide_banner','-i',exported], {encoding:'utf8'}).stderr;
  const length = parseMediaInfo(probe).duration;
  assert.ok(length > 1.8 && length < 2.3, `exported clip is ${length}s`);
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  await page.reload();
  await page.getByRole('button',{name:'Play clip.mp4',exact:true}).waitFor();
  await page.getByRole('button',{name:'Play legacy.avi',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2;});
  assert.deepEqual(errors,[]);
  console.log('PASS: native file selection, live conversion of unsupported codecs, optimized copy, editor export, real playback, range seek, registry persistence, isolated renderer.');
} catch(error) { console.error('Page errors:',errors);  console.error((await page.locator('body').innerText()).slice(0,1500)); await page.screenshot({path:'/tmp/videe-desktop-failure.png'}); throw error; } finally { await app.close(); await rm(userData,{recursive:true,force:true}); }
