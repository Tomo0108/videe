// Package the existing artwork; no new artwork or network access is required.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
if(process.platform !== 'darwin') throw new Error('Icon regeneration uses macOS sips/iconutil. Other platforms use the committed assets.');
const source = resolve('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
const output = resolve('public/icons');
mkdirSync(output,{recursive:true});
const temp = mkdtempSync(join(tmpdir(),'videe-icons-'));
const resize = (size,path,input=source) => execFileSync('sips',['-z',String(size),String(size),input,'--out',path],{stdio:'pipe'});
try {
  copyFileSync(source,resolve('public/icon.png'));
  const rounded = join(output,'icon-rounded.png');
  execFileSync('swift',['-module-cache-path',join(temp,'swift-cache'),resolve('scripts/round-icon.swift'),source,rounded],{stdio:'pipe'});
  // iOS touch icon stays opaque. Other web surfaces use the explicit silhouette.
  for(const size of [32,180,192,512]) resize(size,join(output,`icon-${size}.png`),size===180 ? source : rounded);
  const iconset = join(temp,'Videe.iconset'); mkdirSync(iconset);
  for(const size of [16,32,128,256,512]) {
    resize(size,join(iconset,`icon_${size}x${size}.png`),rounded);
    resize(size*2,join(iconset,`icon_${size}x${size}@2x.png`),rounded);
  }
  execFileSync('iconutil',['-c','icns',iconset,'-o',join(output,'Videe.icns')],{stdio:'pipe'});
  const sizes = [16,32,48,64,128,256];
  const images = sizes.map(size=>{const path=join(temp,`${size}.png`);resize(size,path,rounded);return readFileSync(path);});
  const header = Buffer.alloc(6+16*sizes.length); header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  images.forEach((png,i)=>{const entry=6+i*16;header[entry]=header[entry+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(png.length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=png.length;});
  writeFileSync(join(output,'Videe.ico'),Buffer.concat([header,...images]));
  console.log('Generated macOS ICNS, Windows ICO, web and touch icons from the existing 1024px artwork.');
} finally {rmSync(temp,{recursive:true,force:true});}
