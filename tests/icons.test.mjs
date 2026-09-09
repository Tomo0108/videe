import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
const read = path=>readFileSync(new URL('../'+path,import.meta.url));
function pngSize(buffer){assert.equal(buffer.subarray(1,4).toString(),'PNG');return [buffer.readUInt32BE(16),buffer.readUInt32BE(20)];}
function pngPixel(buffer,x,y){
  let pos=8, idat=[];
  while(pos<buffer.length){
    const length=buffer.readUInt32BE(pos), type=buffer.toString('latin1',pos+4,pos+8);
    if(type==='IDAT') idat.push(buffer.subarray(pos+8,pos+8+length));
    pos+=12+length;
    if(type==='IEND') break;
  }
  const raw=inflateSync(Buffer.concat(idat));
  const width=buffer.readUInt32BE(16), bpp=3, stride=width*bpp;
  let i=0, prev=Buffer.alloc(stride), row=Buffer.alloc(stride);
  for(let rowY=0; rowY<=y; rowY++){
    const filt=raw[i++];
    raw.copy(row,0,i,i+stride); i+=stride;
    if(filt===1) for(let c=0;c<stride;c++) row[c]=(row[c]+(c>=bpp?row[c-bpp]:0))&255;
    else if(filt===2) for(let c=0;c<stride;c++) row[c]=(row[c]+prev[c])&255;
    else if(filt===3) for(let c=0;c<stride;c++) row[c]=(row[c]+(((c>=bpp?row[c-bpp]:0)+prev[c])>>1))&255;
    else if(filt===4) for(let c=0;c<stride;c++){
      const a=c>=bpp?row[c-bpp]:0, b=prev[c], d=c>=bpp?prev[c-bpp]:0, p=a+b-d;
      const pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-d);
      row[c]=(row[c]+(pa<=pb&&pa<=pc?a:pb<=pc?b:d))&255;
    }
    prev=Buffer.from(row);
  }
  const o=x*bpp; return [prev[o],prev[o+1],prev[o+2]];
}
test('icons are square and consistent across web and iOS',()=>{
  assert.deepEqual(pngSize(read('public/icon.png')),[1024,1024]);
  assert.deepEqual(read('public/icon.png'),read('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
  for(const size of [32,180,192,512]) assert.deepEqual(pngSize(read(`public/icons/icon-${size}.png`)),[size,size]);
  const manifest=JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.name,'Videe');
  assert.equal(manifest.short_name,'Videe');
  assert.equal(manifest.display,'standalone');
  for(const entry of manifest.icons) assert.equal(pngSize(read('public/'+entry.src)).join('x'),entry.sizes);
  const anyIcon=read('public/icons/icon-192.png');
  const maskable=read('public/icons/icon-192-maskable.png');
  assert.notDeepEqual(anyIcon,maskable);
  assert.deepEqual(pngSize(maskable),[192,192]);
  assert.deepEqual(pngSize(read('public/icons/icon-512-maskable.png')),[512,512]);
  assert.deepEqual(pngSize(read('public/icons/apple-touch-icon.png')),[180,180]);
  assert.match(read('index.html').toString(),/apple-touch-icon\.png/);
  const maskableEntries=manifest.icons.filter(entry=>entry.purpose==='maskable');
  assert.ok(maskableEntries.every(entry=>entry.src.includes('maskable')));
  assert.deepEqual(pngPixel(maskable,0,0),[8,16,27]);
  assert.deepEqual(pngPixel(maskable,191,0),[8,16,27]);
  const html=read('index.html').toString();
  assert.match(html,/<title>Videe<\/title>/);
  assert.match(html,/apple-mobile-web-app-capable/);
  assert.doesNotMatch(html,/personal cinema|Just press play/);
  assert.match(read('public/sw.js').toString(),/videe-shell-v2/);
});
test('native package configuration uses valid multi-resolution icon containers',()=>{
  const config=JSON.parse(read('package.json')).build;
  const icns=read(config.mac.icon);assert.equal(icns.subarray(0,4).toString(),'icns');assert.equal(icns.readUInt32BE(4),icns.length);
  const ico=read(config.win.icon);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),6);
  for(let i=0;i<6;i++){const pos=6+i*16;const length=ico.readUInt32LE(pos+8),offset=ico.readUInt32LE(pos+12);assert.ok(offset+length<=ico.length);assert.deepEqual(pngSize(ico.subarray(offset,offset+length)),[ico[pos]||256,ico[pos+1]||256]);}
});
