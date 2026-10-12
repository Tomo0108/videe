import {ChoiceMenu} from './ChoiceMenu';
import {Modal} from './Modal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowDownWideNarrow, ArrowUp, Camera, Check, LockKeyholeOpen, LockKeyhole, Loader2, Repeat, Repeat1, LayoutGrid, List, Info, SkipBack, ArrowLeft, Captions, Film, Folder, FolderOpen, Gauge, Layers, ListVideo, Maximize, Minimize, Pause, PictureInPicture2, Play, RotateCcw, Rewind, FastForward, Scissors, Search, Settings2, SkipForward, Trash2, Upload, Volume2, VolumeX, X, Zap, ZoomIn, ChevronDown, ChevronRight } from 'lucide-react';
import { normalizePreferences, nextOnEnded, SPEEDS, stepSpeed, type Preferences } from './preferences.mjs';
import appPackage from '../package.json';
import type { LucideIcon, LucideProps } from 'lucide-react';
import { readLibrary, readMediaBlob, renameItems, saveItem, savePosition, removeItem, type MediaItem } from './store';
import { Capacitor } from '@capacitor/core';
import { isVideo, timeLabel, sizeLabel, toVtt, clampTime, clipLoop, codecLabel, codecName, timecode, normalizeSegments, splitSegments, segmentsDuration } from './media.mjs';
import {Organization,readCollections,importedName,type Collection} from './organization';
import {placeInFolders,sourceFolderGroups,sourceFolderName,moveToFolder} from './collections.mjs';
import {SecuritySettings} from './security';
import {useThumbnails} from './thumbnails';
import { compareMedia, DEFAULT_DIR, nextSortPref, readFolderSort, sortKey, writeFolderSort, type LibrarySort } from './library-sort.mjs';
import { EditorPanel, ExportDialog, newSegmentId, type Segment } from './Editor';
import { Sidebar, type View } from './Sidebar';
import { VideoCard, FolderCard, type CardActions } from './VideoCard';
import type { Analysis, ExportOptions } from './env';

const KEY_LABELS: Record<string, string> = { space: '␣', left: '←', right: '→', up: '↑', down: '↓', esc: 'esc' };
function ShortcutKeys({ keys }: { keys: string[] }) {
  return <>{keys.map(key => <kbd key={key}>{KEY_LABELS[key] || key}</kbd>)}</>;
}

