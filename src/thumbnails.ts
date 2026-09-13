import {useEffect,useRef,useState} from 'react';
import {readMediaBlob,type MediaItem} from './store';
export const THUMBNAIL_VERSION = 2;
export function needsThumbnail(item: Pick<MediaItem,'thumbnail'|'thumbnailVersion'>) {
  return !item.thumbnail || item.thumbnailVersion !== THUMBNAIL_VERSION;
}
export function needsPreview(item: Pick<MediaItem,'thumbnail'|'thumbnailVersion'|'duration'>) {
  return needsThumbnail(item) || !(item.duration > 0);
}
export function thumbnailSeekTime(duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, duration / 10);
}
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
function abortError() {
  return new DOMException('Aborted', 'AbortError');
}
function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}
function whenReady(video: HTMLVideoElement, event: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const stop = () => {
      video.removeEventListener(event, ok);
      video.removeEventListener('error', fail);
      signal.removeEventListener('abort', cancel);
    };
    const ok = () => { stop(); resolve(); };
    const fail = () => { stop(); reject(new Error('Unsupported video')); };
    const cancel = () => { stop(); reject(abortError()); };
    video.addEventListener(event, ok, { once: true });
    video.addEventListener('error', fail, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
  });
}
function waitForFrame(video: HTMLVideoElement, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let tries = 0;
    const stop = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => { stop(); reject(abortError()); };
    const timer = setTimeout(() => { stop(); reject(new Error('Thumbnail timeout')); }, 20000);
    signal.addEventListener('abort', cancel, { once: true });
    const probe = () => {
      if (signal.aborted) return;
      if (video.videoWidth && video.videoHeight) { stop(); resolve(); return; }
      if (++tries > 24) { stop(); reject(new Error('No decoded video frame')); return; }
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(() => probe());
      else requestAnimationFrame(() => requestAnimationFrame(probe));
    };
    probe();
  });
}
async function waitForPaint(video: HTMLVideoElement, signal: AbortSignal) {
  if (video.readyState < 1) await whenReady(video, 'loadedmetadata', signal);
  const time = thumbnailSeekTime(video.duration);
  if (time && Math.abs(video.currentTime - time) >= 0.05) {
    const seeked = whenReady(video, 'seeked', signal);
    video.currentTime = time;
    await seeked;
  } else if (video.readyState < 2) {
    await whenReady(video, 'loadeddata', signal);
  }
  try {
    await video.play();
    video.pause();
  } catch { /* Muted offscreen playback can fail; a seeked frame may still be enough. */ }
  await waitForFrame(video, signal);
}
async function sourceFor(item: MediaItem) {
  if (item.native && window.videe) return { src: await window.videe.getSource(item.id), local: false };
  const blob = item.blob || await readMediaBlob(item.id);
  if (!blob) throw new Error('Missing video data');
  return { src: URL.createObjectURL(blob), local: true };
}
function attachCaptureVideo() {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.tabIndex = -1;
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  Object.assign(video.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none' });
  document.body.append(video);
  return video;
}
export function useThumbnails(items:MediaItem[],paused:boolean,update:(id:string,data:Partial<MediaItem>)=>void){
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const attempted = useRef(new Set<string>());
  const [, kick] = useState(0);
  const nextId = paused ? '' : items.find(item => needsPreview(item) && !attempted.current.has(item.id))?.id || '';
  useEffect(() => {
    if (!nextId) return;
    const item = itemsRef.current.find(entry => entry.id === nextId);
    if (!item) return;
    const abort = new AbortController();
    let local = '';
    const video = attachCaptureVideo();
    const run = async () => {
      try {
        const source = await sourceFor(item);
        if (abort.signal.aborted) { if (source.local) URL.revokeObjectURL(source.src); return; }
        local = source.local ? source.src : '';
        if (source.src.startsWith('videe:')) video.crossOrigin = 'anonymous';
        video.src = source.src;
        if (video.readyState < 1) await whenReady(video, 'loadedmetadata', abort.signal);
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        if (abort.signal.aborted) return;
        if (needsThumbnail(item)) {
          await waitForPaint(video, abort.signal);
          if (abort.signal.aborted) return;
          update(item.id, {...captureFrame(video), duration});
        } else if (duration > 0) {
          update(item.id, { duration });
        }
      } catch (error) {
        if (abort.signal.aborted || isAbort(error)) return;
        attempted.current.add(item.id);
        kick(value => value + 1);
      } finally {
        video.removeAttribute('src');
        video.load();
        video.remove();
        if (local) URL.revokeObjectURL(local);
      }
    };
    void run();
    return () => abort.abort();
  }, [nextId, update]);
}
