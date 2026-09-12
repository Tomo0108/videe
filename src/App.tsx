import {ChoiceMenu} from './ChoiceMenu';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownWideNarrow, LockKeyholeOpen, LockKeyhole, Loader2, Repeat, Repeat1, Clock3, LayoutGrid, List, Info, SkipBack, ArrowLeft, Captions, Film, FolderOpen, Heart, Maximize, MoreHorizontal, Pause, PictureInPicture2, Play, Plus, RotateCcw, RotateCw, Search, Settings2, SkipForward, Trash2, Upload, Volume2, VolumeX, X } from 'lucide-react';
import { normalizePreferences, nextOnEnded, type Preferences } from './preferences.mjs';
import appPackage from '../package.json';
import type { LucideIcon } from 'lucide-react';
import { readLibrary, readMediaBlob, renameItems, saveItem, removeItem, type MediaItem } from './store';
import { Capacitor } from '@capacitor/core';
import { isVideo, timeLabel, sizeLabel, toVtt, clampTime } from './media.mjs';
import {Organization,readCollections,importedName,type Collection} from './organization';
import {SecuritySettings,lockEnabled} from './security';
import {useThumbnails,captureFrame,THUMBNAIL_VERSION} from './thumbnails';

const KEY_LABELS: Record<string, string> = { space: '␣', left: '←', right: '→', up: '↑', down: '↓' };
function ShortcutKeys({ keys }: { keys: string[] }) {
  return <>{keys.map(key => <kbd key={key}>{KEY_LABELS[key] || key}</kbd>)}</>;
}

