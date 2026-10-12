import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser = await chromium.launch({channel:'chromium',headless:true});
try {
 const page = await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173');
 await page.locator('input[type=file]').first().setInputFiles({name:'Continuity.mp4',mimeType:'video/mp4',buffer:await readFile('tests/fixtures/sample.mp4')});
 await page.waitForFunction(()=>document.querySelector('.player-view video')?.readyState>=2);
 await page.evaluate(async()=>{
  const v=document.querySelector('.player-view video');window.originalVideo=v;window.loads=0;window.encodes=0;window.metadataWrites=0;window.progressWrites=0;
  v.addEventListener('loadstart',()=>window.loads++);
  const encode=HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL=function(...args){window.encodes++;return encode.apply(this,args);};
  const put=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){if(this.name==='videos'||this.name==='media')window.metadataWrites++;if(this.name==='progress')window.progressWrites++;return put.apply(this,args);};
  v.loop=true;await v.play();
 });
 await page.getByRole('button',{name:'Back to library',exact:true}).click();
 await page.getByRole('region',{name:'Mini player',exact:true}).waitFor();
 const checkpoints=await page.evaluate(()=>window.progressWrites);
 await page.waitForFunction(n=>window.progressWrites>n,checkpoints,{timeout:20000});
 await page.screenshot({path:'/tmp/videe-mini-player.png'});
 const assertContinuous=async()=>assert.deepEqual(await page.evaluate(()=>({same:window.originalVideo===document.querySelector('.player-view video'),paused:window.originalVideo.paused,loads:window.loads})),{same:true,paused:false,loads:0});
 await assertContinuous();
 await page.locator('.library-sidebar').getByRole('button',{name:'Favorites',exact:true}).click();
 await assertContinuous();
 await page.getByRole('button',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await assertContinuous();
 await page.getByRole('button',{name:'Restore player',exact:true}).click();
 await assertContinuous();
 await page.getByRole('button',{name:'Back to library',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 const bounds=await page.locator('.mini-player').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390);
 await page.locator('.mini-controls').getByRole('button',{name:'Pause',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.originalVideo.paused),true);
 const position=await page.evaluate(()=>window.originalVideo.currentTime);
 assert.ok(position>0);
 await page.getByRole('button',{name:'Close player',exact:true}).click();
 await page.locator('.mini-player').waitFor({state:'detached'});
 assert.deepEqual(await page.evaluate(()=>({encodes:window.encodes,writes:window.metadataWrites})),{encodes:0,writes:0});
 const stored=await page.evaluate(async()=>{const {readLibrary}=await import('/src/store.ts');return (await readLibrary())[0].position;});
 assert.ok(Math.abs(stored-position)<0.1);
 assert.deepEqual(errors,[]);
 // Both prior schema versions upgrade without losing media or saved position.
 for(const version of [1,2]) {
  const ctx=await browser.newContext();const p=await ctx.newPage();
  await p.route('**/migration',r=>r.fulfill({contentType:'text/html',body:'<html></html>'}));await p.goto('http://127.0.0.1:5173/migration');
  await p.evaluate(version=>new Promise((resolve,reject)=>{const r=indexedDB.open('videe-library',version);r.onupgradeneeded=()=>{r.result.createObjectStore('videos',{keyPath:'id'});if(version===2)r.result.createObjectStore('media',{keyPath:'id'});};r.onsuccess=()=>{const db=r.result;const tx=db.transaction(version===1?['videos']:['videos','media'],'readwrite');const blob=new Blob(['media']);tx.objectStore('videos').put({id:'legacy',name:'Legacy.mp4',position:7,...(version===1?{blob}:{})});if(version===2)tx.objectStore('media').put({id:'legacy',blob});tx.oncomplete=()=>{db.close();resolve();};};r.onerror=()=>reject(r.error);}),version);
  const result=await p.evaluate(async()=>{const s=await import('/src/store.ts');const before=await s.readLibrary();await s.savePosition('legacy',9);const after=await s.readLibrary();const blob=await s.readMediaBlob('legacy');await s.saveItem({...after[0],position:0});const reset=await s.readLibrary();await s.removeItem('legacy');return {before:before[0].position,after:after[0].position,blob:await blob.text(),reset:reset[0].position,remaining:(await s.readLibrary()).length};});
  assert.deepEqual(result,{before:7,after:9,blob:'media',reset:0,remaining:0});await ctx.close();
 }
 console.log('PASS: persistent video across navigation, mini controls/mobile bounds, zero playback JPEG/metadata writes, progress and v1/v2 migration.');
} finally {await browser.close();}
