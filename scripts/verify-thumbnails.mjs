import {chromium} from '@playwright/test';
import ffmpeg from 'ffmpeg-static';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir=await mkdtemp('/tmp/videe-thumb-');
const browser=await chromium.launch({channel:'chromium',headless:true});
try {
execFileSync(ffmpeg,['-f','lavfi','-i','testsrc2=size=1920x1080:rate=1','-t','2','-c:v','libx264','-pix_fmt','yuv420p',dir+'/hd.mp4'],{stdio:'ignore'});
const page=await browser.newPage({viewport:{width:1280,height:850},deviceScaleFactor:2});await page.goto('http://127.0.0.1:5173');await page.locator('input[type=file]').first().setInputFiles(dir+'/hd.mp4');await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);await page.getByRole('button',{name:'Back to library',exact:true}).click();
const size=()=>page.locator('.video-thumbnail img').evaluate(async img=>{await img.decode();return [img.naturalWidth,img.naturalHeight];});await page.locator('.video-thumbnail img').waitFor();assert.deepEqual(await size(),[1600,900]);
// Simulate a library record containing the previous low-resolution cache.
await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('videe-library');r.onsuccess=()=>{const db=r.result;const tx=db.transaction('videos','readwrite');const store=tx.objectStore('videos');store.openCursor().onsuccess=e=>{const cursor=e.target.result;if(!cursor)return;const canvas=document.createElement('canvas');canvas.width=480;canvas.height=270;cursor.update({...cursor.value,thumbnail:canvas.toDataURL('image/jpeg',.75),thumbnailVersion:undefined});};tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};}));
await page.reload();await page.waitForFunction(()=>document.querySelector('.video-thumbnail img')?.naturalWidth===1600);assert.deepEqual(await size(),[1600,900]);
await page.reload();await page.locator('.video-thumbnail img').waitFor();assert.deepEqual(await size(),[1600,900]);await page.screenshot({path:'/tmp/videe-thumbnails-retina.png'});
// Low-resolution sources must never be upscaled.
await page.locator('input[type=file]').first().setInputFiles('tests/fixtures/sample.mp4');await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);const sourceSize=await page.locator('video').evaluate(v=>[v.videoWidth,v.videoHeight]);await page.getByRole('button',{name:'Back to library',exact:true}).click();const thumb=page.getByRole('button',{name:'Play sample.mp4',exact:true}).locator('img');await thumb.waitFor();assert.deepEqual(await thumb.evaluate(async i=>{await i.decode();return [i.naturalWidth,i.naturalHeight];}),sourceSize);
console.log('PASS: 1600×900 HD thumbnail, automatic legacy cache replacement, persistence, Retina rendering, no upscaling of small sources.');
}finally{await browser.close();await rm(dir,{recursive:true,force:true});}