type View = 'all' | 'favorites' | 'continue';
type Sort = 'recent' | 'name' | 'duration' | 'size';
function getPreferences(): Preferences { try { return normalizePreferences(JSON.parse(localStorage.getItem('videe-preferences') || '{}')); } catch { return normalizePreferences(null); } }
function IconButton({ icon: Icon, label, onClick, disabled, active, className = '' }: { icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; active?: boolean; className?: string }) { return <button className={`icon-button ${active ? 'active' : ''} ${className}`} onClick={onClick} disabled={disabled} aria-pressed={active} aria-label={label} title={label}><Icon size={18} strokeWidth={1.8}/></button>; }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closed = useRef(false);
  const dismiss = useCallback(() => {
    const dialog = ref.current;
    if (closed.current || !dialog || dialog.hasAttribute('data-leaving')) return;
    if (document.documentElement.dataset.motion === 'off') { closed.current = true; onClose(); return; }
    dialog.setAttribute('data-leaving', '');
    const finish = (event?: AnimationEvent) => {
      if (event && (event.target !== dialog || event.animationName !== 'videe-sheet-out')) return;
      if (closed.current) return;
      closed.current = true;
      window.clearTimeout(timer);
      dialog.removeEventListener('animationend', finish);
      onClose();
    };
    const timer = window.setTimeout(() => finish(), 500);
    dialog.addEventListener('animationend', finish);
  }, [onClose]);
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} onCancel={e => { e.preventDefault(); dismiss(); }} onClick={e => { if(e.target === e.currentTarget) {const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();} }} aria-label={title} className="modal"><div className="modal-head"><h2>{title}</h2><IconButton icon={X} label="Close" onClick={dismiss}/></div>{children}</dialog>;
}
export default function App() {
  const [items, setItems] = useState<MediaItem[]>([]); const itemsRef = useRef(items); itemsRef.current = items;
  const [ready, setReady] = useState(false); const [view, setView] = useState<View>('all');
  const [viewSlide, setViewSlide] = useState<'in' | 'fwd' | 'back'>('in');
  const [collections,setCollections]=useState(readCollections);
  const [scope,setScope]=useState('');
  const [selected,setSelected]=useState<string[]>([]);
  const [controlsLocked,setControlsLocked]=useState(false);
  const [unlockConfirm,setUnlockConfirm]=useState(false);
  useEffect(()=>{if(!unlockConfirm)return;const timer=setTimeout(()=>setUnlockConfirm(false),3000);return()=>clearTimeout(timer);},[unlockConfirm]);
  const [loopStart,setLoopStart]=useState('0');const [loopEnd,setLoopEnd]=useState('');
  const [query, setQuery] = useState('');
  const [infoId, setInfoId] = useState<string|null>(null);
  const queue = useRef<string[]>([]); const visibleIds = useRef<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null); const [source, setSource] = useState(''); const [playing,setPlaying] = useState(false); const [position,setPosition] = useState(0); const [duration,setDuration] = useState(0);
  const [muted,setMuted] = useState(false); const [error,setError] = useState(''); const [loading,setLoading] = useState(false); const [busy,setBusy] = useState(false); const [conversion,setConversion] = useState<number | null>(null);
  const [prefs,setPrefs] = useState<Preferences>(getPreferences); const [modal,setModal] = useState<'settings'|'subtitles'|'tools'|null>(null); const [deleteId,setDeleteId] = useState<string|null>(null); const [toast,setToast] = useState(''); const [dragging,setDragging] = useState(false);
  const [ab, setAb] = useState<{a:number|null;b:number|null}>({a:null,b:null});
  const [subtitle,setSubtitle] = useState<{url:string;name:string}|null>(null); const [captions,setCaptions] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null); const stageRef = useRef<HTMLDivElement>(null); const fileRef = useRef<HTMLInputElement>(null); const subtitleRef = useRef<HTMLInputElement>(null); const activeRef = useRef(activeId); activeRef.current = activeId;
  const forceResume = useRef(false); const playAfterLoad = useRef(false); const startFromBeginning = useRef(false);
  const urls = useRef(new Map<string,string>()); const openSequence = useRef(0); const lastSave = useRef(0); const dragDepth = useRef(0);
  const active = items.find(item => item.id === activeId);
  const notify = useCallback((text: string) => setToast(text), []);
  useEffect(() => { readLibrary().then(data => setItems(data)).catch(() => notify('Could not load your library. Check browser storage permissions.')).finally(() => setReady(true)); return () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }; }, [notify]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { try { localStorage.setItem('videe-preferences', JSON.stringify(prefs)); } catch { notify('Could not save preferences. Check available storage.'); } if(videoRef.current) { videoRef.current.playbackRate = prefs.speed; videoRef.current.volume = prefs.volume; } }, [prefs, notify]);
  useEffect(() => window.videe?.onConversionProgress(({id,seconds}) => { if(id === activeRef.current) setConversion(seconds); }), []);
  useEffect(() => { if(videoRef.current?.textTracks[0]) videoRef.current.textTracks[0].mode = captions ? 'showing' : 'hidden'; }, [captions,subtitle]);
  useEffect(() => () => { if(subtitle) URL.revokeObjectURL(subtitle.url); }, [subtitle]);
  const updateItem = useCallback((id: string, changes: Partial<MediaItem>, persist = true) => {
    const item = itemsRef.current.find(i => i.id === id); if(!item) return;
    const updated = {...item,...changes}; const next = itemsRef.current.map(i => i.id === id ? updated : i); itemsRef.current = next; setItems(next);
    if(persist) void saveItem(updated).catch(() => notify('Changes could not be saved and may be lost when you close the app.'));
  }, [notify]);
  useThumbnails(items,!!activeId||busy,updateItem);
  const saveCollections=(next:Collection[])=>{try{localStorage.setItem('videe-collections',JSON.stringify(next));setCollections(next);return true;}catch{notify('Could not save collections.');return false;}};
  const fileIntoScope=(ids:string[])=>{if(!collections.some(c=>c.id===scope)||!ids.length)return;saveCollections(collections.map(c=>c.id===scope?{...c,ids:[...new Set([...c.ids,...ids])]}:c));};
  const batchRename=async(names:Map<string,string>)=>{await renameItems(names);const next=itemsRef.current.map(i=>names.has(i.id)?{...i,originalName:i.originalName||i.name,name:names.get(i.id)!}:i);itemsRef.current=next;setItems(next);};
  const saveProgress = useCallback(() => { const video = videoRef.current; if(activeRef.current && video && Number.isFinite(video.currentTime)) updateItem(activeRef.current, {position: video.ended ? 0 : video.currentTime}); }, [updateItem]);
  useEffect(() => { const handler = () => { if(document.visibilityState === 'hidden') saveProgress(); }; document.addEventListener('visibilitychange',handler); return () => document.removeEventListener('visibilitychange',handler); }, [saveProgress]);
  const openItem = useCallback(async (item: MediaItem, continuePlayback = false, resumePlayback = false) => {
    if(conversion !== null) { notify('Finish or cancel the conversion before switching videos.'); return; }
    if(!activeRef.current) queue.current = visibleIds.current;
    if(!queue.current.includes(item.id)) queue.current = [...queue.current, item.id];
    saveProgress(); forceResume.current = resumePlayback; playAfterLoad.current = continuePlayback; startFromBeginning.current = continuePlayback; const sequence = ++openSequence.current;
    setAb({a:null,b:null}); setActiveId(item.id); setSource(''); setPlaying(false); setError(''); setLoading(true); setPosition(0); setDuration(0); setSubtitle(null); lastSave.current = 0;
    try {
      let src: string;
      if(item.native && window.videe) src = await window.videe.getSource(item.id);
      else {
        const cached = urls.current.get(item.id);
        if(cached) src = cached;
        else {
          const blob = item.blob || await readMediaBlob(item.id);
          if(sequence !== openSequence.current) return;
          if(!blob) throw new Error('Please add this video again.');
          src = URL.createObjectURL(blob); urls.current.set(item.id,src);
          for(const [id,url] of urls.current) { if(id!==item.id && urls.current.size>2) { URL.revokeObjectURL(url); urls.current.delete(id); } }
        }
      }
      if(sequence !== openSequence.current) return;
      setSource(src); updateItem(item.id, {lastPlayed: Date.now()});
    } catch(e) { if(sequence === openSequence.current) { setError(e instanceof Error ? e.message : 'Could not open this video.'); setLoading(false); } }
  }, [conversion,notify,saveProgress,updateItem]);
  const importFiles = async (files: File[]) => {
    if(busy || !ready || controlsLocked) return;
    if(window.videe) { setBusy(true); try { await addNativeRecords(await window.videe.importFiles(files)); } catch { notify('Could not add videos. Try using Open video.'); } finally { setBusy(false); } return; }
    const importedIds:string[]=[]; setBusy(true); let first: MediaItem | undefined; let count = 0; let transient = false; let invalid = 0;
    try {
      for(const file of files) {
        if(!isVideo(file.name,file.type)) { invalid++; continue; }
        const existing = itemsRef.current.find(i => !i.native && (i.originalName||i.name) === file.name && i.size === file.size);
        if(existing) { first ||= existing; continue; }
        const item: MediaItem = { id: crypto.randomUUID(), name:importedName(file.name), originalName:file.name, size:file.size, type:file.type, blob:file, added:Date.now(), duration:0, position:0, favorite:false, lastPlayed:0 };
        try { await saveItem(item); } catch { transient = true; }
        const next = [...itemsRef.current,item]; itemsRef.current = next; setItems(next); first ||= item; count++; importedIds.push(item.id);
      }
      fileIntoScope(importedIds);
      if(transient) notify('Storage is full. Some videos are available for this session only.');
      else if(invalid) notify(`Skipped ${invalid} non-video files.`);
      else if(!count) notify(first ? 'This video is already in your library.' : 'Choose a video file.');
      if(first && !activeRef.current) { visibleIds.current = itemsRef.current.map(i=>i.id); await openItem(first); }
    } finally { setBusy(false); }
  };
  const addNativeRecords = async (picked: MediaItem[]) => {
    const fresh = picked.filter(p => !itemsRef.current.some(i => i.id === p.id)).map(p=>({...p,originalName:p.name,name:importedName(p.name)}));
    for(const item of fresh) await saveItem(item);
    fileIntoScope(fresh.map(item=>item.id));
    const next = [...itemsRef.current,...fresh]; itemsRef.current=next; setItems(next);
    if(picked[0] && !activeRef.current) { visibleIds.current = next.map(i=>i.id); await openItem(next.find(i=>i.id===picked[0].id)!); }
  };
  const pickFiles = async () => {
    if(!window.videe) { fileRef.current?.click(); return; }
    if(busy || !ready || controlsLocked) return; setBusy(true);
    try { await addNativeRecords(await window.videe.pickVideos()); }
    catch { notify('Could not add videos. Check the files and available storage.'); }
    finally { setBusy(false); }
  };
  const togglePlay = useCallback(() => { const video = videoRef.current; if(!video || !source || error) return; if(video.paused) void video.play().catch(() => notify('Could not start playback. Check the video file.')); else video.pause(); }, [source,error,notify]);
  const seek = useCallback((seconds: number) => { const video = videoRef.current; if(video && Number.isFinite(video.duration)) { video.currentTime = clampTime(seconds,video.duration); setPosition(video.currentTime); } }, []);
  const nextVideo = useCallback((offset: number) => { const index = queue.current.indexOf(activeRef.current || ''); const item = itemsRef.current.find(i => i.id === queue.current[index+offset]); if(item) void openItem(item); }, [openItem]);
  const fullscreen = useCallback(async () => { const stage = stageRef.current; if(!stage || !activeRef.current) return; try { if(document.fullscreenElement) await document.exitFullscreen(); else if(stage.requestFullscreen) await stage.requestFullscreen(); else (videoRef.current as HTMLVideoElement & {webkitEnterFullscreen?:()=>void})?.webkitEnterFullscreen?.(); } catch { notify('Full screen is not available on this device.'); } }, [notify]);
  const pictureInPicture = async () => { try { if(document.pictureInPictureElement) await document.exitPictureInPicture(); else if(videoRef.current?.requestPictureInPicture) await videoRef.current.requestPictureInPicture(); else notify('Picture in Picture is not available on this device.'); } catch { notify('Start playback, then try again.'); } };
  useEffect(() => { const handler = (e: KeyboardEvent) => { if(controlsLocked)return; if((e.target as HTMLElement).closest('input,select,textarea,button,dialog') || modal || deleteId || infoId) return; if(e.code === 'Space') { e.preventDefault(); togglePlay(); } else if(e.code === 'ArrowRight') { e.preventDefault(); seek((videoRef.current?.currentTime||0)+10); } else if(e.code === 'ArrowLeft') { e.preventDefault(); seek((videoRef.current?.currentTime||0)-10); } else if(e.key.toLowerCase()==='f') void fullscreen(); else if(e.key.toLowerCase()==='m') setMuted(value=>!value); }; document.addEventListener('keydown',handler); return () => document.removeEventListener('keydown',handler); }, [togglePlay,seek,fullscreen,modal,deleteId,infoId,controlsLocked]);
  const loaded = () => { const video = videoRef.current; if(!video || !activeId) return; const finiteDuration = Number.isFinite(video.duration) ? video.duration : 0; setDuration(finiteDuration); video.playbackRate = prefs.speed; video.volume = prefs.volume; setLoading(false); updateItem(activeId,{duration:finiteDuration}); const storedPosition = itemsRef.current.find(i=>i.id===activeId)?.position || 0; if((!startFromBeginning.current || forceResume.current) && (prefs.resume || forceResume.current) && storedPosition < finiteDuration - 2) { video.currentTime = storedPosition; setPosition(storedPosition); } if(prefs.autoplay || playAfterLoad.current) void video.play().catch(()=>{}); playAfterLoad.current = false; startFromBeginning.current = false; forceResume.current = false; };
  const handleEnded = () => {
    if(ab.a!==null&&ab.b!==null) { seek(ab.a); void videoRef.current?.play().catch(()=>notify('Press Play to resume.')); return; }
    if(activeId) updateItem(activeId,{position:0});
    const next = nextOnEnded(queue.current.indexOf(activeId || ''), queue.current.length, prefs.repeat, prefs.autoAdvance);
    const item = itemsRef.current.find(i => i.id === queue.current[next]);
    if(!item) return;
    if(item.id === activeId) { seek(0); void videoRef.current?.play().catch(()=>notify('Press Play to resume.')); }
    else void openItem(item, true);
  };
  const captureThumbnail = () => {
    const video = videoRef.current; const id = activeId;
    if(!video || !id || !video.videoWidth || itemsRef.current.find(i=>i.id===id)?.thumbnailVersion===THUMBNAIL_VERSION) return;
    const capture = () => {
      if(video !== videoRef.current || id !== activeRef.current || itemsRef.current.find(i=>i.id===id)?.thumbnailVersion===THUMBNAIL_VERSION) return;
      try { updateItem(id,captureFrame(video)); } catch { /* Some media origins restrict thumbnail extraction. */ }
    };
    if(video.requestVideoFrameCallback) video.requestVideoFrameCallback(capture); else requestAnimationFrame(()=>requestAnimationFrame(capture));
  };
  const importSubtitle = async (file?: File) => { if(!file) return; try { if(file.size > 5*1024*1024) throw new Error('Choose a subtitle file smaller than 5 MB.'); const text = toVtt(await file.text()); setSubtitle({url:URL.createObjectURL(new Blob([text],{type:'text/vtt'})),name:file.name}); setCaptions(true); } catch(e) { notify(e instanceof Error ? e.message : 'Could not load subtitles.'); } };
  const convert = async () => { if(!active?.native || !window.videe) return; setConversion(0); try { const src = await window.videe.convertVideo(active.id); setError(''); setSource(src); setLoading(true); } catch(e) { notify(e instanceof Error ? e.message : 'Could not convert this video.'); } finally { setConversion(null); } };
  const confirmDelete = async () => { if(!deleteId) return; const item = itemsRef.current.find(i=>i.id===deleteId); try { if(item?.native) await window.videe?.forgetVideo(deleteId); await removeItem(deleteId); if(activeId===deleteId) { ++openSequence.current; videoRef.current?.pause(); setActiveId(null); activeRef.current=null; setSource(''); setError(''); setLoading(false); setPosition(0); setDuration(0); setSubtitle(null); } const url=urls.current.get(deleteId); if(url) {URL.revokeObjectURL(url); urls.current.delete(deleteId);} const next=itemsRef.current.filter(i=>i.id!==deleteId); itemsRef.current=next; setItems(next); setSelected(ids=>ids.filter(id=>id!==deleteId));saveCollections(collections.map(c=>({...c,ids:c.ids.filter(id=>id!==deleteId)}))); setDeleteId(null); } catch { notify('Could not remove this video. Cancel any active conversion first.'); } };
  const filtered = useMemo(() => items
    .filter(item => (!scope || (scope==='unfiled'?!collections.some(c=>c.kind==='folder'&&c.ids.includes(item.id)):collections.find(c=>c.id===scope)?.ids.includes(item.id))) && (view !== 'favorites' || item.favorite) && (view !== 'continue' || (item.position > 0 && item.position < item.duration - 2)) && item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a,b) => collections.find(c=>c.id===scope)?.kind==='playlist' ? collections.find(c=>c.id===scope)!.ids.indexOf(a.id)-collections.find(c=>c.id===scope)!.ids.indexOf(b.id) : prefs.sort === 'name' ? a.name.localeCompare(b.name, 'en', {numeric:true}) : prefs.sort === 'duration' ? b.duration-a.duration : prefs.sort === 'size' ? b.size-a.size : (b.lastPlayed || b.added) - (a.lastPlayed || a.added)), [items,view,query,prefs.sort,scope,collections]);
  visibleIds.current = filtered.map(i=>i.id);

  const index = queue.current.indexOf(activeId || '');
  const info = items.find(item => item.id === infoId);
  const nativeShell = Boolean(window.videe) || Capacitor.isNativePlatform();
  const siteHref = import.meta.env.DEV ? '/site.html' : '/';
  const destinations = [{id:'all' as View, label:'All videos', icon:Film}, {id:'continue' as View,label:'Continue watching',icon:Clock3}, {id:'favorites' as View,label:'Favorites',icon:Heart}];
  const viewOrder: View[] = ['all', 'continue', 'favorites'];
  const selectView = (next: View) => {
    if (next === view) {setScope('');return;}
    setViewSlide(viewOrder.indexOf(next) > viewOrder.indexOf(view) ? 'fwd' : 'back');
    setView(next); setScope('');
  };
  const closePlayer = () => {
    if(conversion !== null) { notify('Cancel the conversion before returning to the library.'); return; }
    saveProgress(); videoRef.current?.pause(); ++openSequence.current;
    activeRef.current = null; setActiveId(null); setSource(''); setError(''); setLoading(false); setPlaying(false); setSubtitle(null);
  };
  const closeMenu = (element: HTMLElement) => element.closest('details')?.removeAttribute('open');
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => { root.dataset.motion = prefs.motion && !reducedMotion.matches ? 'on' : 'off'; };
    syncMotion();
    reducedMotion.addEventListener('change', syncMotion);
    const syncDark = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', dark);
    };
    syncDark();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', syncDark);
    return () => { media.removeEventListener('change', syncDark); reducedMotion.removeEventListener('change', syncMotion); };
  }, [prefs.theme, prefs.motion]);
  return <div className={`app-shell ${active ? 'watching' : 'browsing'} ${window.videe?.platform === 'darwin' ? 'native-mac' : ''}`} 
    onDragEnter={e => { e.preventDefault(); if(controlsLocked)return; if(e.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }}
    onDragOver={e => e.preventDefault()}
    onDragLeave={e => { e.preventDefault(); if(--dragDepth.current <= 0) { dragDepth.current=0; setDragging(false); } }}
    onDrop={e => { e.preventDefault(); dragDepth.current=0; setDragging(false); void importFiles(Array.from(e.dataTransfer.files)); }}>
    <input ref={fileRef} type="file" accept="video/*,.mkv,.avi,.wmv,.flv,.mpeg,.mpg,.m2ts,.mts,.ts,.vob,.mxf,.hevc,.av1" multiple hidden onChange={e => { void importFiles(Array.from(e.target.files || [])); e.target.value=''; }}/>
    <input ref={subtitleRef} type="file" accept=".srt,.vtt" hidden onChange={e => { void importSubtitle(e.target.files?.[0]); e.target.value=''; }}/>

    <header className="app-header" inert={controlsLocked}>
      {active ? <div className="player-heading"><IconButton icon={ArrowLeft} label="Back to library" onClick={closePlayer}/><h1 title={active.name}>{active.name}</h1></div>
        : <div className="brand"><img src="./icon.png" alt="Videe"/><span>Videe</span></div>}
      <div className="header-actions">
        {!active && items.length > 0 && <button className="primary-button" onClick={() => void pickFiles()} disabled={busy || !ready}>{busy ? <Loader2 size={17} className="spin"/> : <Plus size={17}/>}Open video</button>}
        <IconButton icon={LockKeyhole} label="Lock library" disabled={!lockEnabled()||conversion!==null} onClick={()=>window.dispatchEvent(new Event('videe-lock'))}/>
        <IconButton icon={Settings2} label="Settings" onClick={() => setModal('settings')}/>
      </div>
    </header>

    {!active && items.length > 0 && <aside className="library-sidebar"><nav aria-label="Library navigation" data-selected={view}><span className="nav-pill" aria-hidden="true"/>{destinations.map(({id,label,icon:Icon}) => <button key={id} aria-label={label} title={label} aria-pressed={view===id} className={view===id?'selected':''} onClick={()=>selectView(id)}><Icon size={20} aria-hidden="true"/></button>)}</nav></aside>}
    <main>
      {!active&&<div className="library-organization"><Organization items={items} collections={collections} save={saveCollections} selected={selected} select={setSelected} scope={scope} setScope={value=>{setScope(value);setView('all');setQuery('');}} rename={batchRename}/></div>}
      {active ? <section className="player-view" aria-label="Video player">
        <div className="player-stage" ref={stageRef}>
          {controlsLocked&&<div className="control-lock"><button className="screen-unlock" aria-label={unlockConfirm?'Confirm unlock':'Unlock controls'} data-confirm={unlockConfirm||undefined} onClick={()=>{if(!unlockConfirm){setUnlockConfirm(true);return;}setControlsLocked(false);setUnlockConfirm(false);}}>{unlockConfirm?<LockKeyholeOpen size={22} aria-hidden="true"/>:<LockKeyhole size={22} aria-hidden="true"/>}</button></div>}
          <div className="video-surface" inert={controlsLocked}>
            {source && <video key={source} ref={videoRef} src={source} playsInline preload="metadata" muted={muted} loop={prefs.repeat==='one' && ab.b===null} onClick={togglePlay} onLoadedMetadata={loaded} onLoadedData={captureThumbnail} onSeeked={captureThumbnail} onPlay={()=>setPlaying(true)} onPause={()=>{setPlaying(false);saveProgress();}} onWaiting={()=>setLoading(true)} onPlaying={()=>setLoading(false)} onCanPlay={()=>setLoading(false)} onTimeUpdate={()=>{const t=videoRef.current?.currentTime||0;if(ab.a!==null&&ab.b!==null&&t>=ab.b){seek(ab.a);return;}setPosition(t);if(Math.abs(t-lastSave.current)>5&&activeId){lastSave.current=t;updateItem(activeId,{position:t});}}} onEnded={handleEnded} onError={()=>{setLoading(false);setPlaying(false);setError('This video format is not supported by this player.');}}>{subtitle&&<track key={subtitle.url} kind="subtitles" src={subtitle.url} srcLang="ja" label={subtitle.name} default/>}</video>}
            {loading && !error && <div className="loading-overlay" role="status"><Loader2 size={28} className="spin"/><span className="sr-only">Loading</span></div>}
            {error && <div className="player-error"><Film size={28}/><h2>Unable to play this video</h2>
              <p>{active.native ? 'Convert to a compatible format to start watching.' : 'Choose a format supported by this device.'}</p>
              {active.native && (conversion !== null ? <><span className="conversion-status"><Loader2 size={16} className="spin"/>Converting · {timeLabel(conversion)}</span><button className="secondary-button" onClick={() => void window.videe?.cancelConversion()}>Cancel</button></>
                : <button className="primary-button" onClick={() => void convert()}>Convert & play</button>)}
              <details className="error-details"><summary>Details</summary><p>{error}</p></details>
            </div>}
          </div>
          <div className="player-controls" inert={controlsLocked}>
            <div className="seek-bar"><input aria-label="Playback position" type="range" min="0" max={duration || 1} step="0.1" value={position} disabled={!duration || !!error} onChange={e => seek(Number(e.target.value))} style={{'--progress':`${duration ? position/duration*100 : 0}%`} as React.CSSProperties}/></div>
            <div className="control-row">
              <div className="transport">
                <IconButton icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} className="transport-play" disabled={!source || !!error} onClick={togglePlay}/>
                <IconButton icon={RotateCcw} label="Back 10 seconds" disabled={!!error} onClick={() => seek(position-10)}/>
                <IconButton icon={RotateCw} label="Forward 10 seconds" disabled={!!error} onClick={() => seek(position+10)}/>
                {index > 0 && <IconButton icon={SkipBack} label="Previous video" onClick={() => nextVideo(-1)}/>}{index < queue.current.length-1 && <IconButton icon={SkipForward} label="Next video" onClick={() => nextVideo(1)}/>}
                <span className="time-label">{timeLabel(position)}<span> / {timeLabel(duration)}</span></span>
              </div>
              <div className="playback-options">
                <IconButton icon={LockKeyhole} label="Lock controls" disabled={conversion!==null} onClick={()=>{setControlsLocked(true);setUnlockConfirm(false);}}/>
                <IconButton icon={MoreHorizontal} label="Playback tools" active={ab.b!==null} onClick={()=>setModal('tools')}/>
                <IconButton icon={prefs.repeat==='one'?Repeat1:Repeat} label={`Repeat: ${prefs.repeat==='off'?'Off':prefs.repeat==='one'?'One':'All'}`} active={prefs.repeat!=='off'} onClick={()=>setPrefs({...prefs,repeat:prefs.repeat==='off'?'one':prefs.repeat==='one'?'all':'off'})}/>
                <div className="volume-control"><IconButton icon={muted || prefs.volume===0 ? VolumeX : Volume2} label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}/><input type="range" aria-label="Volume" min="0" max="1" step="0.01" value={muted ? 0 : prefs.volume} onChange={e => { setMuted(false); setPrefs({...prefs,volume:Number(e.target.value)}); }}/></div>
                <select className="speed-select" aria-label="Playback speed" value={prefs.speed} onChange={e => setPrefs({...prefs,speed:Number(e.target.value)})}>{[0.5,0.75,1,1.25,1.5,1.75,2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select>
                <button aria-label="Subtitles" title="Subtitles" className={`caption-button ${subtitle && captions ? 'active' : ''}`} onClick={() => setModal('subtitles')}><Captions size={18}/></button>
                <IconButton icon={Maximize} label="Full screen" onClick={() => void fullscreen()}/>
              </div>
            </div>
          </div>
        </div>
      </section> : items.length === 0 ? <section className="start-screen" aria-label="Open video">
        <div className="welcome-icon"><img src="./icon.png" alt=""/></div>
        <h1>Videe</h1>
        <button className="primary-button open-button" onClick={() => void pickFiles()} disabled={busy || !ready}>{busy || !ready ? <Loader2 size={17} className="spin"/> : null}Open video</button>
      </section> : <section className="library-section" aria-label="Library">
        <div className="library-header">

          <nav className="library-tabs" aria-label="Browse videos" data-selected={view}><span className="tab-pill" aria-hidden="true"/>{destinations.map(({id,label,icon:Icon})=><button key={id} aria-label={label} title={label} className={view===id?'selected':''} aria-pressed={view===id} onClick={()=>selectView(id)}><Icon size={20} aria-hidden="true"/></button>)}</nav>
          <label className="search-box"><Search size={16}/><input aria-label="Search videos" placeholder="Search" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={15}/></button>}</label>
        </div>

        {collections.find(c=>c.id===scope)?.kind==='playlist'&&<button className="secondary-button playlist-play" disabled={!filtered.length} onClick={()=>void openItem(filtered[0],true)}>Play playlist</button>}
        <div className="library-toolbar"><div><ChoiceMenu label="Sort by" trigger={<ArrowDownWideNarrow size={19}/>} value={prefs.sort} disabled={collections.find(c=>c.id===scope)?.kind==='playlist'} options={[{value:'recent',label:'Recently played'},{value:'name',label:'Name'},{value:'duration',label:'Longest first'},{value:'size',label:'Largest first'}]} onChange={value=>setPrefs({...prefs,sort:value as Sort})}/><div className="layout-switch" data-layout={prefs.layout}><span className="layout-pill" aria-hidden="true"/><IconButton icon={LayoutGrid} label="Grid view" active={prefs.layout==='grid'} onClick={()=>setPrefs({...prefs,layout:'grid'})}/><IconButton icon={List} label="List view" active={prefs.layout==='list'} onClick={()=>setPrefs({...prefs,layout:'list'})}/></div></div></div>
        {filtered.length > 0 ? <div key={`${view}-${prefs.layout}`} data-slide={viewSlide} className={`video-grid ${prefs.layout==='list'?'video-list':''}`}>{filtered.map(item => <article className="video-card" key={item.id}>
          <input className="video-select" type="checkbox" aria-label={`Select ${item.name}`} checked={selected.includes(item.id)} onChange={e=>setSelected(e.target.checked?[...selected,item.id]:selected.filter(id=>id!==item.id))}/>
          <button className="video-open" onClick={() => void openItem(item)} aria-label={`Play ${item.name}`}>
            <span className="video-preview"><span className="video-thumbnail">{item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" decoding="async"/> : <Film size={30} strokeWidth={1.2}/>}<span className="thumbnail-play"><Play size={23} fill="currentColor"/></span>{item.duration > 0 && <span className="duration-label">{timeLabel(item.duration)}</span>}{item.position > 0 && item.duration > 0 && <span className="card-progress" style={{width:`${Math.min(100,item.position/item.duration*100)}%`}}/>}</span></span>
            <span className="video-title" title={item.name}>{item.name.replace(/\.[^.]+$/,'')}</span>
            {item.favorite&&<span className="video-favorite" aria-label="Favorite"><Heart size={12} fill="currentColor"/></span>}
          </button>
          <details className="file-menu" onBlur={e => { if(!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open=false; }}>
            <summary aria-label={`Options for ${item.name}`} title="More"><MoreHorizontal size={19}/></summary>
            <div className="menu-panel">{item.position>0&&item.position<item.duration-2&&<button aria-label={`Resume ${item.name}`} onClick={e=>{closeMenu(e.currentTarget);void openItem(item,true,true);}}><Play size={16}/>Resume</button>}<button onClick={e=>{setInfoId(item.id);closeMenu(e.currentTarget);}}><Info size={16}/>Video info</button><button disabled={!item.position && !item.lastPlayed} onClick={e=>{updateItem(item.id,{position:0,lastPlayed:0});closeMenu(e.currentTarget);notify('Watch history reset.');}}><RotateCcw size={16}/>Reset watch history</button><button onClick={e => { updateItem(item.id,{favorite:!item.favorite}); closeMenu(e.currentTarget); }}><Heart size={16}/>{item.favorite ? 'Remove favorite' : 'Add to favorites'}</button><button className="delete-action" onClick={e => { setDeleteId(item.id); closeMenu(e.currentTarget); }}><Trash2 size={16}/>Remove from library</button></div>
          </details>
        </article>)}</div> : <p className="no-results">{query ? 'No videos found' : view==='continue' ? 'Nothing to continue' : scope?'Empty collection':'No favorites'}</p>}
      </section>}
    </main>

    <div className="drop-overlay" data-active={dragging ? '' : undefined} aria-hidden={!dragging}><Upload size={36}/><span>Drop to watch</span></div>
    {toast && <div className="toast" role="status"><span>{toast}</span><button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={16}/></button></div>}
    {modal === 'settings' && <Modal title="Settings" onClose={() => setModal(null)}>
      <section className="settings-section" aria-label="Display"><h3>Display</h3><div className="settings-group">
      <label className="setting-row"><span>Appearance</span><select aria-label="Appearance" value={prefs.theme} onChange={e=>setPrefs({...prefs,theme:e.target.value as Preferences['theme']})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label className="setting-row"><span>Animations</span><input type="checkbox" role="switch" aria-label="Animations" checked={prefs.motion} onChange={e => setPrefs({...prefs,motion:e.target.checked})}/></label>
      </div></section><section className="settings-section" aria-label="Playback"><h3>Playback</h3><div className="settings-group">
      <label className="setting-row"><span>Resume playback</span><input type="checkbox" role="switch" checked={prefs.resume} onChange={e => setPrefs({...prefs,resume:e.target.checked})}/></label>
      <label className="setting-row"><span>Autoplay</span><input type="checkbox" role="switch" aria-label="Autoplay" checked={prefs.autoplay} onChange={e => setPrefs({...prefs,autoplay:e.target.checked})}/></label>
      <label className="setting-row"><span>Autoplay next</span><input type="checkbox" role="switch" aria-label="Autoplay next" checked={prefs.autoAdvance} onChange={e=>setPrefs({...prefs,autoAdvance:e.target.checked})}/></label>
      <label className="setting-row"><span>Repeat</span><select aria-label="Repeat" value={prefs.repeat} onChange={e=>setPrefs({...prefs,repeat:e.target.value as Preferences['repeat']})}><option value="off">Off</option><option value="one">Repeat one</option><option value="all">Repeat all</option></select></label>
      </div>
      {active && <button className="setting-action" onClick={() => { setModal(null); void pictureInPicture(); }}><PictureInPicture2 size={17}/>Picture in Picture</button>}
      {!nativeShell && <a className="setting-action" href={siteHref}>Download for Mac, Windows, or iOS</a>}
      </section><SecuritySettings/><div className="app-about"><img src="./icon.png" alt="Videe app icon"/><div><strong>Videe</strong><span>Version {appPackage.version}</span></div></div>
      <details className="help-details"><summary>Shortcuts</summary><div className="shortcuts">{([['Play / pause',['space']],['Seek back / forward',['left','right']],['Full screen',['F']],['Mute',['M']]] as const).map(([label,keys]) => <div key={label}><span>{label}</span><ShortcutKeys keys={[...keys]}/></div>)}</div></details>
    </Modal>}
    {modal === 'tools' && <Modal title="Playback tools" onClose={()=>setModal(null)}>
      <button aria-label="Lock screen" className="icon-button screen-lock-action" disabled={conversion!==null} onClick={()=>{setModal(null);setControlsLocked(true);setUnlockConfirm(false);}}><LockKeyhole size={20} aria-hidden="true"/></button>
      <section className="settings-section"><h3>A–B loop</h3><div className="tool-actions"><label>Loop start (seconds)<input type="number" min="0" step="0.1" value={loopStart} onChange={e=>setLoopStart(e.target.value)}/></label><label>Loop end (seconds)<input type="number" min="0" step="0.1" value={loopEnd} onChange={e=>setLoopEnd(e.target.value)}/></label><button className="secondary-button" onClick={()=>{const a=Number(loopStart),b=Number(loopEnd);if(!loopStart.trim()||!loopEnd.trim()||!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a+.25||b>duration){notify('Choose a valid range within this video, at least 0.25 seconds long.');return;}setAb({a,b});seek(a);}}>Apply loop range</button></div><div className="loop-tools">
        <button className="secondary-button" disabled={!duration || !!error} onClick={()=>{setAb({a:videoRef.current?.currentTime||0,b:null});}}>Set A <span>{ab.a===null?'—':timeLabel(ab.a)}</span></button>
        <button className="secondary-button" disabled={ab.a===null || !duration || !!error} onClick={()=>{const t=videoRef.current?.currentTime||0;if(ab.a===null||t<=ab.a+0.25){notify('Set B at least 0.25 seconds after A.');return;}setAb({...ab,b:t});seek(ab.a);}}>Set B <span>{ab.b===null?'—':timeLabel(ab.b)}</span></button>
        <button className="secondary-button" disabled={ab.a===null} onClick={()=>setAb({a:null,b:null})}>Clear loop</button>
      </div></section>
      <section className="settings-section"><h3>Play queue · {queue.current.length}</h3><ol className="play-queue">{queue.current.map((id,i)=>{const item=items.find(v=>v.id===id);return item&&<li key={id}><button aria-label={`Play queue item ${item.name}`} aria-current={id===activeId?'true':undefined} onClick={()=>{if(conversion!==null){notify('Cancel the conversion before switching videos.');return;}setModal(null);void openItem(item,true);}}><span className="queue-number">{id===activeId?<Play size={13}/>:String(i+1).padStart(2,'0')}</span><span>{item.name}</span><small>{item.duration?timeLabel(item.duration):'—'}</small></button></li>;})}</ol></section>
    </Modal>}
    {modal === 'subtitles' && <Modal title="Subtitles" onClose={() => setModal(null)}>
      {subtitle && <><label className="setting-row"><span>Show subtitles</span><input type="checkbox" role="switch" checked={captions} onChange={e => setCaptions(e.target.checked)}/></label><p className="subtitle-filename">{subtitle.name}</p></>}
      <button className="secondary-button subtitle-import" onClick={() => subtitleRef.current?.click()}><FolderOpen size={17}/>{subtitle ? 'Replace subtitles' : 'Open subtitles'}</button>
      {!subtitle && <p className="subtle-text">SRT / WebVTT</p>}
    </Modal>}
    {info && <Modal title="Video info" onClose={()=>setInfoId(null)}><p className="delete-filename">{info.name}</p><dl className="info-list"><div><dt>Size</dt><dd>{sizeLabel(info.size)}</dd></div><div><dt>Duration</dt><dd>{info.duration?timeLabel(info.duration):'Not available'}</dd></div><div><dt>Playback position</dt><dd>{timeLabel(info.position)}</dd></div><div><dt>Added</dt><dd>{new Date(info.added).toLocaleDateString('en-US')}</dd></div><div><dt>Location</dt><dd>{info.native?'Original file':'Local library'}</dd></div></dl></Modal>}
    {deleteId && <Modal title="Remove from library" onClose={() => setDeleteId(null)}><p className="delete-filename">{items.find(item => item.id === deleteId)?.name}</p><p className="subtle-text">Your original file will not be deleted.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteId(null)}>Cancel</button><button className="danger-button" onClick={() => void confirmDelete()}>Remove</button></div></Modal>}
  </div>;
}
