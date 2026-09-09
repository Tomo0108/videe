import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path=>readFileSync(new URL('../'+path,import.meta.url));
function pngSize(buffer){assert.equal(buffer.subarray(1,4).toString(),'PNG');return [buffer.readUInt32BE(16),buffer.readUInt32BE(20)];}
test('icons are square and consistent across web and iOS',()=>{
  assert.deepEqual(pngSize(read('public/icon.png')),[1024,1024]);
  assert.deepEqual(read('public/icon.png'),read('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  for(const size of [32,180,192,512]) assert.deepEqual(pngSize(read(`public/icons/icon-${size}.png`)),[size,size]);
  const manifest=JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.name,'Videe');
  assert.equal(manifest.short_name,'Videe');
  assert.equal(manifest.display,'standalone');
  for(const entry of manifest.icons) {
    assert.equal(pngSize(read('public/'+entry.src)).join('x'),entry.sizes);
    assert.equal(entry.purpose,'any');
    assert.doesNotMatch(entry.src,/maskable/);
  }
  const html=read('index.html').toString();
  assert.match(html,/<title>Videe<\/title>/);
  assert.match(html,/icons\/icon-180\.png/);
  assert.match(html,/apple-mobile-web-app-capable/);
  assert.doesNotMatch(html,/personal cinema|Just press play|apple-touch-icon\.png/);
  assert.match(read('public/sw.js').toString(),/videe-shell-v5/);
});
test('native package configuration uses valid multi-resolution icon containers',()=>{
  const config=JSON.parse(read('package.json')).build;
  const icns=read(config.mac.icon);assert.equal(icns.subarray(0,4).toString(),'icns');assert.equal(icns.readUInt32BE(4),icns.length);
  const ico=read(config.win.icon);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),6);
  for(let i=0;i<6;i++){const pos=6+i*16;const length=ico.readUInt32LE(pos+8),offset=ico.readUInt32LE(pos+12);assert.ok(offset+length<=ico.length);assert.deepEqual(pngSize(ico.subarray(offset,offset+length)),[ico[pos]||256,ico[pos+1]||256]);}
});
