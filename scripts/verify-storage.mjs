import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'chromium',headless:true});
const page=await browser.newPage();
try {
 await page.route('**/storage-harness',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
 await page.goto('http://127.0.0.1:5173/storage-harness');
 const bytes=Array.from(await readFile('tests/fixtures/sample.mp4'));
 await page.evaluate(bytes=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('videe-library',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('videos',{keyPath:'id'});
  r.onsuccess=()=>{const db=r.result;const tx=db.transaction('videos','readwrite');tx.objectStore('videos').put({id:'legacy',name:'Legacy.mp4',size:bytes.length,type:'video/mp4',added:1,duration:12,position:3,favorite:true,lastPlayed:1,blob:new Blob([new Uint8Array(bytes)],{type:'video/mp4'})});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);
 }),bytes);
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'Play Legacy.mp4'}).waitFor();
 const inspect=()=>page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('videe-library');r.onsuccess=()=>{const db=r.result;const tx=db.transaction(['videos','media']);let videos,media;tx.objectStore('videos').getAll().onsuccess=e=>videos=e.target.result;tx.objectStore('media').getAll().onsuccess=e=>media=e.target.result;tx.oncomplete=()=>{db.close();resolve({version:db.version,videos:videos.map(v=>({id:v.id,position:v.position,favorite:v.favorite,blob:!!v.blob})),media:media.map(v=>({id:v.id,size:v.blob.size}))});};tx.onerror=()=>reject(tx.error);};}));
 let result=await inspect();assert.equal(result.version,2);assert.deepEqual(result.videos,[{id:'legacy',position:3,favorite:true,blob:false}]);assert.equal(result.media[0].size,bytes.length);
 await page.evaluate(()=>{window.mediaWrites=0;const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='media')window.mediaWrites++;return original.apply(this,args);};});
 await page.getByRole('button',{name:'Play Legacy.mp4'}).click();
 await page.waitForFunction(()=>{const v=document.querySelector('video');return v?.readyState>=2&&v.currentTime>=3;});
 await page.locator('video').evaluate(v=>{v.pause();v.currentTime=5;});
 await page.getByRole('button',{name:'Back to library'}).click();
 result=await inspect();assert.ok(result.videos[0].position>=4.9);assert.equal(await page.evaluate(()=>window.mediaWrites),0);
 await page.reload();await page.getByRole('button',{name:'Play Legacy.mp4'}).click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
 await page.getByRole('button',{name:'Back to library'}).click();
 await page.getByLabel('Options for Legacy.mp4').click();await page.getByRole('button',{name:'Remove from library',exact:true}).click();await page.getByRole('button',{name:'Remove',exact:true}).click();
 await page.getByRole('heading',{name:'Videe',exact:true}).waitFor();result=await inspect();assert.deepEqual(result.videos,[]);assert.deepEqual(result.media,[]);
 console.log('PASS: v1 migration preserves video, favorite and resume; metadata updates never rewrite media; lazy playback after reload; atomic media deletion.');
} finally {await browser.close();}
