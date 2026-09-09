import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'chromium',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:940}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const fits=async selector=>{const r=await page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth};});assert.ok(r.left>=0&&r.right<=r.width,`${selector} fits horizontally: ${JSON.stringify(r)}`);};
try {
  await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button',{name:'Open video',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/videe-tahoe-empty.png',animations:'disabled'});
  const buffer=await readFile('tests/fixtures/sample.mp4');
  await page.locator('input[type=file]').first().setInputFiles([{name:'A long video title to verify truncation.mp4',mimeType:'video/mp4',buffer},{name:'Second.mp4',mimeType:'video/mp4',buffer}]);
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  await page.getByRole('button',{name:'Back to library'}).click();
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:940});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('.file-menu summary').first().click();await fits('.file-menu[open] .menu-panel');
    await page.getByRole('button',{name:'Video info',exact:true}).click();await fits('dialog');
    await page.keyboard.press('Escape');
  }
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('combobox',{name:'Appearance'}).selectOption('dark');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.screenshot({path:'/tmp/videe-tahoe-settings-dark.png',animations:'disabled'});
  await page.keyboard.press('Escape');
  await page.screenshot({path:'/tmp/videe-tahoe-library-dark.png',animations:'disabled'});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await page.locator('.library-sidebar').evaluate(el=>getComputedStyle(el).backdropFilter),'none');
  assert.ok(await page.locator('.library-sidebar').evaluate(el=>!getComputedStyle(el).backgroundColor.startsWith('rgba')));
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('combobox',{name:'Appearance'}).selectOption('light');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  assert.equal(await page.locator('.setting-row').first().evaluate(el=>getComputedStyle(el).fontSize),'13px');
  assert.equal(await page.locator('.modal-head h2').evaluate(el=>getComputedStyle(el).fontSize),'17px');
  await page.screenshot({path:'/tmp/videe-tahoe-settings-light.png',animations:'disabled'});
  await page.keyboard.press('Escape');
  await page.screenshot({path:'/tmp/videe-tahoe-library-light.png',animations:'disabled'});
  await page.locator('.video-open').first().click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  for(const size of [{width:320,height:700},{width:390,height:844},{width:844,height:390},{width:1440,height:940}]) {
    await page.setViewportSize(size);await fits('.player-controls');
    assert.ok(await page.locator('.player-controls').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
    await page.getByRole('button',{name:'Settings',exact:true}).click();await fits('dialog');
    const expected=size.width<=700?'17px':'13px';
    assert.equal(await page.locator('.setting-row').first().evaluate(el=>getComputedStyle(el).fontSize),expected);
    if(size.width===390) await page.screenshot({path:'/tmp/videe-type-mobile.png',animations:'disabled'});
    assert.ok(await page.locator('dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
    await page.keyboard.press('Escape');
  }
  await page.screenshot({path:'/tmp/videe-tahoe-player.png',animations:'disabled'});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  assert.equal(await page.locator('.setting-row').first().evaluate(el=>getComputedStyle(el).fontSize),'26px');
  await fits('dialog');
  assert.ok(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.screenshot({path:'/tmp/videe-type-large.png',animations:'disabled'});
  await page.evaluate(()=>document.documentElement.style.fontSize='');
  assert.deepEqual(errors,[]);
  console.log('PASS: Tahoe empty/library/player/settings, light/dark, menu bounds at 320/390/768/1440px, portrait/landscape controls, opaque accessibility fallback, no runtime errors.');
} finally {await browser.close();}
