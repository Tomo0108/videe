import {useEffect,useRef} from 'react';
import {readMediaBlob,type MediaItem} from './store';
export const THUMBNAIL_VERSION = 2;
export function captureFrame(video:HTMLVideoElement):Pick<MediaItem,'thumbnail'|'thumbnailVersion'> {
  if(!video.videoWidth || !video.videoHeight) throw new Error('No decoded video frame');
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
  canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const context=canvas.getContext('2d')!;
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
  context.drawImage(video,0,0,canvas.width,canvas.height);
  return {thumbnail:canvas.toDataURL('image/jpeg',.94),thumbnailVersion:THUMBNAIL_VERSION};
}
export function useThumbnails(items:MediaItem[],paused:boolean,update:(id:string,data:Partial<MediaItem>)=>void){const attempted=useRef(new Set<string>());
useEffect(()=>{if(paused)return;const item=items.find(i=>(!i.thumbnail||i.thumbnailVersion!==THUMBNAIL_VERSION)&&!attempted.current.has(`${i.id}:${i.thumbnailVersion||0}:${i.thumbnail?1:0}`));if(!item)return;const key=`${item.id}:${item.thumbnailVersion||0}:${item.thumbnail?1:0}`;let cancelled=false;let url='';const video=document.createElement('video');video.muted=true;video.preload='auto';let timer:ReturnType<typeof setTimeout>;let finish:()=>void=()=>{};
const work=async()=>{try{let src:string;if(item.native&&window.videe)src=await window.videe.getSource(item.id);else{const blob=item.blob||await readMediaBlob(item.id);if(!blob)throw Error();src=url=URL.createObjectURL(blob);}if(cancelled)return;
await new Promise<void>((resolve,reject)=>{finish=resolve;timer=setTimeout(()=>reject(Error('Thumbnail timeout')),10000);video.onerror=()=>reject(Error('Unsupported video'));video.onloadedmetadata=()=>{video.currentTime=Math.min(1,Number.isFinite(video.duration)?video.duration/10:0);};video.onseeked=()=>resolve();video.src=src;});
if(cancelled)return;const frame=captureFrame(video);attempted.current.add(key);update(item.id,{...frame,duration:Number.isFinite(video.duration)?video.duration:0});
}catch{if(!cancelled){attempted.current.add(key);update(item.id,{});}}finally{clearTimeout(timer);video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);}};void work();
return()=>{cancelled=true;clearTimeout(timer);finish();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);};},[items,paused,update]);}
