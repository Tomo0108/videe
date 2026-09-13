import { _electron as electron } from '@playwright/test';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { accessSync, constants, readFileSync, realpathSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const userData=mkdtempSync('/tmp/videe-package-test-');
const bundle=resolve('release/mac-arm64/Videe.app/Contents');
const iconName=execFileSync('/usr/bin/plutil',['-extract','CFBundleIconFile','raw','-o','-',bundle+'/Info.plist'],{encoding:'utf8'}).trim();
assert.deepEqual(readFileSync(bundle+'/Resources/'+iconName),readFileSync('public/icons/Videe.icns'));
const app = await electron.launch({ executablePath:resolve('release/mac-arm64/Videe.app/Contents/MacOS/Videe'),args:[`--user-data-dir=${userData}`] });
try {
  const page=await app.firstWindow();
  await page.locator('.brand').waitFor();
  assert.equal(await page.evaluate(()=>typeof window.videe?.convertVideo),'function');
  assert.equal(await page.evaluate(()=>typeof window.videe?.cutVideo),'function');
  const result=await app.evaluate(({app})=>({packaged:app.isPackaged,path:app.getAppPath(),userData:app.getPath('userData')}));
  assert.equal(result.packaged,true);
  assert.equal(await page.evaluate(()=>window.videe.platform),'darwin');
  assert.equal(await page.locator('.app-header').evaluate(el=>getComputedStyle(el).getPropertyValue('-webkit-app-region')),'drag');
  await page.screenshot({path:'/tmp/videe-tahoe-mac.png'});
  assert.equal(realpathSync(result.userData),realpathSync(userData));
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  assert.equal(await page.getByRole('combobox',{name:'Repeat'}).inputValue(),'off');
  assert.equal(await page.getByAltText('Videe app icon').evaluate(async img=>{await img.decode();return img.naturalWidth===1024;}),true);
  accessSync(result.path.replace('app.asar','app.asar.unpacked')+'/node_modules/ffmpeg-static/ffmpeg',constants.X_OK);
  console.log('PASS: packaged macOS app launches in isolated storage, configured ICNS matches source, app icon and repeat settings load, native bridge and bundled FFmpeg are available.');
} finally {await app.close();rmSync(userData,{recursive:true,force:true});}