type GpuStatus = { videoDecode: string; gpuCompositing: string; rasterization: string; encoder?: string };
type Engine = 'direct' | 'live';
type JobKind = 'convert' | 'prepare' | 'export';
// Files above this size start in live playback instead of waiting for a remux.
const REMUX_LIMIT = 2 * 1024 ** 3;
const SORT_COLUMNS: { id: LibrarySort; label: string }[] = [
  { id: 'name', label: 'Name' },
  { id: 'duration', label: 'Duration' },
  { id: 'size', label: 'Size' },
  { id: 'recent', label: 'Played' },
];
const ENCODER_NAMES: Record<string, string> = { h264_videotoolbox: 'VideoToolbox (GPU)', h264_nvenc: 'NVIDIA NVENC (GPU)', h264_qsv: 'Intel Quick Sync (GPU)', h264_amf: 'AMD AMF (GPU)', libx264: 'x264 (CPU)' };
function gpuStatusLabel(value: string) {
  if (['enabled', 'enabled_on', 'enabled_force'].includes(value)) return 'Hardware accelerated';
  if (['disabled_software', 'unavailable_software'].includes(value)) return 'Software fallback';
  if (value === 'unknown') return 'Unavailable';
  return 'Disabled or unavailable';
}
function durationLabel(seconds: number) {
  if (!(seconds > 0)) return '';
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}
function getPreferences(): Preferences { try { return normalizePreferences(JSON.parse(localStorage.getItem('videe-preferences') || '{}')); } catch { return normalizePreferences(null); } }
function LoopRangeIcon({ size = 18, color, absoluteStrokeWidth: _absoluteStrokeWidth, strokeWidth: _strokeWidth, ...props }: LucideProps) {
  const ink = color ?? 'currentColor';
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}><path d="M5 12h14" stroke={ink} strokeWidth="2.4"/><circle cx="5" cy="12" r="3.3" fill={ink}/><circle cx="19" cy="12" r="3.3" fill={ink}/></svg>;
}
function IconButton({ icon: Icon, label, onClick, disabled, active, className = '' }: { icon: LucideIcon | typeof LoopRangeIcon; label: string; onClick?: () => void; disabled?: boolean; active?: boolean; className?: string }) { return <button className={`icon-button ${active ? 'active' : ''} ${className}`} onClick={onClick} disabled={disabled} aria-pressed={active} aria-label={label} title={label}><Icon size={18} strokeWidth={1.8} aria-hidden="true"/></button>; }
function withTimeout<T>(promise: Promise<T>, ms: number) { return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]); }
export default function App() {
  const [items, setItems] = useState<MediaItem[]>([]); const itemsRef = useRef(items); itemsRef.current = items;
  const [ready, setReady] = useState(false); const [view, setView] = useState<View>('all');
  const [viewSlide, setViewSlide] = useState<'in' | 'fwd' | 'back' | 'grid' | 'list'>('in');
  const [collections,setCollections]=useState(readCollections); const collectionsRef = useRef(collections); collectionsRef.current = collections;
  const [scope,setScope]=useState('');
  const [folderSort,setFolderSort]=useState(readFolderSort);
  const [selected,setSelected]=useState<string[]>([]); const selectedRef = useRef(selected); selectedRef.current = selected; const lastChecked = useRef('');
  const [controlsLocked,setControlsLocked]=useState(false);
  const [looping,setLooping]=useState(false);
  const [jobKind,setJobKind]=useState<JobKind>('convert');
  const [query, setQuery] = useState('');
  const [infoId, setInfoId] = useState<string|null>(null);
  const queue = useRef<string[]>([]); const visibleIds = useRef<string[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null); const [source, setSource] = useState(''); const [playing,setPlaying] = useState(false); const [position,setPosition] = useState(0); const [duration,setDuration] = useState(0);
  const [muted,setMuted] = useState(false); const [error,setError] = useState(''); const [loading,setLoading] = useState(false); const [busy,setBusy] = useState(false); const [conversion,setConversion] = useState<number | null>(null); const [conversionTotal,setConversionTotal] = useState(0);
  const [prefs,setPrefs] = useState<Preferences>(getPreferences); const prefsRef = useRef(prefs); prefsRef.current = prefs;
  const [modal,setModal] = useState<'settings'|'subtitles'|'export'|'playback'|null>(null); const [deleteIds,setDeleteIds] = useState<string[]|null>(null); const [toast,setToast] = useState<{text:string;action?:{label:string;run:()=>void}}|null>(null); const [dragging,setDragging] = useState(false);
  const [gpuStatus,setGpuStatus] = useState<GpuStatus|null>(null); const [gpuLoading,setGpuLoading] = useState(false); const [cacheBytes,setCacheBytes] = useState<number|null>(null);
  const [ab, setAb] = useState<{a:number|null;b:number|null}>({a:null,b:null});
  const [chrome, setChrome] = useState(true);
  const [subtitle,setSubtitle] = useState<{url:string;name:string}|null>(null); const [captions,setCaptions] = useState(true);
  const [embeddedTracks,setEmbeddedTracks] = useState<{index:number;label:string;language:string}[]>([]);
  const [isFullscreen,setIsFullscreen] = useState(false);
  const [videoZoom,setVideoZoom] = useState(1); const [videoPan,setVideoPan] = useState({x:0,y:0});
  // Playback engine: direct decoding, or FFmpeg live conversion for formats that stutter or fail.
  const [engine,setEngine] = useState<Engine>('direct'); const engineRef = useRef<Engine>('direct'); const liveOffset = useRef(0);
  const [analysis,setAnalysis] = useState<Analysis|null>(null); const analysisRef = useRef<Analysis|null>(null);
  const [frameStats,setFrameStats] = useState<{dropped:number;total:number}|null>(null);
  const [osd,setOsd] = useState(''); const osdTimer = useRef(0);
  const [hover,setHover] = useState<{t:number;pct:number}|null>(null);
  const [filmstrip,setFilmstrip] = useState<(string|null)[]>([]); const filmstripFor = useRef('');
  // Editor.
  const [editing,setEditing] = useState(false);
  const [segments,setSegments] = useState<Segment[]>([]); const segmentsRef = useRef(segments); segmentsRef.current = segments;
  const [selectedSegment,setSelectedSegment] = useState<string|null>(null); const selectedSegmentRef = useRef(selectedSegment); selectedSegmentRef.current = selectedSegment;
  const past = useRef<Segment[][]>([]); const future = useRef<Segment[][]>([]); const dragBase = useRef<Segment[]|null>(null); const [, setHistoryTick] = useState(0);
  const [previewEdits,setPreviewEdits] = useState(false); const [snap,setSnap] = useState(true); const stopAt = useRef<number|null>(null);
  const [creating,setCreating] = useState<'folder'|'playlist'|null>(null); const [newName,setNewName] = useState('');
  const [foldersOpen,setFoldersOpen] = useState(() => { try { return localStorage.getItem('videe-folders-open') !== 'false'; } catch { return true; } });
  const videoRef = useRef<HTMLVideoElement>(null); const stageRef = useRef<HTMLDivElement>(null); const fileRef = useRef<HTMLInputElement>(null); const folderRef = useRef<HTMLInputElement>(null); const subtitleRef = useRef<HTMLInputElement>(null); const activeRef = useRef(activeId); activeRef.current = activeId;
  const forceResume = useRef(false); const playAfterLoad = useRef(false); const startFromBeginning = useRef(false); const firstLoad = useRef(false); const seekOnLoad = useRef<number|null>(null);
  const urls = useRef(new Map<string,string>()); const openSequence = useRef(0); const lastSave = useRef(0); const lastPositionPaint = useRef(0); const gpuStatusRequest = useRef(false); const panDrag = useRef<{x:number;y:number;startX:number;startY:number}|null>(null); const panWasDragged = useRef(false); const dragDepth = useRef(0);
  const chromeHide = useRef(0); const videoClick = useRef(0); const liveSeekTimer = useRef(0); const pendingSeek = useRef<number|null>(null); const recoveries = useRef(0); const triedLive = useRef(false); const engineOverride = useRef(new Map<string,Engine>());
  const durationRef = useRef(duration); durationRef.current = duration;
  const subtitleStateRef = useRef(subtitle); subtitleStateRef.current = subtitle;
  const active = items.find(item => item.id === activeId);
  const watching = !!active && !minimized;
  const fps = analysis?.info.video?.fps && analysis.info.video.fps < 241 ? analysis.info.video.fps : 30;
  const notify = useCallback((text: string) => setToast({text}), []);
  const notifyAction = useCallback((text: string, label: string, run: () => void) => setToast({text,action:{label,run}}), []);
  const showOsd = useCallback((text: string) => { setOsd(text); window.clearTimeout(osdTimer.current); osdTimer.current = window.setTimeout(() => setOsd(''), 1100); }, []);
  /** Current position in source time, including the live stream offset. */
  const now = useCallback(() => { const video = videoRef.current; const t = video?.currentTime || 0; return engineRef.current === 'live' ? liveOffset.current + t : t; }, []);
  const refreshGpuStatus = useCallback(async () => {
    if (!window.videe?.getGpuStatus || gpuStatusRequest.current) return;
    gpuStatusRequest.current = true;
    setGpuLoading(true);
    try { setGpuStatus(await window.videe.getGpuStatus()); }
    catch { setGpuStatus(null); notify('Could not read graphics diagnostics.'); }
    finally { gpuStatusRequest.current = false; setGpuLoading(false); }
  }, [notify]);
  useEffect(() => { readLibrary().then(data => setItems(data)).catch(() => notify('Could not load your library. Check browser storage permissions.')).finally(() => setReady(true)); return () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }; }, [notify]);
  useEffect(() => {
    if (modal !== 'settings' && modal !== 'playback') return;
    if (window.videe?.getGpuStatus) void refreshGpuStatus();
    if (modal === 'settings' && window.videe?.cacheInfo) void window.videe.cacheInfo().then(info => setCacheBytes(info.bytes)).catch(() => setCacheBytes(null));
  }, [modal, refreshGpuStatus]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.action ? 9000 : 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { try { localStorage.setItem('videe-preferences', JSON.stringify(prefs)); } catch { notify('Could not save preferences. Check available storage.'); } if(videoRef.current) { videoRef.current.playbackRate = prefs.speed; videoRef.current.volume = prefs.volume; } }, [prefs, notify]);
  useEffect(() => window.videe?.onConversionProgress(({id,seconds,total}) => { if(id === activeRef.current) { setConversion(seconds); if (total) setConversionTotal(total); } }), []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = [...video.textTracks].filter(track => track.kind === 'subtitles' || track.kind === 'captions');
    for (const track of tracks) track.mode = 'hidden';
    if (!captions || !tracks.length) return;
    const match = subtitle?.name ? tracks.find(track => track.label === subtitle.name) : null;
    (match || tracks[0]).mode = 'showing';
  }, [captions, subtitle, source]);
  useEffect(() => () => { if(subtitle?.url) URL.revokeObjectURL(subtitle.url); }, [subtitle]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      if (subtitleStateRef.current?.url) return;
      const tracks = [...video.textTracks].filter(track => track.kind === 'subtitles' || track.kind === 'captions');
      const pick = tracks.find(track => /ja|jpn/i.test(`${track.language} ${track.label}`)) || tracks[0];
      if (pick && !subtitleStateRef.current) setSubtitle({ url: '', name: pick.label || pick.language || 'Embedded subtitles' });
    };
    video.textTracks.addEventListener('addtrack', sync);
    sync();
    return () => video.textTracks.removeEventListener('addtrack', sync);
  }, [source]);
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const updateItem = useCallback((id: string, changes: Partial<MediaItem>, persist = true) => {
    const item = itemsRef.current.find(i => i.id === id); if(!item) return;
    const updated = {...item,...changes}; const next = itemsRef.current.map(i => i.id === id ? updated : i); itemsRef.current = next; setItems(next);
    if(persist) void saveItem(updated).catch(() => notify('Changes could not be saved and may be lost when you close the app.'));
  }, [notify]);
  useThumbnails(items,!!activeId||busy,updateItem);
  const saveCollections=(next:Collection[])=>{try{localStorage.setItem('videe-collections',JSON.stringify(next));collectionsRef.current=next;setCollections(next);return true;}catch{notify('Could not save collections.');return false;}};
  const fileIntoScope=(ids:string[])=>{if(!collections.some(c=>c.id===scope)||!ids.length)return;saveCollections(collections.map(c=>c.id===scope?{...c,ids:[...new Set([...c.ids,...ids])]}:c));};
  const fileIntoFolders=(groups:{name:string;ids:string[]}[],rootName='')=>{const ids=[...new Set(groups.flatMap(group=>group.ids))];if(!groups.length){fileIntoScope(ids);return false;}const {collections:next,folderId}=placeInFolders(collections,groups,rootName);if(!folderId){fileIntoScope(ids);return false;}if(saveCollections(next)){setViewSlide('in');setScope(folderId);setView('all');setQuery('');return true;}return false;};
  const fileIntoFolder=(name:string,ids:string[])=>fileIntoFolders(name&&ids.length?[{name,ids}]:[],name);
  const relocate=(ids:string[],dest:string)=>{if(!ids.length)return false;if(saveCollections(moveToFolder(collectionsRef.current,ids,dest))){setSelected(current=>current.filter(id=>!ids.includes(id)));return true;}return false;};
  const batchRename=async(names:Map<string,string>)=>{await renameItems(names);const next=itemsRef.current.map(i=>names.has(i.id)?{...i,originalName:i.originalName||i.name,name:names.get(i.id)!}:i);itemsRef.current=next;setItems(next);};
  const createCollection=(kind:'folder'|'playlist',name:string)=>{
    const trimmed=name.trim().slice(0,80); if(!trimmed) return;
    const ids=selectedRef.current.filter(id=>itemsRef.current.some(item=>item.id===id));
    const collection:Collection={id:crypto.randomUUID(),name:trimmed,kind,ids};
    const next=[...collectionsRef.current.map(old=>kind==='folder'&&old.kind==='folder'?{...old,ids:old.ids.filter(id=>!ids.includes(id))}:old),collection];
    if(saveCollections(next)){setSelected([]);setViewSlide('in');setScope(collection.id);setView('all');setQuery('');setCreating(null);setNewName('');}
  };
  const saveProgress = useCallback(() => {
    const video = videoRef.current; const id = activeRef.current;
    if (!id || !video || !Number.isFinite(video.currentTime)) return;
    const position = video.ended ? 0 : pendingSeek.current ?? now();
    // Persist only a lightweight position record; never serialize thumbnails here.
    itemsRef.current = itemsRef.current.map(item => item.id === id ? {...item, position} : item);
    setItems(itemsRef.current);
    lastSave.current = performance.now();
    void savePosition(id, position).catch(() => notify('Could not save playback progress.'));
  }, [notify, now]);
  const applyEmbedded = useCallback(async (itemId: string, index: number, label: string, sequence: number) => {
    if (!window.videe?.extractSubtitle) return;
    try {
      const text = await window.videe.extractSubtitle(itemId, index);
      if (sequence !== openSequence.current) return;
      setSubtitle({ url: URL.createObjectURL(new Blob([text], { type: 'text/vtt' })), name: label });
      setCaptions(true);
    } catch { if (sequence === openSequence.current) notify('Could not read embedded subtitles.'); }
  }, [notify]);
  useEffect(() => { const handler = () => { if(document.visibilityState === 'hidden') saveProgress(); }; document.addEventListener('visibilitychange',handler); return () => document.removeEventListener('visibilitychange',handler); }, [saveProgress]);
  /** Stream the file through FFmpeg from `at` seconds. Seeking restarts the stream, like a network player. */
  const startLive = useCallback(async (id: string, at: number, play: boolean) => {
    if (!window.videe?.liveSource) return false;
    const sequence = openSequence.current;
    try {
      const src = await window.videe.liveSource(id, at, prefsRef.current.hardware);
      if (sequence !== openSequence.current || activeRef.current !== id) return false;
      liveOffset.current = at; engineRef.current = 'live'; setEngine('live');
      pendingSeek.current = null; playAfterLoad.current = play; setError(''); setLoading(true); setPosition(at); lastPositionPaint.current = at;
      setSource(src);
      return true;
    } catch (e) {
      if (sequence === openSequence.current) { setError(e instanceof Error ? e.message : 'Could not open this video.'); setLoading(false); }
      return false;
    }
  }, []);
  const loadSubtitles = useCallback((item: MediaItem, sequence: number) => {
    if (!item.native || !window.videe?.listSubtitles) return;
    void (async () => {
      try {
        const tracks = await window.videe!.listSubtitles!(item.id);
        if (sequence !== openSequence.current) return;
        setEmbeddedTracks(tracks);
        const pick = tracks.find(track => /^(ja|jpn)/i.test(track.language)) || tracks[0];
        if (pick) await applyEmbedded(item.id, pick.index, pick.label, sequence);
      } catch { if (sequence === openSequence.current) setEmbeddedTracks([]); }
    })();
  }, [applyEmbedded]);
  const openItem = useCallback(async (item: MediaItem, continuePlayback = false, resumePlayback = false) => {
    if(conversion !== null) { notify('Finish or cancel the current video task before switching.'); return; }
    if(item.id === activeRef.current && !continuePlayback && !resumePlayback) { setMinimized(false); return; }
    if(!continuePlayback) setMinimized(false);
    if(!activeRef.current || (minimized && !continuePlayback)) queue.current = visibleIds.current;
    if(!queue.current.includes(item.id)) queue.current = [...queue.current, item.id];
    saveProgress(); forceResume.current = resumePlayback; playAfterLoad.current = continuePlayback; startFromBeginning.current = continuePlayback; const sequence = ++openSequence.current;
    window.clearTimeout(liveSeekTimer.current); pendingSeek.current = null; seekOnLoad.current = null; firstLoad.current = true; recoveries.current = 0; triedLive.current = false; stopAt.current = null;
    engineRef.current = 'direct'; liveOffset.current = 0; analysisRef.current = null;
    setEngine('direct'); setAnalysis(null); setFrameStats(null); setFilmstrip([]); filmstripFor.current = ''; setSegments([]); setSelectedSegment(null); past.current = []; future.current = []; setPreviewEdits(false);
    setAb({a:null,b:null}); setLooping(false); setActiveId(item.id); setSource(''); setPlaying(false); setError(''); setLoading(true); setPosition(0); setDuration(0); setSubtitle(null); setEmbeddedTracks([]); setChrome(true); setVideoZoom(1); setVideoPan({x:0,y:0}); lastSave.current = 0; lastPositionPaint.current = 0;
    try {
      let src: string;
      if(item.native && window.videe) {
        let info: Analysis | null = null;
        if (window.videe.analyzeVideo) { try { info = await withTimeout(window.videe.analyzeVideo(item.id), 9000); } catch { info = null; } }
        if(sequence !== openSequence.current) return;
        analysisRef.current = info; setAnalysis(info);
        const override = engineOverride.current.get(item.id);
        const planned = info?.known && !info.converted && prefsRef.current.smooth === 'auto' ? info.plan.mode : 'direct';
        const mode = override === 'direct' ? 'direct' : override === 'live' ? 'transcode' : planned;
        if (mode !== 'direct' && info) {
          const length = info.info.duration;
          if (length > 0) { setDuration(length); durationRef.current = length; }
          const stored = itemsRef.current.find(i => i.id === item.id)?.position || 0;
          const resumeAt = (!startFromBeginning.current || forceResume.current) && (prefsRef.current.resume || forceResume.current) && stored < length - 2 ? stored : 0;
          if (mode === 'remux' && info.size <= REMUX_LIMIT && window.videe.prepareVideo) {
            setJobKind('prepare'); setConversion(0); setConversionTotal(length);
            let prepared = '';
            try { prepared = (await window.videe.prepareVideo(item.id)).src; } catch { prepared = ''; }
            finally { setConversion(null); setJobKind('convert'); }
            if (sequence !== openSequence.current) return;
            if (prepared) {
              const refreshed = await window.videe.analyzeVideo(item.id).catch(() => null);
              if (sequence !== openSequence.current) return;
              if (refreshed) { analysisRef.current = refreshed; setAnalysis(refreshed); }
              setSource(prepared); updateItem(item.id, {lastPlayed: Date.now()}); loadSubtitles(item, sequence);
              return;
            }
          }
          updateItem(item.id, {lastPlayed: Date.now()});
          await startLive(item.id, resumeAt, continuePlayback);
          loadSubtitles(item, sequence);
          return;
        }
        src = await window.videe.getSource(item.id);
      }
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
      loadSubtitles(item, sequence);
    } catch(e) { if(sequence === openSequence.current) { setError(e instanceof Error ? e.message : 'Could not open this video.'); setLoading(false); } }
  }, [conversion,minimized,notify,saveProgress,updateItem,startLive,loadSubtitles]);
  /** Switch the active video between direct decoding and live conversion, keeping the position. */
  const switchEngine = useCallback(async (target: Engine, reason = '') => {
    const id = activeRef.current; const video = videoRef.current;
    if (!id || !window.videe) return;
    const at = pendingSeek.current ?? now(); const play = !!video && !video.paused;
    engineOverride.current.set(id, target);
    if (target === 'live') { if (await startLive(id, at, play) && reason) showOsd(reason); return; }
    try {
      const src = await window.videe.getSource(id);
      engineRef.current = 'direct'; liveOffset.current = 0; setEngine('direct'); triedLive.current = true;
      seekOnLoad.current = at; playAfterLoad.current = play; setError(''); setLoading(true); setSource(`${src}${src.includes('?') ? '&' : '?'}direct=${Date.now()}`);
      if (reason) showOsd(reason);
    } catch (e) { notify(e instanceof Error ? e.message : 'Could not open this video.'); }
  }, [now, startLive, showOsd, notify]);
  const importFiles = async (files: File[]) => {
    if(busy || !ready || controlsLocked) return;
    const folderName = sourceFolderName(files);
    const groups = sourceFolderGroups(files);
    const idsFor = (fileList: File[], records: {id:string;name:string;size:number}[]) => fileList.map(file => records.find(record => record.name === file.name && record.size === file.size)?.id).filter((id): id is string => !!id);
    if(window.videe) {
      setBusy(true);
      try {
        const records = await window.videe.importFiles(files);
        await addNativeRecords(records, folderName, groups.map(group => ({ name: group.name, ids: idsFor(group.files, records) })));
      } catch { notify('Could not add videos. Try opening a folder.'); }
      finally { setBusy(false); }
      return;
    }
    const importedIds:string[]=[]; const folderIds:string[]=[]; const imported=new Map<File,string>(); setBusy(true); let first: MediaItem | undefined; let count = 0; let transient = false; let invalid = 0;
    try {
      for(const file of files) {
        if(!isVideo(file.name,file.type)) { invalid++; continue; }
        const existing = itemsRef.current.find(i => !i.native && (i.originalName||i.name) === file.name && i.size === file.size);
        if(existing) { first ||= existing; folderIds.push(existing.id); imported.set(file, existing.id); continue; }
        const item: MediaItem = { id: crypto.randomUUID(), name:importedName(file.name), originalName:file.name, size:file.size, type:file.type, blob:file, added:Date.now(), duration:0, position:0, favorite:false, lastPlayed:0 };
        try { await saveItem(item); } catch { transient = true; }
        const next = [...itemsRef.current,item]; itemsRef.current = next; setItems(next); first ||= item; count++; importedIds.push(item.id); folderIds.push(item.id); imported.set(file, item.id);
      }
      const named = groups.map(group => ({ name: group.name, ids: group.files.map((file: File) => imported.get(file)).filter((id: string | undefined): id is string => !!id) })).filter(group => group.ids.length);
      if(named.length) fileIntoFolders(named, folderName);
      else if(folderName) fileIntoFolder(folderName, folderIds);
      else fileIntoScope(folderIds);
      if(transient) notify('Storage is full. Some videos are available for this session only.');
      else if(invalid) notify(`Skipped ${invalid} non-video files.`);
      else if(!count) notify(first ? 'This video is already in your library.' : 'No videos in this folder.');
      if(first && !activeRef.current && !folderName && !scope) { visibleIds.current = itemsRef.current.map(i=>i.id); await openItem(first); }
    } finally { setBusy(false); }
  };
  const addNativeRecords = async (picked: MediaItem[], folderName = '', folders: {name:string;ids:string[]}[] = []) => {
    const fresh = picked.filter(p => !itemsRef.current.some(i => i.id === p.id)).map(p=>({...p,originalName:p.name,name:importedName(p.name)}));
    for(const item of fresh) await saveItem(item);
    const next = [...itemsRef.current,...fresh]; itemsRef.current=next; setItems(next);
    const named = folders.filter(folder => folder.name && folder.ids.length);
    if(named.length) fileIntoFolders(named, folderName);
    else if(folderName) fileIntoFolder(folderName, picked.map(item=>item.id));
    else fileIntoScope(picked.map(item=>item.id));
    if(picked[0] && !activeRef.current && !folderName && !scope) { visibleIds.current = next.map(i=>i.id); await openItem(next.find(i=>i.id===picked[0].id)!); }
  };
  const pickFolder = async () => {
    if(busy || !ready || controlsLocked) return;
    if(window.videe) {
      setBusy(true);
      try {
        const picked = await window.videe.pickFolder();
        if(picked === null) return;
        if(!picked.records.length) { notify('No videos in this folder.'); return; }
        await addNativeRecords(picked.records, picked.name, picked.folders || []);
      } catch { notify('Could not open this folder.'); }
      finally { setBusy(false); }
      return;
    }
    folderRef.current?.click();
  };
  const pickFiles = async () => {
    if(busy || !ready || controlsLocked) return;
    if(window.videe) {
      setBusy(true);
      try {
        const picked = await window.videe.pickFiles();
        if(picked === null) return;
        if(!picked.length) { notify('No supported videos selected.'); return; }
        await addNativeRecords(picked);
      } catch { notify('Could not add videos.'); }
      finally { setBusy(false); }
      return;
    }
    fileRef.current?.click();
  };
  const bindFolderInput = useCallback((node: HTMLInputElement | null) => {
    folderRef.current = node;
    if(!node) return;
    node.setAttribute('webkitdirectory', '');
    node.setAttribute('directory', '');
    node.multiple = true;
  }, []);
  const togglePlay = useCallback(() => { const video = videoRef.current; if(!video || !source || error) return; stopAt.current = null; if(video.paused) void video.play().catch(() => notify('Could not start playback. Check the video file.')); else video.pause(); }, [source,error,notify]);
  const seek = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    if (engineRef.current === 'live') {
      const length = durationRef.current;
      if (!length) return;
      const target = clampTime(seconds, length);
      if (Math.abs(target - (pendingSeek.current ?? now())) < 0.02) return;
      const play = pendingSeek.current !== null ? playAfterLoad.current : !video.paused;
      pendingSeek.current = target; playAfterLoad.current = play; setPosition(target); lastPositionPaint.current = target;
      window.clearTimeout(liveSeekTimer.current);
      liveSeekTimer.current = window.setTimeout(() => { const id = activeRef.current; if (id && pendingSeek.current !== null) void startLive(id, pendingSeek.current, playAfterLoad.current); }, 140);
      return;
    }
    if (Number.isFinite(video.duration)) { video.currentTime = clampTime(seconds,video.duration); setPosition(video.currentTime); }
  }, [now, startLive]);
  const nextVideo = useCallback((offset: number) => { const index = queue.current.indexOf(activeRef.current || ''); const item = itemsRef.current.find(i => i.id === queue.current[index+offset]); if(item) void openItem(item); }, [openItem]);
  const fullscreen = useCallback(async () => { const stage = stageRef.current; if(!stage || !activeRef.current) return; try { if(document.fullscreenElement) await document.exitFullscreen(); else if(stage.requestFullscreen) await stage.requestFullscreen(); else (videoRef.current as HTMLVideoElement & {webkitEnterFullscreen?:()=>void})?.webkitEnterFullscreen?.(); } catch { notify('Full screen is not available on this device.'); } }, [notify]);
  const clampVideoPan = useCallback((x:number, y:number, zoom:number) => {
    const stage = stageRef.current;
    if (!stage || zoom <= 1) return {x:0,y:0};
    const maxX = stage.clientWidth * (zoom - 1) / 2;
    const maxY = stage.clientHeight * (zoom - 1) / 2;
    return {x:Math.max(-maxX,Math.min(maxX,x)),y:Math.max(-maxY,Math.min(maxY,y))};
  }, []);
  const resetVideoView = useCallback(() => { setVideoZoom(1); setVideoPan({x:0,y:0}); }, []);
  const fillScreen = useCallback(async () => {
    const stage = stageRef.current; const video = videoRef.current;
    if (!stage || !video || !video.videoWidth || !video.videoHeight) return;
    try {
      if (!document.fullscreenElement) {
        if (stage.requestFullscreen) await stage.requestFullscreen();
        else (video as HTMLVideoElement & {webkitEnterFullscreen?:()=>void}).webkitEnterFullscreen?.();
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const contain = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight);
        const cover = Math.max(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight);
        setVideoZoom(Math.max(1,cover / contain)); setVideoPan({x:0,y:0});
      }));
    } catch { notify('Full screen is not available on this device.'); }
  }, [notify]);
  const pictureInPicture = async () => { try { if(document.pictureInPictureElement) await document.exitPictureInPicture(); else if(videoRef.current?.requestPictureInPicture) await videoRef.current.requestPictureInPicture(); else notify('Picture in Picture is not available on this device.'); } catch { notify('Start playback, then try again.'); } };
  const snapshot = useCallback(async () => {
    const item = itemsRef.current.find(i => i.id === activeRef.current); const video = videoRef.current;
    if (!item || !video) return;
    const t = pendingSeek.current ?? now();
    if (item.native && window.videe?.snapshot) {
      try { const file = await window.videe.snapshot(item.id, t); if (file) notifyAction('Frame saved.', 'Show in folder', () => void window.videe?.revealFile(file)); }
      catch { notify('Could not save this frame.'); }
      return;
    }
    if (!video.videoWidth) { notify('Start playback, then try again.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) { notify('Could not save this frame.'); return; }
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `${item.name.replace(/\.[^.]+$/, '')} ${timecode(t, 100).slice(0, 8).replace(/:/g, '-')}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000); showOsd('Frame saved');
    }, 'image/png');
  }, [now, notify, notifyAction, showOsd]);
  const revealChrome = useCallback((hold = false) => {
    setChrome(true);
    window.clearTimeout(chromeHide.current);
    if (hold || !playing || error || controlsLocked || modal || editing) return;
    chromeHide.current = window.setTimeout(() => setChrome(false), 2800);
  }, [playing, error, controlsLocked, modal, editing]);
  const handleVideoClick = (event: React.MouseEvent<HTMLVideoElement>) => {
    if (panWasDragged.current) { panWasDragged.current = false; return; }
    if (event.detail > 1) return;
    if (!chrome) { revealChrome(); return; }
    window.clearTimeout(videoClick.current);
    videoClick.current = window.setTimeout(() => { videoClick.current = 0; togglePlay(); }, 220);
  };
  const handleVideoWheel = (event: React.WheelEvent<HTMLVideoElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault(); revealChrome();
    setVideoZoom(current => {
      const next = Math.max(1,Math.min(6,current * (event.deltaY < 0 ? 1.1 : 0.9)));
      setVideoPan(pan => clampVideoPan(pan.x,pan.y,next));
      return next;
    });
  };
  const startVideoPan = (event: React.PointerEvent<HTMLVideoElement>) => {
    if (videoZoom <= 1 || event.button !== 0) return;
    panDrag.current = {x:videoPan.x,y:videoPan.y,startX:event.clientX,startY:event.clientY}; panWasDragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveVideoPan = (event: React.PointerEvent<HTMLVideoElement>) => {
    const drag = panDrag.current; if (!drag) return;
    const x = drag.x + event.clientX - drag.startX; const y = drag.y + event.clientY - drag.startY;
    if (Math.abs(x-drag.x)>2 || Math.abs(y-drag.y)>2) panWasDragged.current = true;
    setVideoPan(clampVideoPan(x,y,videoZoom));
  };
  const endVideoPan = (event: React.PointerEvent<HTMLVideoElement>) => { if (panDrag.current) event.currentTarget.releasePointerCapture(event.pointerId); panDrag.current = null; };
  const handleVideoDoubleClick = (event: React.MouseEvent<HTMLVideoElement>) => {
    event.preventDefault();
    window.clearTimeout(videoClick.current);
    videoClick.current = 0;
    void fullscreen();
  };
  // ---- Editing -------------------------------------------------------------
  const commitSegments = useCallback((next: Segment[], base?: Segment[]) => {
    past.current.push(base ?? segmentsRef.current); if (past.current.length > 100) past.current.shift(); future.current = [];
    const sorted = next.slice().sort((a, b) => a.start - b.start);
    segmentsRef.current = sorted; setSegments(sorted); setHistoryTick(n => n + 1);
    if (selectedSegmentRef.current && !sorted.some(s => s.id === selectedSegmentRef.current)) setSelectedSegment(null);
  }, []);
  const undo = useCallback(() => { const previous = past.current.pop(); if (!previous) return; future.current.push(segmentsRef.current); segmentsRef.current = previous; setSegments(previous); setHistoryTick(n => n + 1); }, []);
  const redo = useCallback(() => { const next = future.current.pop(); if (!next) return; past.current.push(segmentsRef.current); segmentsRef.current = next; setSegments(next); setHistoryTick(n => n + 1); }, []);
  const markIn = useCallback(() => {
    const t = pendingSeek.current ?? now(); const length = durationRef.current; if (!length) return;
    const list = segmentsRef.current; const current = list.find(s => s.id === selectedSegmentRef.current);
    const nextStart = list.filter(s => s.id !== current?.id && s.start > t).reduce((min, s) => Math.min(min, s.start), length);
    // Inside (or before the end of) the selected segment, In trims it; past its end, In starts the next range.
    if (current && t < current.end - 1 / fps) commitSegments(list.map(s => s.id === current.id ? {...s, start: t} : s));
    else { const id = newSegmentId(); commitSegments([...list, {id, start: t, end: nextStart}]); setSelectedSegment(id); }
    showOsd(`In ${timecode(t, fps)}`);
  }, [now, fps, commitSegments, showOsd]);
  const markOut = useCallback(() => {
    const t = pendingSeek.current ?? now(); const length = durationRef.current; if (!length) return;
    const list = segmentsRef.current; const current = list.find(s => s.id === selectedSegmentRef.current);
    const prevEnd = list.filter(s => s.id !== current?.id && s.end < t).reduce((max, s) => Math.max(max, s.end), 0);
    if (current && t > current.start + 1 / fps) commitSegments(list.map(s => s.id === current.id ? {...s, end: t} : s));
    else { const id = newSegmentId(); commitSegments([...list, {id, start: prevEnd, end: t}]); setSelectedSegment(id); }
    showOsd(`Out ${timecode(t, fps)}`);
  }, [now, fps, commitSegments, showOsd]);
  const splitAtPlayhead = useCallback(() => {
    const t = pendingSeek.current ?? now(); const length = durationRef.current; if (!length) return;
    const next = splitSegments(segmentsRef.current, t, length, newSegmentId);
    if (next === segmentsRef.current) return;
    commitSegments(next); setSelectedSegment((next as Segment[]).find((s:Segment) => Math.abs(s.start - t) < 1e-6)?.id ?? null);
    showOsd(`Split ${timecode(t, fps)}`);
  }, [now, fps, commitSegments, showOsd]);
  const deleteSegment = useCallback(() => {
    const id = selectedSegmentRef.current; if (!id) return;
    const list = segmentsRef.current; const index = list.findIndex(s => s.id === id); if (index < 0) return;
    const next = list.filter(s => s.id !== id);
    commitSegments(next); setSelectedSegment(next[Math.min(index, next.length - 1)]?.id ?? null);
  }, [commitSegments]);
  const playSegment = useCallback((segment: Segment) => {
    setSelectedSegment(segment.id); stopAt.current = segment.end; seek(segment.start);
    const video = videoRef.current; if (engineRef.current === 'live') playAfterLoad.current = true; else void video?.play().catch(() => {});
    window.setTimeout(() => { stopAt.current = segment.end; }, 0);
  }, [seek]);
  const toggleEditor = useCallback(() => {
    setEditing(value => !value); setChrome(true);
  }, []);
  // Filmstrip frames for the timeline and the seek-bar preview (desktop only, fetched once per video).
  const loadFilmstrip = useCallback(() => {
    const item = itemsRef.current.find(i => i.id === activeRef.current);
    if (!item?.native || !window.videe?.filmstrip || filmstripFor.current === item.id) return;
    filmstripFor.current = item.id;
    void window.videe.filmstrip(item.id, 24).then(frames => { if (activeRef.current === item.id) setFilmstrip(frames); }).catch(() => { filmstripFor.current = ''; });
  }, []);
  useEffect(() => { if (editing && activeId) loadFilmstrip(); }, [editing, activeId, loadFilmstrip]);
  const runExport = async (options: Omit<ExportOptions,'segments'|'duration'>) => {
    setModal(null);
    const id = activeRef.current;
    if (!id || !window.videe?.exportVideo) { notify('Exporting needs the Videe desktop app.'); return; }
    const parts = normalizeSegments(segmentsRef.current, duration).map(({start, end}) => ({start, end}));
    setJobKind('export'); setConversion(0); setConversionTotal(segmentsDuration(parts, duration));
    try {
      const result = await window.videe.exportVideo(id, {...options, segments: parts, duration});
      if (!result) return;
      if (options.destination === 'apply' && result.src) {
        updateItem(id, { size: result.size, position: 0, duration: 0, loopA: undefined, loopB: undefined, thumbnail: undefined, thumbnailVersion: 0 });
        segmentsRef.current = []; setSegments([]); setSelectedSegment(null); past.current = []; future.current = []; setPreviewEdits(false);
        setAb({ a: null, b: null }); setLooping(false); engineRef.current = 'direct'; liveOffset.current = 0; setEngine('direct'); engineOverride.current.delete(id);
        startFromBeginning.current = true; playAfterLoad.current = false; firstLoad.current = true; filmstripFor.current = ''; setFilmstrip([]);
        const refreshed = await window.videe.analyzeVideo(id).catch(() => null); analysisRef.current = refreshed; setAnalysis(refreshed);
        setError(''); setSource(result.src); setLoading(true); setPosition(0);
        notify('Edits applied. The original file is unchanged.');
      } else if (result.path) {
        if (result.record) { const record = result.record; const fresh = itemsRef.current.some(i => i.id === record.id) ? [] : [{...record, originalName: record.name}]; for (const item of fresh) await saveItem(item); if (fresh.length) { const next = [...itemsRef.current, ...fresh]; itemsRef.current = next; setItems(next); fileIntoScope(fresh.map(i => i.id)); } }
        const file = result.path;
        notifyAction(`Exported ${file.split(/[\\/]/).pop()}`, 'Show in folder', () => void window.videe?.revealFile(file));
      }
    } catch (e) { notify(e instanceof Error ? e.message : 'Export failed.'); }
    finally { setConversion(null); setJobKind('convert'); }
  };
  useEffect(() => { revealChrome(); return () => window.clearTimeout(chromeHide.current); }, [revealChrome, playing]);
  useEffect(() => () => { window.clearTimeout(videoClick.current); window.clearTimeout(liveSeekTimer.current); window.clearTimeout(osdTimer.current); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeRef.current || e.altKey) return;
      if (e.key === 'Escape' && document.fullscreenElement && !e.ctrlKey && !e.metaKey) { e.preventDefault(); void document.exitFullscreen(); return; }
      if (controlsLocked || e.defaultPrevented || minimized) return;
      if ((e.target as HTMLElement).closest('input,select,textarea,button,dialog,summary,a,[contenteditable]:not([contenteditable="false"]),[role="button"]') || modal || deleteIds || infoId) return;
      const key = e.key.toLowerCase();
      if (editing && (e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (editing && (e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); redo(); return; }
      if (e.ctrlKey || e.metaKey) return;
      if (e.shiftKey && key === 's') { e.preventDefault(); void snapshot(); return; }
      if (e.shiftKey) return;
      const video = videoRef.current;
      const time = pendingSeek.current ?? now();
      const length = durationRef.current || (video && Number.isFinite(video.duration) ? video.duration : 0);
      if (editing && key === 'i') { e.preventDefault(); markIn(); return; }
      if (editing && key === 'o') { e.preventDefault(); markOut(); return; }
      if (editing && key === 's') { e.preventDefault(); splitAtPlayhead(); return; }
      if (editing && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSegment(); return; }
      if (e.code === 'Space' || key === 'k') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); seek(time + 10); showOsd(`+10s · ${timeLabel(Math.min(length, time + 10))}`); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); seek(time - 10); showOsd(`−10s · ${timeLabel(Math.max(0, time - 10))}`); }
      else if (e.code === 'ArrowUp') { e.preventDefault(); setMuted(false); setPrefs(p => { const volume = Math.min(1, Math.round((p.volume + 0.05) * 100) / 100); showOsd(`Volume ${Math.round(volume * 100)}%`); return { ...p, volume }; }); }
      else if (e.code === 'ArrowDown') { e.preventDefault(); setMuted(false); setPrefs(p => { const volume = Math.max(0, Math.round((p.volume - 0.05) * 100) / 100); showOsd(`Volume ${Math.round(volume * 100)}%`); return { ...p, volume }; }); }
      else if (e.code === 'Home') { e.preventDefault(); seek(0); }
      else if (e.code === 'End') { e.preventDefault(); seek(Math.max(0, length - 0.05)); }
      else if (e.code.startsWith('Digit')) { const n = Number(e.code.slice(5)); if (n >= 0 && n <= 9 && length) { e.preventDefault(); seek(length * n / 10); showOsd(`${n * 10}% · ${timeLabel(length * n / 10)}`); } }
      else if (e.key === '[' || e.key === ']') { e.preventDefault(); setPrefs(p => { const speed = stepSpeed(p.speed, e.key === ']' ? 1 : -1); showOsd(`Speed ${speed}×`); return { ...p, speed }; }); }
      else if (e.key === ',' || e.key === '.') { e.preventDefault(); video?.pause(); if (engineRef.current === 'live') playAfterLoad.current = false; seek(time + (e.key === '.' ? 1 / fps : -1 / fps)); showOsd(timecode(Math.max(0, time + (e.key === '.' ? 1 / fps : -1 / fps)), fps)); }
      else if (key === 'e') { e.preventDefault(); toggleEditor(); }
      else if (key === 'f') void fullscreen();
      else if (key === 'm') { setMuted(value => { showOsd(value ? 'Sound on' : 'Muted'); return !value; }); }
      else if (key === 'c') { if (subtitle || embeddedTracks.length) setCaptions(value => { showOsd(value ? 'Subtitles off' : 'Subtitles on'); return !value; }); else setModal('subtitles'); }
      revealChrome();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [togglePlay, seek, fullscreen, modal, deleteIds, infoId, controlsLocked, minimized, subtitle, embeddedTracks.length, revealChrome, now, fps, editing, markIn, markOut, splitAtPlayhead, deleteSegment, undo, redo, snapshot, toggleEditor, showOsd]);
  useEffect(() => {
    if (!active || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    try { session.metadata = new MediaMetadata({ title: active.name.replace(/\.[^.]+$/, ''), artwork: active.thumbnail ? [{ src: active.thumbnail }] : [] }); } catch { /* MediaMetadata artwork is best-effort. */ }
    const bind = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => { try { session.setActionHandler(action, fn); } catch { /* Unsupported session action. */ } };
    bind('play', () => { void videoRef.current?.play().catch(() => {}); });
    bind('pause', () => videoRef.current?.pause());
    bind('previoustrack', () => nextVideo(-1));
    bind('nexttrack', () => nextVideo(1));
    bind('seekbackward', () => seek(now() - 10));
    bind('seekforward', () => seek(now() + 10));
    bind('seekto', details => { if (typeof details.seekTime === 'number') seek(details.seekTime); });
    session.playbackState = playing ? 'playing' : 'paused';
    return () => { (['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto'] as const).forEach(action => bind(action, null)); };
  }, [active?.id, active?.name, active?.thumbnail, playing, nextVideo, seek, now]);
  useEffect(() => {
    if (!active || !duration || !('mediaSession' in navigator)) return;
    try { navigator.mediaSession.setPositionState({ duration, playbackRate: prefs.speed, position: clampTime(position, duration) }); } catch { /* Position state is optional. */ }
  }, [activeId, duration, position, prefs.speed]);
  // Stutter watch: when direct decoding drops frames, switch to live conversion (VLC-style frame pacing).
  useEffect(() => {
    if (!playing || engine !== 'direct' || !active?.native || !window.videe?.liveSource || prefs.smooth !== 'auto' || minimized || engineOverride.current.get(active.id) === 'direct') return;
    const video = videoRef.current; if (!video?.getVideoPlaybackQuality) return;
    let last = video.getVideoPlaybackQuality(); let strikes = 0; let warm = 0;
    const timer = window.setInterval(() => {
      const current = videoRef.current; if (!current) return;
      const quality = current.getVideoPlaybackQuality();
      const total = quality.totalVideoFrames - last.totalVideoFrames; const dropped = quality.droppedVideoFrames - last.droppedVideoFrames; last = quality;
      if (current.paused || current.seeking || document.hidden || current.playbackRate > 2 || ++warm < 2 || total < 10) return;
      strikes = dropped / total > 0.12 ? strikes + 1 : Math.max(0, strikes - 1);
      if (strikes >= 2) { window.clearInterval(timer); void switchEngine('live', 'Stutter detected · smooth playback on'); }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [playing, engine, active?.id, active?.native, prefs.smooth, minimized, switchEngine]);
  useEffect(() => {
    if (modal !== 'playback') return;
    const sample = () => { const quality = videoRef.current?.getVideoPlaybackQuality?.(); if (quality) setFrameStats({dropped: quality.droppedVideoFrames, total: quality.totalVideoFrames}); };
    sample(); const timer = window.setInterval(sample, 1000);
    return () => window.clearInterval(timer);
  }, [modal]);
  const loaded = () => {
    const video = videoRef.current; if(!video || !activeId) return;
    const live = engineRef.current === 'live';
    const first = firstLoad.current; firstLoad.current = false;
    const probed = analysisRef.current?.info.duration || 0;
    const finiteDuration = live ? (probed || durationRef.current) : (Number.isFinite(video.duration) ? video.duration : 0);
    setDuration(finiteDuration); durationRef.current = finiteDuration; video.playbackRate = prefs.speed; video.volume = prefs.volume; setLoading(false);
    if (finiteDuration) updateItem(activeId,{duration:finiteDuration});
    const stored = itemsRef.current.find(i=>i.id===activeId);
    if (first) {
      const saved = clipLoop(stored?.loopA ?? NaN, stored?.loopB ?? NaN, finiteDuration);
      if (saved) { setAb(saved); setLooping(true); }
    }
    // Some MP4s carry a codec the decoder silently skips, leaving sound with a black picture.
    if (!live && active?.native && analysisRef.current?.info.video && !video.videoWidth && window.videe?.liveSource) {
      void switchEngine('live', 'Converting video for playback'); return;
    }
    if (!live) {
      if (seekOnLoad.current !== null) { video.currentTime = clampTime(seekOnLoad.current, finiteDuration); setPosition(video.currentTime); seekOnLoad.current = null; }
      else if (first) {
        const storedPosition = stored?.position || 0;
        if((!startFromBeginning.current || forceResume.current) && (prefs.resume || forceResume.current) && storedPosition < finiteDuration - 2) { video.currentTime = storedPosition; setPosition(storedPosition); }
      }
    }
    if((first && prefs.autoplay) || playAfterLoad.current) void video.play().catch(()=>{});
    playAfterLoad.current = false; startFromBeginning.current = false; forceResume.current = false;
  };
  const handleEnded = () => {
    if(looping&&ab.a!==null&&ab.b!==null) { seek(ab.a); if (engineRef.current === 'live') playAfterLoad.current = true; else void videoRef.current?.play().catch(()=>notify('Press Play to resume.')); return; }
    if(activeId) updateItem(activeId,{position:0});
    const next = nextOnEnded(queue.current.indexOf(activeId || ''), queue.current.length, prefs.repeat, prefs.autoAdvance);
    const item = itemsRef.current.find(i => i.id === queue.current[next]);
    if(!item) return;
    if(item.id === activeId) { if (engineRef.current === 'live' && activeId) { void startLive(activeId, 0, true); return; } seek(0); void videoRef.current?.play().catch(()=>notify('Press Play to resume.')); }
    else void openItem(item, true);
  };
  const handleVideoError = () => {
    const item = itemsRef.current.find(i => i.id === activeRef.current);
    const at = pendingSeek.current ?? now();
    if (item?.native && window.videe?.liveSource) {
      if (engineRef.current === 'direct' && !triedLive.current && engineOverride.current.get(item.id) !== 'direct') { triedLive.current = true; void switchEngine('live', 'Converting video for playback'); return; }
      if (engineRef.current === 'live' && recoveries.current < 2) { recoveries.current++; void startLive(item.id, at, true); return; }
    }
    setLoading(false); setPlaying(false); setError('This video format is not supported by this player.');
  };
  const handleTimeUpdate = () => {
    if (pendingSeek.current !== null) return;
    const t = now();
    if (stopAt.current !== null && t >= stopAt.current) { stopAt.current = null; videoRef.current?.pause(); if (engineRef.current === 'live') playAfterLoad.current = false; return; }
    if (looping && ab.a !== null && ab.b !== null && t >= ab.b) { seek(ab.a); if (engineRef.current === 'live') playAfterLoad.current = true; return; }
    if (previewEdits && segmentsRef.current.length) {
      const kept = normalizeSegments(segmentsRef.current, durationRef.current);
      if (!kept.some(s => t >= s.start - 0.02 && t < s.end)) {
        const next = kept.find(s => s.start > t - 0.02);
        if (next) { seek(next.start); if (engineRef.current === 'live') playAfterLoad.current = true; }
        else { videoRef.current?.pause(); if (engineRef.current === 'live') playAfterLoad.current = false; setPreviewEdits(false); }
        return;
      }
    }
    if (Math.abs(t - lastPositionPaint.current) >= .25) { lastPositionPaint.current = t; setPosition(t); }
    if (performance.now() - lastSave.current > 15000) saveProgress();
  };
  const shiftCues = (event: React.SyntheticEvent<HTMLTrackElement>) => {
    const offset = engineRef.current === 'live' ? liveOffset.current : 0;
    const track = event.currentTarget.track;
    if (!offset || !track?.cues) return;
    for (const cue of Array.from(track.cues)) {
      if (cue.endTime - offset <= 0) { track.removeCue(cue); continue; }
      cue.startTime = Math.max(0, cue.startTime - offset); cue.endTime -= offset;
    }
  };
  const persistLoop = (range: {a:number;b:number}) => { if(activeId) updateItem(activeId,{loopA:range.a,loopB:range.b}); };
  const applyLoop = (a: number, b: number) => {
    const range = clipLoop(a, b, duration);
    if (!range) { notify('Set a loop at least 0.25 seconds long.'); return null; }
    setAb(range); persistLoop(range); return range;
  };
  const toggleLoop = () => {
    if (looping) { setLooping(false); return; }
    setLooping(true);
    const stored = itemsRef.current.find(i => i.id === activeId);
    const saved = clipLoop(stored?.loopA ?? ab.a ?? NaN, stored?.loopB ?? ab.b ?? NaN, duration);
    if (saved) { setAb(saved); seek(saved.a); }
    else setAb({ a: null, b: null });
  };
  const onSeekBar = (value: number) => {
    if (looping && (ab.a === null || ab.b === null)) {
      if (ab.a === null) { setAb({ a: value, b: null }); seek(value); return; }
      const range = applyLoop(ab.a, value);
      if (range) seek(range.a);
      return;
    }
    seek(value);
  };
  const importSubtitle = async (file?: File) => { if(!file) return; try { if(file.size > 5*1024*1024) throw new Error('Choose a subtitle file smaller than 5 MB.'); const text = toVtt(await file.text()); setSubtitle({url:URL.createObjectURL(new Blob([text],{type:'text/vtt'})),name:file.name}); setCaptions(true); } catch(e) { notify(e instanceof Error ? e.message : 'Could not load subtitles.'); } };
  const convert = async (fast = false) => {
    if(!active?.native || !window.videe) return;
    const id = active.id; const at = pendingSeek.current ?? now(); const play = !!videoRef.current && !videoRef.current.paused;
    setJobKind(fast ? 'prepare' : 'convert'); setConversion(0); setConversionTotal(analysisRef.current?.info.duration || duration);
    try {
      const src = fast ? (await window.videe.prepareVideo(id)).src : await window.videe.convertVideo(id);
      if (activeRef.current !== id) return;
      engineOverride.current.delete(id); engineRef.current = 'direct'; liveOffset.current = 0; setEngine('direct');
      const refreshed = await window.videe.analyzeVideo(id).catch(() => null); analysisRef.current = refreshed; setAnalysis(refreshed);
      seekOnLoad.current = at; playAfterLoad.current = play; setError(''); setSource(src); setLoading(true);
      notify('Optimized copy ready. Seeking is now instant.');
    } catch(e) { notify(e instanceof Error ? e.message : 'Could not convert this video.'); }
    finally { setConversion(null); setJobKind('convert'); }
  };
  const removeOptimized = async () => {
    if (!active?.native || !window.videe?.useOriginal) return;
    const id = active.id;
    try { await window.videe.useOriginal(id); engineOverride.current.delete(id); const refreshed = await window.videe.analyzeVideo(id).catch(() => null); analysisRef.current = refreshed; setAnalysis(refreshed); await switchEngine(refreshed?.plan.mode === 'direct' ? 'direct' : 'live'); engineOverride.current.delete(id); }
    catch (e) { notify(e instanceof Error ? e.message : 'Could not remove the optimized copy.'); }
  };
  const removeFromLibrary = async (ids: string[]) => {
    const unique = [...new Set(ids)].filter(id => itemsRef.current.some(item => item.id === id));
    if (!unique.length) { setDeleteIds(null); return; }
    try {
      for (const id of unique) {
        const item = itemsRef.current.find(current => current.id === id);
        if (item?.native) await window.videe?.forgetVideo(id);
        await removeItem(id);
        const url = urls.current.get(id);
        if (url) { URL.revokeObjectURL(url); urls.current.delete(id); }
      }
      if (activeRef.current && unique.includes(activeRef.current)) {
        ++openSequence.current;
        videoRef.current?.pause();
        setActiveId(null); activeRef.current = null; setSource(''); setError(''); setLoading(false); setPosition(0); setDuration(0); setSubtitle(null); setEditing(false);
      }
      const next = itemsRef.current.filter(item => !unique.includes(item.id));
      itemsRef.current = next;
      setItems(next);
      setSelected(current => current.filter(id => !unique.includes(id)));
      saveCollections(collectionsRef.current.map(collection => ({ ...collection, ids: collection.ids.filter(id => !unique.includes(id)) })));
      setDeleteIds(null);
    } catch { notify('Could not remove this video. Cancel any active conversion first.'); }
  };
  const confirmDelete = async () => { if (deleteIds?.length) await removeFromLibrary(deleteIds); };
  const deleteCollection = async (collection: Collection) => {
    if (collection.kind === 'folder') await removeFromLibrary(collection.ids);
    saveCollections(collectionsRef.current.filter(current => current.id !== collection.id));
    setScope(current => current === collection.id ? '' : current);
  };
  const currentCollection = collections.find(c=>c.id===scope);
  const playlistOrder = currentCollection?.kind==='playlist' ? currentCollection : undefined;
  const activeSortKey = sortKey(scope, view, !!playlistOrder);
  const activeSort = (activeSortKey && folderSort[activeSortKey]) || { sort: prefs.sort, dir: prefs.sortDir };
  const filtered = useMemo(() => items
    .filter(item => (!scope || collections.find(c=>c.id===scope)?.ids.includes(item.id)) && (view !== 'favorites' || item.favorite) && (view !== 'continue' || (item.position > 0 && item.position < item.duration - 2)) && item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a,b) => playlistOrder ? playlistOrder.ids.indexOf(a.id)-playlistOrder.ids.indexOf(b.id) : compareMedia(a,b,activeSort.sort,activeSort.dir)), [items,view,query,activeSort.sort,activeSort.dir,scope,collections,playlistOrder]);
  visibleIds.current = filtered.map(i=>i.id);
  const counts = useMemo(() => ({
    all: items.length,
    continue: items.filter(item => item.position > 0 && item.position < item.duration - 2).length,
    favorites: items.filter(item => item.favorite).length,
    collections: Object.fromEntries(collections.map(c => [c.id, c.ids.filter(id => items.some(item => item.id === id)).length])),
  }), [items, collections]);
  const folderOf = useMemo(() => { const map = new Map<string,string>(); for (const c of collections) if (c.kind === 'folder') for (const id of c.ids) map.set(id, c.name); return map; }, [collections]);
  const totals = useMemo(() => ({ duration: filtered.reduce((sum, item) => sum + (item.duration || 0), 0), size: filtered.reduce((sum, item) => sum + (item.size || 0), 0) }), [filtered]);
  const index = queue.current.indexOf(activeId || '');
  const info = items.find(item => item.id === infoId);
  const nativeShell = Boolean(window.videe) || Capacitor.isNativePlatform();
  const siteHref = import.meta.env.DEV ? '/site.html' : '/';
  const destinations = [{id:'all' as View, label:'All videos', icon:Film}, {id:'continue' as View,label:'Continue watching',icon:Gauge}, {id:'favorites' as View,label:'Favorites',icon:Check}];
  const folders = collections.filter(c => c.kind === 'folder');
  const sortLabel = {recent: 'Recently played', name: 'Name', duration: 'Duration', size: 'Size'}[activeSort.sort];
  const persistSort = (next: {sort: LibrarySort; dir: string}) => {
    if (!activeSortKey) return;
    const dir = next.dir === 'asc' ? 'asc' as const : 'desc' as const;
    const map = {...folderSort, [activeSortKey]: { sort: next.sort, dir }};
    setFolderSort(map);
    try { writeFolderSort(map); } catch { notify('Could not save sort order.'); }
    if (!scope) setPrefs({...prefs, sort: next.sort, sortDir: dir});
  };
  const chooseSort = (sort: LibrarySort) => persistSort({ sort, dir: activeSort.sort === sort ? activeSort.dir : DEFAULT_DIR[sort] });
  const toggleSort = (sort: LibrarySort) => persistSort(nextSortPref(activeSort, sort));
  const pickingLoop = looping && (ab.a===null || ab.b===null);
  const range = looping ? ab : {a:null,b:null};
  const rangeStartPct = duration && range.a!==null ? (range.a/duration)*100 : 0;
  const rangeEndPct = !duration || range.b===null ? 100 : (range.b/duration)*100;
  const clearFilters = () => { setQuery(''); setViewSlide('in'); setScope(''); setView('all'); };
  const viewOrder: View[] = ['all', 'continue', 'favorites'];
  const selectView = (next: View) => {
    if (next === view) {setViewSlide('in');setScope('');return;}
    setViewSlide(viewOrder.indexOf(next) > viewOrder.indexOf(view) ? 'fwd' : 'back');
    setView(next); setScope('');
  };
  const openScope = (id: string) => { setViewSlide('in'); setScope(id); setView('all'); setQuery(''); };
  const setLayout = (layout: Preferences['layout']) => {
    if (layout === prefs.layout) return;
    setViewSlide(layout);
    setPrefs({...prefs, layout});
  };
  const minimizePlayer = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    saveProgress(); setItems(itemsRef.current); setControlsLocked(false); setEditing(false);
    setVideoZoom(1); setVideoPan({x:0,y:0}); setMinimized(true); setViewSlide('in');
  };
  const closePlayer = () => {
    if(conversion !== null) { notify('Cancel the current video task before returning to the library.'); return; }
    saveProgress(); videoRef.current?.pause(); ++openSequence.current; window.clearTimeout(liveSeekTimer.current); pendingSeek.current = null;
    if (engineRef.current === 'live') void window.videe?.stopLive?.();
    engineRef.current = 'direct'; liveOffset.current = 0; setEngine('direct');
    activeRef.current = null; setMinimized(false); setItems(itemsRef.current); setActiveId(null); setSource(''); setError(''); setLoading(false); setPlaying(false); setSubtitle(null); setEmbeddedTracks([]); setViewSlide('in'); setEditing(false);
  };
  const dropOnFolder = (id: string, ids: string[]) => {
    const target = collectionsRef.current.find(c => c.id === id);
    if (relocate(ids, id)) notify(target ? `Moved ${ids.length} ${ids.length === 1 ? 'video' : 'videos'} to ${target.name}.` : `Removed ${ids.length} ${ids.length === 1 ? 'video' : 'videos'} from folders.`);
  };
  // Stable card actions: rows re-render only when their own video changes.
  const cardActions = useRef<CardActions>(null!);
  cardActions.current = {
    open: (item, resume = false) => void openItem(item, resume, resume),
    select: (id, checked, rangeSelect) => {
      const order = visibleIds.current;
      if (rangeSelect && lastChecked.current && order.includes(lastChecked.current)) {
        const [from, to] = [order.indexOf(lastChecked.current), order.indexOf(id)].sort((a, b) => a - b);
        const span = order.slice(from, to + 1);
        setSelected(current => checked ? [...new Set([...current, ...span])] : current.filter(value => !span.includes(value)));
      } else setSelected(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id));
      lastChecked.current = id;
    },
    favorite: id => { const item = itemsRef.current.find(i => i.id === id); if (item) updateItem(id, {favorite: !item.favorite}); },
    info: id => setInfoId(id),
    reset: id => { updateItem(id, {position: 0, lastPlayed: 0}); notify('Watch history reset.'); },
    move: (ids, dest) => { relocate(ids, dest); },
    remove: id => setDeleteIds([id]),
    reveal: window.videe?.revealVideo ? id => void window.videe?.revealVideo(id) : undefined,
    dragIds: id => selectedRef.current.includes(id) ? selectedRef.current.slice() : [id],
    openFolder: id => openScope(id),
    dropOnFolder,
  };
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
  const timeText = (seconds: number) => prefs.timecode ? timecode(seconds, fps) : timeLabel(seconds);
  const engineLabel = engine === 'live' ? 'Smooth playback' : analysis?.converted === 'optimized' ? 'Optimized copy' : analysis?.converted === 'edited' ? 'Edited copy' : '';
  const jobPercent = conversion !== null && conversionTotal ? Math.min(100, conversion / conversionTotal * 100) : 0;
  const blockingJob = conversion !== null && jobKind !== 'export';
  const locationName = currentCollection ? currentCollection.name : view === 'continue' ? 'Continue watching' : view === 'favorites' ? 'Favorites' : 'All videos';
  const LocationIcon = currentCollection ? (currentCollection.kind === 'playlist' ? ListVideo : Folder) : Layers;
  const showFolders = !scope && view === 'all' && !query && folders.length > 0;
  const hoverFrame = hover && filmstrip.length ? filmstrip[Math.min(filmstrip.length - 1, Math.floor(hover.pct / 100 * filmstrip.length))] : null;
  return <div className={`app-shell ${watching ? 'watching' : 'browsing'} ${window.videe?.platform === 'darwin' ? 'native-mac' : ''}`}
    onDragEnter={e => { e.preventDefault(); if(controlsLocked)return; if(e.dataTransfer.types.includes('Files')) { dragDepth.current++; setDragging(true); } }}
    onDragOver={e => e.preventDefault()}
    onDragLeave={e => { e.preventDefault(); if(--dragDepth.current <= 0) { dragDepth.current=0; setDragging(false); } }}
    onDrop={e => { e.preventDefault(); dragDepth.current=0; setDragging(false); if (e.dataTransfer.files.length) void importFiles(Array.from(e.dataTransfer.files)); }}>
    <a className="skip-link" href="#main">Skip to content</a>
    <input ref={fileRef} className="file-input" type="file" accept="video/*,.mkv,.avi,.divx,.wmv,.asf,.flv,.f4v,.mpeg,.mpg,.m2ts,.mts,.ts,.3gp,.3g2,.ogv,.vob,.mxf,.dv,.hevc,.av1,.rm,.rmvb" multiple hidden onChange={e => { void importFiles(Array.from(e.target.files || [])); e.target.value=''; }}/>
    <input ref={bindFolderInput} className="folder-input" type="file" multiple hidden onChange={e => { const files = Array.from(e.target.files || []); e.target.value=''; if(!files.length) { notify('No videos in this folder.'); return; } void importFiles(files); }}/>
    <input ref={subtitleRef} type="file" accept=".srt,.vtt" hidden onChange={e => { void importSubtitle(e.target.files?.[0]); e.target.value=''; }}/>

    <header className="app-header" inert={controlsLocked}>
      {watching ? <div className="player-heading"><IconButton icon={ArrowLeft} label="Back to library" onClick={() => void minimizePlayer()}/><h1 title={active.name}>{active.name}</h1>{engineLabel && <button type="button" className={`engine-badge ${engine}`} onClick={() => setModal('playback')} title="Playback details"><Zap size={13} aria-hidden="true"/>{engineLabel}</button>}</div>
        : <div className="brand"><img src="./icon.png" width="30" height="30" alt=""/><span>Videe</span></div>}
      <div className="header-actions">
        {!watching && <><button className="icon-button header-open-video" aria-label="Open video" title="Open video" disabled={busy || !ready} onClick={() => void pickFiles()}>{busy || !ready ? <Loader2 size={18} className="spin" aria-hidden="true"/> : <Upload size={18} strokeWidth={1.8} aria-hidden="true"/>}</button><button className="icon-button header-open" aria-label="Open folder" title="Open folder" disabled={busy || !ready} onClick={() => void pickFolder()}>{busy || !ready ? <Loader2 size={18} className="spin" aria-hidden="true"/> : <FolderOpen size={18} strokeWidth={1.8} aria-hidden="true"/>}</button></>}
        {watching && <IconButton icon={Scissors} label={editing ? 'Close editor' : 'Edit video'} active={editing} disabled={!duration || !!error} onClick={toggleEditor}/>}
        <IconButton icon={Settings2} label="Settings" onClick={() => setModal('settings')}/>
      </div>
    </header>

    {!watching && <Sidebar view={view} scope={scope} counts={counts} collections={collections} collapsed={prefs.sidebar === 'collapsed'} onView={selectView} onScope={openScope} onCreate={kind => { setCreating(kind); setNewName(''); }} onDropIds={dropOnFolder} onToggle={() => setPrefs({...prefs, sidebar: prefs.sidebar === 'collapsed' ? 'expanded' : 'collapsed'})}/>}
    <main id="main" tabIndex={-1} className={editing && watching ? 'editing' : undefined}>
      {!watching && <div className="library-organization"><Organization items={items} collections={collections} save={saveCollections} selected={selected} select={setSelected} scope={scope==='unfiled'?'':scope} setScope={value=>openScope(value==='unfiled'?'':value)} rename={batchRename} onDeleteCollection={deleteCollection}/></div>}
      {active && <section className={`player-view${minimized ? ' mini-player' : ''}`} aria-label={minimized ? 'Mini player' : 'Video player'}>
        <div className="player-stage" ref={stageRef} data-chrome={chrome || controlsLocked || editing ? 'on' : 'off'} onPointerMove={() => revealChrome()}>
          <div className="video-surface" inert={controlsLocked}>
            {source && <video key={source} ref={videoRef} src={source} playsInline preload={engine === 'live' ? 'auto' : 'metadata'} muted={muted} loop={prefs.repeat==='one' && !(looping && ab.b!==null) && engine === 'direct'} data-zoomed={videoZoom>1?'' : undefined} style={{transform:`translate(${videoPan.x}px, ${videoPan.y}px) scale(${videoZoom})`}} onClick={handleVideoClick} onDoubleClick={handleVideoDoubleClick} onWheel={handleVideoWheel} onPointerDown={startVideoPan} onPointerMove={moveVideoPan} onPointerUp={endVideoPan} onPointerCancel={endVideoPan} onLoadedMetadata={loaded} onPlay={()=>setPlaying(true)} onPause={()=>{setPlaying(false);saveProgress();}} onWaiting={()=>setLoading(true)} onPlaying={()=>setLoading(false)} onCanPlay={()=>setLoading(false)} onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} onError={handleVideoError}>{subtitle?.url && <track key={subtitle.url} kind="subtitles" src={subtitle.url} srcLang="ja" label={subtitle.name} default onLoad={shiftCues}/>}</video>}
            {loading && !error && !blockingJob && <div className="loading-overlay" role="status"><Loader2 size={28} className="spin"/><span className="sr-only">Loading…</span></div>}
            {blockingJob && !error && <div className="cut-progress" role="status"><Loader2 size={28} className="spin"/><span>{jobKind === 'prepare' ? 'Preparing smooth playback' : 'Creating optimized copy'} · {conversionTotal ? `${Math.round(jobPercent)}%` : timeLabel(conversion ?? 0)}</span><progress className="job-progress" max={100} value={jobPercent}/><button className="secondary-button" onClick={() => void window.videe?.cancelConversion()}>Cancel</button></div>}
            {osd && <div className="player-osd" role="status" aria-live="polite">{osd}</div>}
            {error && <div className="player-error"><Film size={28} aria-hidden="true"/><h2>Can’t play</h2>
              <p>{active.native ? 'Convert to a supported format.' : 'This format isn’t supported.'}</p>
              {active.native && (conversion !== null ? <><span className="conversion-status"><Loader2 size={16} className="spin"/>Converting · {timeLabel(conversion)}</span><button className="secondary-button" onClick={() => void window.videe?.cancelConversion()}>Cancel</button></>
                : <button className="primary-button" onClick={() => void convert()}>Convert & play</button>)}
              <details className="error-details"><summary>Details</summary><p>{error}</p></details>
            </div>}
          </div>
          {minimized && <div className="mini-controls">
            <IconButton icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} onClick={togglePlay}/>
            <IconButton icon={Maximize} label="Restore player" onClick={()=>setMinimized(false)}/>
            <IconButton icon={X} label="Close player" onClick={closePlayer}/>
          </div>}
          <div className="player-controls" onPointerEnter={() => revealChrome(true)} onPointerLeave={() => revealChrome()} onFocusCapture={() => revealChrome(true)}>
            <div className="seek-bar" data-loop={looping?'':undefined} data-live={engine === 'live' ? '' : undefined} inert={controlsLocked||undefined} style={{'--progress':`${duration ? position/duration*100 : 0}%`,'--loop-a':`${rangeStartPct}%`,'--loop-b':`${rangeEndPct}%`} as React.CSSProperties}
              onPointerEnter={() => loadFilmstrip()}
              onPointerMove={e => { if (!duration) return; const rect = e.currentTarget.getBoundingClientRect(); const pct = Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100)); setHover({ t: pct / 100 * duration, pct }); }}
              onPointerLeave={() => setHover(null)}>
              <input className="seek-play" aria-label={pickingLoop ? (ab.a===null ? 'Loop start' : 'Loop end') : 'Playback position'} type="range" min="0" max={duration || 1} step="0.1" value={position} aria-valuetext={`${timeLabel(position)} of ${timeLabel(duration)}`} disabled={!duration || !!error} onChange={e => onSeekBar(Number(e.target.value))}/>
              {looping && range.a!==null && <input className="seek-a" aria-label="Loop start" type="range" min="0" max={duration || 1} step="0.1" value={range.a} disabled={!duration || !!error} onChange={e => ab.b===null ? setAb({a:Number(e.target.value),b:null}) : applyLoop(Number(e.target.value), ab.b)}/>}
              {looping && range.b!==null && <input className="seek-b" aria-label="Loop end" type="range" min="0" max={duration || 1} step="0.1" value={range.b} disabled={!duration || !!error} onChange={e => applyLoop(ab.a!, Number(e.target.value))}/>}
              {segments.length > 0 && <span className="seek-segments" aria-hidden="true">{normalizeSegments(segments, duration).map(s => <span key={`${s.start}-${s.end}`} style={{left:`${s.start / (duration || 1) * 100}%`, width:`${(s.end - s.start) / (duration || 1) * 100}%`}}/>)}</span>}
              {hover && <span className="seek-hover" style={{left:`${hover.pct}%`}} aria-hidden="true">{hoverFrame && <img src={hoverFrame} alt=""/>}<span>{timeText(hover.t)}</span></span>}
            </div>
            <div className="control-row">
              <div className="transport" inert={controlsLocked||undefined}>
                <IconButton icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} className="transport-play" disabled={!source || !!error} onClick={togglePlay}/>
                <IconButton icon={Rewind} label="Back 10 seconds" disabled={!!error} onClick={() => seek((pendingSeek.current ?? position)-10)}/>
                <IconButton icon={FastForward} label="Forward 10 seconds" disabled={!!error} onClick={() => seek((pendingSeek.current ?? position)+10)}/>
                {index > 0 && <IconButton icon={SkipBack} label="Previous video" onClick={() => nextVideo(-1)}/>}{index < queue.current.length-1 && <IconButton icon={SkipForward} label="Next video" onClick={() => nextVideo(1)}/>}
                <button type="button" className="time-label" title="Show remaining time" onClick={() => setPrefs({...prefs, timeDisplay: prefs.timeDisplay === 'remaining' ? 'elapsed' : 'remaining'})}>{prefs.timeDisplay === 'remaining' ? `−${timeText(Math.max(0, duration - position))}` : timeText(position)}<span> / {timeText(duration)}</span></button>
              </div>
              <div className="playback-options">
                <IconButton icon={controlsLocked ? LockKeyhole : LockKeyholeOpen} label={controlsLocked ? 'Unlock controls' : 'Lock controls'} active={controlsLocked} disabled={blockingJob} onClick={()=>{setControlsLocked(locked=>!locked);setChrome(true);}}/>
                <div className="playback-more" inert={controlsLocked||undefined}>
                  <IconButton icon={LoopRangeIcon} label="Loop" active={looping} disabled={!duration || !!error || blockingJob} onClick={toggleLoop}/>
                  <IconButton icon={prefs.repeat==='one'?Repeat1:Repeat} label={`Repeat: ${prefs.repeat==='off'?'Off':prefs.repeat==='one'?'One':'All'}`} active={prefs.repeat!=='off'} onClick={()=>setPrefs({...prefs,repeat:prefs.repeat==='off'?'one':prefs.repeat==='one'?'all':'off'})}/>
                  <div className="volume-control"><IconButton icon={muted || prefs.volume===0 ? VolumeX : Volume2} label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)}/><input type="range" aria-label="Volume" title={`${Math.round((muted ? 0 : prefs.volume) * 100)}%`} min="0" max="1" step="0.01" value={muted ? 0 : prefs.volume} style={{'--progress':`${(muted ? 0 : prefs.volume) * 100}%`} as React.CSSProperties} onChange={e => { setMuted(false); setPrefs({...prefs,volume:Number(e.target.value)}); }}/></div>
                  <select className="speed-select" aria-label="Playback speed" value={prefs.speed} onChange={e => setPrefs({...prefs,speed:Number(e.target.value)})}>{SPEEDS.map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select>
                  <button aria-label="Subtitles" title="Subtitles" className={`caption-button ${subtitle && captions ? 'active' : ''}`} onClick={() => setModal('subtitles')}><Captions size={18} aria-hidden="true"/></button>
                  <IconButton icon={Camera} label="Save frame" disabled={!source || !!error} onClick={() => void snapshot()}/>
                  <IconButton icon={Info} label="Playback details" onClick={() => setModal('playback')}/>
                  <IconButton icon={PictureInPicture2} label="Picture in Picture" onClick={() => void pictureInPicture()}/>
                  <IconButton icon={ZoomIn} label="Fill screen" disabled={!source || !!error} onClick={() => void fillScreen()}/>
                  {videoZoom>1 && <IconButton icon={RotateCcw} label="Reset video view" onClick={resetVideoView}/>}
                  <IconButton icon={isFullscreen ? Minimize : Maximize} label={isFullscreen ? 'Exit full screen' : 'Full screen'} onClick={() => void fullscreen()}/>
                </div>
              </div>
            </div>
          </div>
        </div>
        {editing && !minimized && <EditorPanel duration={duration} position={position} fps={fps} native={!!active.native && !!window.videe?.exportVideo} segments={segments} selected={selectedSegment} filmstrip={filmstrip} preview={previewEdits} snap={snap} canUndo={past.current.length > 0} canRedo={future.current.length > 0}
          job={conversion !== null && jobKind === 'export' ? {seconds: conversion, total: conversionTotal} : null}
          onSeek={t => seek(t)} onChange={next => { dragBase.current ??= segmentsRef.current; segmentsRef.current = next; setSegments(next); }} onCommit={next => { if (next) commitSegments(next); else if (dragBase.current) { commitSegments(segmentsRef.current, dragBase.current); } dragBase.current = null; }} onSelect={setSelectedSegment}
          onMarkIn={markIn} onMarkOut={markOut} onSplit={splitAtPlayhead} onDelete={deleteSegment} onPlaySegment={playSegment}
          onUndo={undo} onRedo={redo} onReset={() => { commitSegments([]); setSelectedSegment(null); setPreviewEdits(false); }} onTogglePreview={() => setPreviewEdits(value => !value)} onToggleSnap={() => setSnap(value => !value)}
          onExport={() => setModal('export')} onCancelJob={() => void window.videe?.cancelConversion()} onClose={() => setEditing(false)}/>}
      </section>}
      {!watching && <section className="library-section" aria-label="Library">
        <div className="library-header">
          <div className="library-title"><h1 className="sr-only">Library</h1><p className="library-location"><LocationIcon size={16} aria-hidden="true"/>{scope && <><button type="button" className="crumb" onClick={clearFilters}>Library</button><ChevronRight size={14} aria-hidden="true"/></>}<span>{locationName}</span></p><p className="library-count" role="status">{filtered.length} {filtered.length===1?'video':'videos'}{totals.duration > 0 ? ` · ${durationLabel(totals.duration)}` : ''}{totals.size > 0 ? ` · ${sizeLabel(totals.size)}` : ''}</p></div>
          <nav className="library-tabs" aria-label="Browse videos" data-selected={scope?undefined:view}><span className="tab-pill" aria-hidden="true"/>{destinations.map(({id,label,icon:Icon})=><button key={id} aria-label={label} title={label} className={view===id&&!scope?'selected':''} aria-pressed={view===id&&!scope} onClick={()=>selectView(id)}><Icon size={20} aria-hidden="true"/></button>)}</nav>
          <div className="search-box"><Search size={16} aria-hidden="true"/><input type="search" inputMode="search" name="video-search" autoComplete="off" spellCheck={false} aria-label="Search videos" placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={15} aria-hidden="true"/></button>}</div>
        </div>

        {showFolders && <section className="folder-overview" aria-label="Folders">
          <button type="button" className="section-toggle" aria-expanded={foldersOpen} onClick={() => setFoldersOpen(open => { try { localStorage.setItem('videe-folders-open', String(!open)); } catch { /* Preference only. */ } return !open; })}>{foldersOpen ? <ChevronDown size={15} aria-hidden="true"/> : <ChevronRight size={15} aria-hidden="true"/>}Folders<small>{folders.length}</small></button>
          {foldersOpen && <div className={`folder-grid ${prefs.layout}`}>{folders.map(folder => <FolderCard key={folder.id} folder={folder} items={items} layout={prefs.layout} actions={cardActions}/>)}</div>}
        </section>}
        {playlistOrder&&<button className="secondary-button playlist-play" disabled={!filtered.length} onClick={()=>void openItem(filtered[0],true)}><Play size={15} aria-hidden="true"/>Play playlist</button>}
        <div className="library-toolbar">{(filtered.length > 0 || playlistOrder) && <div className="library-selection">{selected.length > 0 ? <span className="selection-status">{selected.length} selected</span> : playlistOrder ? <span className="selection-status">Playlist order</span> : showFolders ? <span className="selection-status section-label">Videos</span> : null}{filtered.length > 0 && (selected.length === filtered.length ? <button type="button" className="secondary-button" onClick={()=>setSelected([])}>Clear</button> : <button type="button" className="secondary-button" onClick={()=>setSelected(filtered.map(item=>item.id))}>Select all</button>)}{selected.length > 0 && folders.length > 0 && <ChoiceMenu label="Move to" trigger={<><Folder size={19} aria-hidden="true"/><span>Move to</span></>} value="" options={[...(selected.some(id=>folders.some(folder=>folder.ids.includes(id)))?[{value:'library',label:'Remove from folder',icon:<Folder size={17}/>}]:[]),...folders.map(folder=>({value:folder.id,label:folder.name,icon:<Folder size={17}/>}))]} onChange={value=>relocate(selected, value==='library'?'':value)}/>}{selected.length > 0 && <button type="button" className="secondary-button collection-delete-action" onClick={()=>setDeleteIds(selected.slice())}><Trash2 size={16} aria-hidden="true"/>Remove from library</button>}</div>}<div>{prefs.layout==='grid'&&<ChoiceMenu label="Sort by" trigger={<><ArrowDownWideNarrow size={19} aria-hidden="true"/><span>{sortLabel}</span></>} value={activeSort.sort} disabled={!!playlistOrder} options={[{value:'recent',label:'Recently played'},{value:'name',label:'Name'},{value:'duration',label:'Duration'},{value:'size',label:'Size'}]} onChange={value=>chooseSort(value as LibrarySort)}/>}<div className="layout-switch" data-layout={prefs.layout}><span className="layout-pill" aria-hidden="true"/><IconButton icon={LayoutGrid} label="Grid view" active={prefs.layout==='grid'} onClick={()=>setLayout('grid')}/><IconButton icon={List} label="List view" active={prefs.layout==='list'} onClick={()=>setLayout('list')}/></div></div></div>
        {filtered.length > 0 ? <div key={`${view}-${scope}-${prefs.layout}`} data-slide={viewSlide} className={`video-grid ${prefs.layout==='list'?'video-list':''}${selected.length ? ' selecting' : ''}`}>
          {prefs.layout==='list'&&<div className="video-list-head">{SORT_COLUMNS.map(column => <button key={column.id} type="button" className={`list-sort list-sort-${column.id}`} disabled={!!playlistOrder} aria-sort={!playlistOrder && activeSort.sort===column.id ? (activeSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>toggleSort(column.id)}><span>{column.label}</span>{!playlistOrder && activeSort.sort===column.id ? (activeSort.dir==='asc'?<ArrowUp size={12} aria-hidden="true"/>:<ArrowDown size={12} aria-hidden="true"/>) : null}</button>)}<span className="list-actions" aria-hidden="true"/></div>}
          {filtered.map(item => <VideoCard key={item.id} item={item} layout={prefs.layout} selected={selected.includes(item.id)} playing={item.id === activeId} folderName={!scope ? folderOf.get(item.id) || '' : ''} folders={folders} actions={cardActions}/>)}</div> : <div className="no-results">{!ready ? <span className="sr-only">Loading…</span> : items.length===0 && !query && view==='all' && !scope ? <><Film size={30} aria-hidden="true"/><h2>No videos</h2><p className="empty-hint">Drop videos anywhere, or choose files to start watching.</p><div className="empty-actions"><button type="button" className="primary-button" onClick={() => void pickFiles()}><Upload size={16} aria-hidden="true"/>Choose videos…</button><button type="button" className="secondary-button" onClick={() => void pickFolder()}><FolderOpen size={16} aria-hidden="true"/>Choose a folder…</button></div></> : <><Search size={30} aria-hidden="true"/><h2>{query ? 'No videos found' : view==='continue' ? 'Nothing to continue' : scope?'Empty collection':'No favorites'}</h2>{scope && !query && <p className="empty-hint">Drag videos onto this {currentCollection?.kind === 'playlist' ? 'playlist' : 'folder'} in the sidebar.</p>}<button className="secondary-button" onClick={query ? ()=>setQuery('') : clearFilters}>{query ? 'Reset search' : 'Show all videos'}</button></>}</div>}
      </section>}
    </main>

    <div className="drop-overlay" data-active={dragging ? '' : undefined} aria-hidden={!dragging}><Upload size={36} aria-hidden="true"/><span>Drop to watch</span></div>
    {toast && <div className="toast" role="status" aria-live="polite"><span>{toast.text}</span>{toast.action && <button type="button" className="toast-action" onClick={() => { toast.action?.run(); setToast(null); }}>{toast.action.label}</button>}<button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={16} aria-hidden="true"/></button></div>}
    {modal === 'settings' && <Modal title="Settings" onClose={() => setModal(null)}>
      <section className="settings-section" aria-label="Display"><h3>Display</h3><div className="settings-group">
      <label className="setting-row"><span>Appearance</span><select aria-label="Appearance" value={prefs.theme} onChange={e=>setPrefs({...prefs,theme:e.target.value as Preferences['theme']})}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label className="setting-row"><span>Animations</span><input type="checkbox" role="switch" aria-label="Animations" checked={prefs.motion} onChange={e => setPrefs({...prefs,motion:e.target.checked})}/></label>
      <label className="setting-row"><span>Show frames in time</span><input type="checkbox" role="switch" aria-label="Show frames in time" checked={prefs.timecode} onChange={e => setPrefs({...prefs,timecode:e.target.checked})}/></label>
      </div></section><section className="settings-section" aria-label="Playback"><h3>Playback</h3><div className="settings-group">
      <label className="setting-row"><span>Resume playback</span><input type="checkbox" role="switch" aria-label="Resume playback" checked={prefs.resume} onChange={e => setPrefs({...prefs,resume:e.target.checked})}/></label>
      <label className="setting-row"><span>Autoplay</span><input type="checkbox" role="switch" aria-label="Autoplay" checked={prefs.autoplay} onChange={e => setPrefs({...prefs,autoplay:e.target.checked})}/></label>
      <label className="setting-row"><span>Autoplay next</span><input type="checkbox" role="switch" aria-label="Autoplay next" checked={prefs.autoAdvance} onChange={e=>setPrefs({...prefs,autoAdvance:e.target.checked})}/></label>
      <label className="setting-row"><span>Repeat</span><select aria-label="Repeat" value={prefs.repeat} onChange={e=>setPrefs({...prefs,repeat:e.target.value as Preferences['repeat']})}><option value="off">Off</option><option value="one">Repeat one</option><option value="all">Repeat all</option></select></label>
      {window.videe && <>
        <label className="setting-row"><span>Smooth playback<small>Converts unusual codecs, interlaced and stuttering videos on the fly.</small></span><select aria-label="Smooth playback" value={prefs.smooth} onChange={e=>setPrefs({...prefs,smooth:e.target.value as Preferences['smooth']})}><option value="auto">Automatic</option><option value="off">Original only</option></select></label>
        <label className="setting-row"><span>Hardware acceleration<small>Use the GPU to decode and convert video.</small></span><input type="checkbox" role="switch" aria-label="Hardware acceleration" checked={prefs.hardware} onChange={e => setPrefs({...prefs,hardware:e.target.checked})}/></label>
        <div className="setting-row"><span>Optimized copies<small>{cacheBytes === null ? 'Checking…' : cacheBytes ? `${sizeLabel(cacheBytes)} used` : 'None'}</small></span><button className="secondary-button" disabled={!cacheBytes} onClick={() => void window.videe?.clearCache().then(result => { setCacheBytes(0); notify(`Freed ${sizeLabel(result.freed)}.`); }).catch(() => notify('Could not clear optimized copies.'))}>Clear</button></div>
      </>}
      </div>
      {window.videe && <section className="settings-section" aria-label="Video diagnostics"><h3>Video diagnostics</h3><div className="settings-group"><div className="setting-row"><span>Video decoding<small>{gpuStatus ? gpuStatusLabel(gpuStatus.videoDecode) : 'Checking graphics support…'}</small></span><button className="secondary-button" disabled={gpuLoading} onClick={() => void refreshGpuStatus()}>{gpuLoading ? 'Checking…' : 'Refresh'}</button></div>{gpuStatus && <div className="diagnostic-details"><span>GPU compositing: {gpuStatusLabel(gpuStatus.gpuCompositing)}</span><span>Rasterization: {gpuStatusLabel(gpuStatus.rasterization)}</span>{gpuStatus.encoder && <span>Conversion engine: {ENCODER_NAMES[gpuStatus.encoder] || gpuStatus.encoder}</span>}</div>}</div>{window.videe.platform === 'win32' && <p className="setting-note">If video decoding falls back to software, update the graphics driver or select the high-performance GPU in Windows.</p>}</section>}
      {!nativeShell && <a className="setting-action" href={siteHref}>Get the app</a>}
      </section><SecuritySettings/><div className="app-about"><img src="./icon.png" width="46" height="46" alt=""/><div><strong translate="no">Videe</strong><span>Version {appPackage.version}</span></div></div>
      <details className="help-details"><summary>Shortcuts</summary><div className="shortcuts">{([['Play / pause',['space','K']],['Seek',['left','right']],['Volume',['up','down']],['Jump',['0–9']],['Start / end',['Home','End']],['Speed',['[',']']],['Frame',[',','.']],['Full screen',['F']],['Mute',['M']],['Subtitles',['C']],['Save frame',['⇧','S']],['Editor',['E']],['Mark in / out',['I','O']],['Split',['S']],['Undo',['⌘/Ctrl','Z']],['Exit full screen',['esc']]] as const).map(([label,keys]) => <div key={label}><span>{label}</span><span className="shortcut-keys"><ShortcutKeys keys={[...keys]}/></span></div>)}</div></details>
    </Modal>}
    {modal === 'export' && active && <ExportDialog native={!!active.native && !!window.videe?.exportVideo} duration={duration} segments={segments} sourceHeight={analysis?.info.video?.height || 0} onClose={() => setModal(null)} onExport={options => void runExport(options)}/>}
    {modal === 'playback' && active && <Modal title="Playback details" onClose={() => setModal(null)}>
      <p className="delete-filename">{active.name}</p>
      {analysis ? <>
        <dl className="info-list">
          <div><dt>Playback</dt><dd>{engine === 'live' ? `Smooth playback · ${ENCODER_NAMES[gpuStatus?.encoder || ''] || 'live conversion'}` : analysis.converted === 'optimized' ? 'Optimized copy' : analysis.converted === 'edited' ? 'Edited copy' : 'Direct'}</dd></div>
          <div><dt>Format</dt><dd>{codecLabel(analysis.info) || '—'}</dd></div>
          {analysis.info.video && <div><dt>Video</dt><dd>{codecName(analysis.info.video.codec)}{analysis.info.video.profile ? ` (${analysis.info.video.profile})` : ''} · {analysis.info.video.width}×{analysis.info.video.height} · {analysis.info.video.pixFmt || '—'}</dd></div>}
          {analysis.info.audio[0] && <div><dt>Audio</dt><dd>{codecName(analysis.info.audio[0].codec)} · {analysis.info.audio[0].channels || '—'}{analysis.info.audio[0].sampleRate ? ` · ${analysis.info.audio[0].sampleRate / 1000} kHz` : ''}</dd></div>}
          {analysis.info.bitrate > 0 && <div><dt>Bitrate</dt><dd>{(analysis.info.bitrate / 1e6).toFixed(1)} Mb/s</dd></div>}
          {frameStats && <div><dt>Dropped frames</dt><dd>{frameStats.dropped} of {frameStats.total}{frameStats.total ? ` (${(frameStats.dropped / frameStats.total * 100).toFixed(1)}%)` : ''}</dd></div>}
          {gpuStatus && <div><dt>GPU decoding</dt><dd>{gpuStatusLabel(gpuStatus.videoDecode)}</dd></div>}
        </dl>
        {analysis.plan.reasons.length > 0 && <ul className="plan-reasons">{analysis.plan.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        <div className="playback-actions">
          {engine === 'direct' && !analysis.converted && <button type="button" className="secondary-button" onClick={() => { setModal(null); void switchEngine('live', 'Smooth playback on'); }}><Zap size={15} aria-hidden="true"/>Use smooth playback</button>}
          {engine === 'live' && <button type="button" className="secondary-button" onClick={() => { setModal(null); void switchEngine('direct', 'Playing original'); }}>Play original</button>}
          {!analysis.converted && <button type="button" className="secondary-button" disabled={conversion !== null} onClick={() => { setModal(null); void convert(analysis.plan.mode === 'remux'); }}>{analysis.plan.mode === 'remux' ? 'Optimize file (lossless)' : 'Create optimized copy'}</button>}
          {analysis.converted === 'optimized' && <button type="button" className="secondary-button" onClick={() => { setModal(null); void removeOptimized(); }}>Remove optimized copy</button>}
        </div>
      </> : <p className="subtle-text">{active.native ? 'Reading file details…' : 'Detailed codec information is available in the Videe desktop app.'}</p>}
    </Modal>}
    {modal === 'subtitles' && <Modal title="Subtitles" onClose={() => setModal(null)}>
      {(subtitle || embeddedTracks.length > 0) && <label className="setting-row"><span>Show subtitles</span><input type="checkbox" role="switch" checked={captions} onChange={e => setCaptions(e.target.checked)}/></label>}
      {embeddedTracks.length > 0 && <div className="subtitle-tracks" role="group" aria-label="Embedded subtitles">{embeddedTracks.map(track => <button key={track.index} type="button" className="secondary-button" aria-pressed={subtitle?.name===track.label} onClick={() => { if (activeId) void applyEmbedded(activeId, track.index, track.label, openSequence.current); }}>{track.label}</button>)}</div>}
      {subtitle?.name && <p className="subtitle-filename">{subtitle.name}</p>}
      <button className="secondary-button subtitle-import" onClick={() => subtitleRef.current?.click()}><FolderOpen size={17}/>{subtitle?.url ? 'Replace subtitles' : 'Open subtitles'}</button>
      {!subtitle && !embeddedTracks.length && <p className="subtle-text">No embedded subtitles. Open a .srt or .vtt file.</p>}
    </Modal>}
    {creating && <Modal title={creating === 'folder' ? 'New folder' : 'New playlist'} onClose={() => setCreating(null)}>
      <form className="create-form" onSubmit={e => { e.preventDefault(); createCollection(creating, newName); }}>
        <label>{creating === 'folder' ? 'Folder name' : 'Playlist name'}<input autoFocus value={newName} maxLength={80} onChange={e => setNewName(e.target.value)}/></label>
        {selected.length > 0 && <p className="subtle-text">{selected.length} selected {selected.length === 1 ? 'video' : 'videos'} will be added.</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setCreating(null)}>Cancel</button><button type="submit" className="primary-button" disabled={!newName.trim()}>Create</button></div>
      </form>
    </Modal>}
    {info && <Modal title="Video info" onClose={()=>setInfoId(null)}><p className="delete-filename">{info.name}</p><dl className="info-list"><div><dt>Size</dt><dd>{sizeLabel(info.size)}</dd></div><div><dt>Duration</dt><dd>{info.duration?timeLabel(info.duration):'—'}</dd></div><div><dt>Position</dt><dd>{timeLabel(info.position)}</dd></div><div><dt>Added</dt><dd>{new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(info.added)}</dd></div>{folderOf.get(info.id) && <div><dt>Folder</dt><dd>{folderOf.get(info.id)}</dd></div>}<div><dt>Location</dt><dd>{info.native?'File':'Library'}</dd></div></dl>{info.native && window.videe?.revealVideo && <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => void window.videe?.revealVideo(info.id)}><FolderOpen size={15} aria-hidden="true"/>Show in folder</button></div>}</Modal>}
    {deleteIds && deleteIds.length > 0 && <Modal title="Remove from library" onClose={() => setDeleteIds(null)}><p className="delete-filename">{deleteIds.length === 1 ? (items.find(item => item.id === deleteIds[0])?.name || 'This video') : `${deleteIds.length} videos`}</p><p className="subtle-text">{deleteIds.length === 1 ? 'The original file stays.' : 'Original files stay.'}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteIds(null)}>Cancel</button><button className="danger-button" onClick={() => void confirmDelete()}>Remove</button></div></Modal>}
  </div>;
}
