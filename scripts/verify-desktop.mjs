import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
const userData = await mkdtemp('/tmp/videe-electron-test-');
const app = await electron.launch({ args: ['.'], env: {...process.env,VIDEE_TEST_USER_DATA:userData} });
const page = await app.firstWindow(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.getByRole('button',{name:'Open folder',exact:true}).waitFor();
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},resolve('tests/fixtures/legacy.avi'));
  await page.getByRole('button',{name:'Open folder',exact:true}).click();
  await page.getByRole('button',{name:'Convert & play',exact:true}).waitFor();
  await page.getByRole('button',{name:'Convert & play',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.currentSrc.includes("converted=")&&!v.error&&v.readyState>=2&&v.currentTime>0.2;},null,{timeout:60000});
  await page.locator('.transport-play').click();
  await page.waitForFunction(()=>document.querySelector('video')?.paused);
  await page.getByRole('slider',{name:'Playback position',exact:true}).fill('6');
  await page.waitForFunction(()=>{const video=document.querySelector('video');return video&&Math.abs(video.currentTime-6)<0.2;},null,{timeout:5000});
  assert.match(await page.locator('video').getAttribute('src'),/^videe:\/\/media\//);
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  await page.reload();
  await page.locator('.video-title').click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2;});
  assert.deepEqual(errors,[]);
  console.log('PASS: native AVI selection, unsupported-codec detection, FFmpeg conversion, real playback, range seek, registry persistence, isolated renderer.');
} catch(error) { console.error('Page errors:',errors);  console.error((await page.locator('body').innerText()).slice(0,1500)); await page.screenshot({path:'/tmp/videe-desktop-failure.png'}); throw error; } finally { await app.close(); await rm(userData,{recursive:true,force:true}); }
