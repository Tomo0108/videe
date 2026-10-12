import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeftToLine,ArrowRightToLine,Download,Eye,Loader2,Magnet,Play,Redo2,Scissors,SquareSplitHorizontal,Trash2,Undo2,X,ZoomIn,ZoomOut} from 'lucide-react';
import {Modal} from './Modal';
import {normalizeSegments,parseTimecode,segmentsDuration,timeLabel,timecode} from './media.mjs';
import type {ExportOptions} from './env';

export type Segment = {id:string;start:number;end:number};

const TICK_STEPS = [1/30, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
const clamp = (value:number, min:number, max:number) => Math.max(min, Math.min(max, value));
export const newSegmentId = () => crypto.randomUUID().slice(0, 8);

/** Zoomable timeline with filmstrip, export segments and a draggable playhead. */
function Timeline({duration,position,segments,selected,filmstrip,fps,snap,onSeek,onChange,onSelect,onCommit}:{duration:number;position:number;segments:Segment[];selected:string|null;filmstrip:(string|null)[];fps:number;snap:boolean;onSeek:(t:number)=>void;onChange:(next:Segment[])=>void;onSelect:(id:string|null)=>void;onCommit:()=>void}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [zoom,setZoom] = useState(1);
  const [viewStart,setViewStart] = useState(0);
  const [width,setWidth] = useState(800);
  const drag = useRef<null | {kind:'scrub'} | {kind:'start'|'end'|'move'; id:string; origin:number; startValue:number; endValue:number}>(null);
  const span = duration / zoom;
  useEffect(() => {
    const node = frameRef.current; if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth || 800));
    observer.observe(node); setWidth(node.clientWidth || 800);
    return () => observer.disconnect();
  }, []);
  // Keep the playhead in view while playing on a zoomed timeline.
  useEffect(() => {
    if (zoom <= 1) { if (viewStart) setViewStart(0); return; }
    if (position < viewStart || position > viewStart + span) setViewStart(clamp(position - span * 0.1, 0, Math.max(0, duration - span)));
  }, [position, zoom, span, duration, viewStart]);
  const timeAt = useCallback((clientX:number) => {
    const rect = frameRef.current!.getBoundingClientRect();
    return clamp(viewStart + (clientX - rect.left) / rect.width * span, 0, duration);
  }, [viewStart, span, duration]);
  const snapTime = useCallback((t:number, ignore = '') => {
    if (!snap) return Math.round(t * fps) / fps;
    const threshold = span / Math.max(1, width) * 8;
    const targets = [0, duration, position, ...segments.filter(s => s.id !== ignore).flatMap(s => [s.start, s.end])];
    const near = targets.reduce((best, value) => Math.abs(value - t) < Math.abs(best - t) ? value : best, Infinity);
    return Math.abs(near - t) <= threshold ? near : Math.round(t * fps) / fps;
  }, [snap, span, width, duration, position, segments, fps]);
  const setZoomAround = (next:number, anchor:number) => {
    const z = clamp(next, 1, Math.max(1, duration * fps / 40));
    const nextSpan = duration / z;
    const ratio = span ? (anchor - viewStart) / span : 0;
    setZoom(z);
    setViewStart(clamp(anchor - ratio * nextSpan, 0, Math.max(0, duration - nextSpan)));
  };
  const onWheel = (event:React.WheelEvent) => {
    if (event.ctrlKey || event.metaKey) { event.preventDefault(); setZoomAround(zoom * (event.deltaY < 0 ? 1.25 : 0.8), timeAt(event.clientX)); return; }
    if (zoom <= 1) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (!delta) return;
    setViewStart(value => clamp(value + delta / width * span, 0, Math.max(0, duration - span)));
  };
  const pointerDown = (event:React.PointerEvent, target?:{kind:'start'|'end'|'move';segment:Segment}) => {
    if (event.button !== 0 || !duration) return;
    event.preventDefault(); event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (target) {
      onSelect(target.segment.id);
      drag.current = {kind:target.kind,id:target.segment.id,origin:timeAt(event.clientX),startValue:target.segment.start,endValue:target.segment.end};
      return;
    }
    drag.current = {kind:'scrub'};
    onSeek(timeAt(event.clientX));
  };
  const pointerMove = (event:React.PointerEvent) => {
    const current = drag.current; if (!current) return;
    const t = timeAt(event.clientX);
    if (current.kind === 'scrub') { onSeek(t); return; }
    const delta = t - current.origin;
    onChange(segments.map(segment => {
      if (segment.id !== current.id) return segment;
      if (current.kind === 'start') return {...segment,start:clamp(snapTime(current.startValue + delta, segment.id),0,segment.end - 1/fps)};
      if (current.kind === 'end') return {...segment,end:clamp(snapTime(current.endValue + delta, segment.id),segment.start + 1/fps,duration)};
      const length = current.endValue - current.startValue;
      const start = clamp(snapTime(current.startValue + delta, segment.id), 0, duration - length);
      return {...segment,start,end:start + length};
    }));
    if (current.kind === 'start' || current.kind === 'move') onSeek(clamp(current.startValue + delta, 0, duration));
    else onSeek(clamp(current.endValue + delta, 0, duration));
  };
  const pointerUp = (event:React.PointerEvent) => {
    const current = drag.current; drag.current = null;
    try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch { /* Capture already released. */ }
    if (current && current.kind !== 'scrub') onCommit();
  };
  const step = TICK_STEPS.find(value => span / value <= width / 90) || 3600;
  const ticks = useMemo(() => {
    if (!duration) return [];
    const first = Math.floor(viewStart / step) * step;
    const list:number[] = [];
    for (let t = first; t <= viewStart + span + step && list.length < 400; t += step) if (t >= 0 && t <= duration) list.push(t);
    return list;
  }, [duration, viewStart, span, step]);
  const pct = (t:number) => duration ? t / duration * 100 : 0;
  const inner = {left:`${-viewStart / (duration || 1) * zoom * 100}%`,width:`${zoom * 100}%`};
  const tickLabel = (t:number) => step < 1 ? timecode(t, fps).replace(/^00:/, '') : timeLabel(t);
  const kept = segments;
  const gaps = useMemo(() => {
    if (!segments.length) return [] as [number, number][];
    const list:[number, number][] = [];
    let cursor = 0;
    for (const segment of normalizeSegments(segments, duration)) { if (segment.start > cursor + 0.0001) list.push([cursor, segment.start]); cursor = Math.max(cursor, segment.end); }
    if (cursor < duration - 0.0001) list.push([cursor, duration]);
    return list;
  }, [segments, duration]);
  return <div className="timeline">
    <div className="timeline-tools">
      <div className="timeline-zoom" role="group" aria-label="Timeline zoom">
        <button type="button" className="icon-button" aria-label="Zoom out timeline" title="Zoom out (Ctrl + wheel)" disabled={zoom <= 1} onClick={() => setZoomAround(zoom / 1.6, position)}><ZoomOut size={16} aria-hidden="true"/></button>
        <input type="range" aria-label="Timeline zoom level" min="0" max="1" step="0.01" value={Math.log(zoom) / Math.log(Math.max(1.0001, duration * fps / 40))} onChange={e => setZoomAround(Math.pow(Math.max(1.0001, duration * fps / 40), Number(e.target.value)), position)}/>
        <button type="button" className="icon-button" aria-label="Zoom in timeline" title="Zoom in (Ctrl + wheel)" onClick={() => setZoomAround(zoom * 1.6, position)}><ZoomIn size={16} aria-hidden="true"/></button>
        {zoom > 1 && <button type="button" className="text-button" onClick={() => { setZoom(1); setViewStart(0); }}>Fit</button>}
      </div>
    </div>
    <div className="timeline-frame" ref={frameRef} onWheel={onWheel} onPointerDown={event => pointerDown(event)} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} role="slider" aria-label="Timeline" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={position} aria-valuetext={timecode(position, fps)} tabIndex={0}>
      <div className="timeline-inner" style={inner}>
        <div className="timeline-ruler">{ticks.map(t => <span key={t} className="timeline-tick" style={{left:`${pct(t)}%`}}><span>{tickLabel(t)}</span></span>)}</div>
        <div className="timeline-strip">{filmstrip.length ? filmstrip.map((frame, index) => <span key={index} style={frame ? {backgroundImage:`url(${frame})`} : undefined}/>) : <span className="timeline-strip-empty"/>}</div>
        {gaps.length > 0 && <div className="timeline-dim" aria-hidden="true">{gaps.map(([from, to]) => <span key={from} style={{left:`${pct(from)}%`,width:`${pct(to - from)}%`}}/>)}</div>}
        <div className="timeline-segments">{kept.map((segment, index) => <div key={segment.id} className={`timeline-segment${segment.id === selected ? ' selected' : ''}`} style={{left:`${pct(segment.start)}%`,width:`${pct(segment.end - segment.start)}%`}} onPointerDown={event => pointerDown(event, {kind:'move',segment})}>
          <span className="segment-label">{index + 1}</span>
          <span className="segment-handle start" aria-label={`Segment ${index + 1} start`} onPointerDown={event => pointerDown(event, {kind:'start',segment})}/>
          <span className="segment-handle end" aria-label={`Segment ${index + 1} end`} onPointerDown={event => pointerDown(event, {kind:'end',segment})}/>
        </div>)}</div>
        <div className="timeline-playhead" style={{left:`${pct(position)}%`}} aria-hidden="true"/>
      </div>
    </div>
  </div>;
}

function TimeField({label,value,fps,max,onCommit}:{label:string;value:number;fps:number;max:number;onCommit:(t:number)=>void}) {
  const [text,setText] = useState(timecode(value, fps));
  const [editing,setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(timecode(value, fps)); }, [value, fps, editing]);
  const commit = () => {
    setEditing(false);
    const t = parseTimecode(text, fps);
    if (Number.isFinite(t)) onCommit(clamp(t, 0, max)); else setText(timecode(value, fps));
  };
  return <input className="time-field" aria-label={label} value={text} spellCheck={false} onFocus={() => setEditing(true)} onChange={e => setText(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') { setText(timecode(value, fps)); setEditing(false); (e.target as HTMLInputElement).blur(); } e.stopPropagation(); }}/>;
}

export type EditorProps = {
  duration:number; position:number; fps:number; native:boolean;
  segments:Segment[]; selected:string|null; filmstrip:(string|null)[];
  preview:boolean; snap:boolean; canUndo:boolean; canRedo:boolean;
  job:null | {seconds:number; total:number};
  onSeek:(t:number)=>void; onChange:(next:Segment[])=>void; onCommit:(next?:Segment[])=>void; onSelect:(id:string|null)=>void;
  onMarkIn:()=>void; onMarkOut:()=>void; onSplit:()=>void; onDelete:()=>void; onPlaySegment:(segment:Segment)=>void;
  onUndo:()=>void; onRedo:()=>void; onReset:()=>void; onTogglePreview:()=>void; onToggleSnap:()=>void;
  onExport:()=>void; onCancelJob:()=>void; onClose:()=>void;
};

export function EditorPanel(props:EditorProps) {
  const {duration,position,fps,segments,selected,job} = props;
  const output = segmentsDuration(segments, duration);
  const percent = job && job.total ? Math.min(100, job.seconds / job.total * 100) : 0;
  return <section className="editor-panel" aria-label="Editor">
    <div className="editor-toolbar">
      <div className="editor-group" role="group" aria-label="Marks">
        <button type="button" className="tool-button" onClick={props.onMarkIn} title="Set start (I)"><ArrowLeftToLine size={16} aria-hidden="true"/><span>Mark in</span><kbd>I</kbd></button>
        <button type="button" className="tool-button" onClick={props.onMarkOut} title="Set end (O)"><ArrowRightToLine size={16} aria-hidden="true"/><span>Mark out</span><kbd>O</kbd></button>
        <button type="button" className="tool-button" onClick={props.onSplit} title="Split at playhead (S)"><SquareSplitHorizontal size={16} aria-hidden="true"/><span>Split</span><kbd>S</kbd></button>
        <button type="button" className="tool-button danger" onClick={props.onDelete} disabled={!selected} title="Delete segment (Delete)"><Trash2 size={16} aria-hidden="true"/><span>Delete segment</span></button>
      </div>
      <div className="editor-group" role="group" aria-label="Edit history">
        <button type="button" className="icon-button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!props.canUndo} onClick={props.onUndo}><Undo2 size={16} aria-hidden="true"/></button>
        <button type="button" className="icon-button" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!props.canRedo} onClick={props.onRedo}><Redo2 size={16} aria-hidden="true"/></button>
        <button type="button" className={`icon-button${props.snap ? ' active' : ''}`} aria-label="Snap to marks" aria-pressed={props.snap} title="Snap to marks" onClick={props.onToggleSnap}><Magnet size={16} aria-hidden="true"/></button>
        <button type="button" className={`icon-button${props.preview ? ' active' : ''}`} aria-label="Preview edit" aria-pressed={props.preview} title="Preview: skip removed parts" disabled={!segments.length} onClick={props.onTogglePreview}><Eye size={16} aria-hidden="true"/></button>
      </div>
      <div className="editor-summary">
        <span className="editor-timecode" aria-label="Playhead timecode">{timecode(position, fps)}</span>
        <span className="editor-output">Output {timeLabel(output)}{segments.length ? ` · ${segments.length} ${segments.length === 1 ? 'segment' : 'segments'}` : ''}</span>
      </div>
      <div className="editor-group editor-end">
        {segments.length > 0 && <button type="button" className="text-button" onClick={props.onReset}>Reset</button>}
        <button type="button" className="primary-button editor-export" disabled={!!job || !duration} onClick={props.onExport}><Download size={16} aria-hidden="true"/>Export…</button>
        <button type="button" className="icon-button" aria-label="Close editor" title="Close editor (E)" onClick={props.onClose}><X size={17} aria-hidden="true"/></button>
      </div>
    </div>
    <Timeline duration={duration} position={position} segments={segments} selected={selected} filmstrip={props.filmstrip} fps={fps} snap={props.snap} onSeek={props.onSeek} onChange={props.onChange} onSelect={props.onSelect} onCommit={() => props.onCommit()}/>
    {job && <div className="editor-job" role="status"><Loader2 size={16} className="spin" aria-hidden="true"/><span>Exporting · {Math.round(percent)}%</span><progress max={100} value={percent}/><button type="button" className="secondary-button" onClick={props.onCancelJob}>Cancel</button></div>}
    {segments.length > 0 ? <div className="segment-table" role="table" aria-label="Segments">
      <div className="segment-row segment-head" role="row"><span role="columnheader">#</span><span role="columnheader">In</span><span role="columnheader">Out</span><span role="columnheader">Length</span><span role="columnheader"><span className="sr-only">Actions</span></span></div>
      {segments.map((segment, index) => <div key={segment.id} role="row" className={`segment-row${segment.id === selected ? ' selected' : ''}`} onClick={() => props.onSelect(segment.id)}>
        <span role="cell" className="segment-index">{index + 1}</span>
        <span role="cell"><TimeField label={`Segment ${index + 1} in`} value={segment.start} fps={fps} max={duration} onCommit={t => props.onCommit(segments.map(s => s.id === segment.id ? {...s,start:Math.min(t, s.end - 1 / fps)} : s))}/></span>
        <span role="cell"><TimeField label={`Segment ${index + 1} out`} value={segment.end} fps={fps} max={duration} onCommit={t => props.onCommit(segments.map(s => s.id === segment.id ? {...s,end:Math.max(t, s.start + 1 / fps)} : s))}/></span>
        <span role="cell" className="segment-length">{timecode(segment.end - segment.start, fps)}</span>
        <span role="cell" className="segment-actions">
          <button type="button" className="icon-button" aria-label={`Play segment ${index + 1}`} title="Play segment" onClick={e => { e.stopPropagation(); props.onPlaySegment(segment); }}><Play size={15} aria-hidden="true"/></button>
          <button type="button" className="icon-button" aria-label={`Delete segment ${index + 1}`} title="Delete segment" onClick={e => { e.stopPropagation(); props.onCommit(segments.filter(s => s.id !== segment.id)); }}><Trash2 size={15} aria-hidden="true"/></button>
        </span>
      </div>)}
    </div> : <p className="editor-hint"><Scissors size={15} aria-hidden="true"/>Mark in and out points or split at the playhead. Segments you keep are exported in order; everything else is cut.</p>}
  </section>;
}

const RESOLUTIONS = [{value:0,label:'Original'},{value:2160,label:'2160p (4K)'},{value:1440,label:'1440p'},{value:1080,label:'1080p'},{value:720,label:'720p'},{value:480,label:'480p'}];

export function ExportDialog({native,duration,segments,sourceHeight,onClose,onExport}:{native:boolean;duration:number;segments:Segment[];sourceHeight:number;onClose:()=>void;onExport:(options:Omit<ExportOptions,'segments'|'duration'>)=>void}) {
  const [mode,setMode] = useState<'encode'|'copy'>('encode');
  const [codec,setCodec] = useState<'h264'|'hevc'>('h264');
  const [quality,setQuality] = useState<'high'|'standard'|'small'>('high');
  const [height,setHeight] = useState(0);
  const [audio,setAudio] = useState(true);
  const [rotate,setRotate] = useState(0);
  const [fps,setFps] = useState(0);
  const [hardware,setHardware] = useState(false);
  const [destination,setDestination] = useState<'file'|'apply'>('file');
  const [addToLibrary,setAddToLibrary] = useState(true);
  const output = segmentsDuration(segments, duration);
  const copy = mode === 'copy';
  return <Modal title="Export" onClose={onClose}>
    <p className="export-summary">{timeLabel(output)} from {segments.length || 1} {segments.length > 1 ? 'segments' : 'segment'}</p>
    {!native && <p className="subtle-text export-note">Exporting needs the Videe desktop app.</p>}
    <div className="settings-group">
      <label className="setting-row"><span>Method<small>{copy ? 'Fast, original quality. Cuts snap to the nearest keyframe.' : 'Frame-accurate cuts with your choice of format.'}</small></span><select aria-label="Export method" value={mode} onChange={e => setMode(e.target.value as 'encode'|'copy')}><option value="encode">Re-encode</option><option value="copy">Lossless copy</option></select></label>
      {!copy && <>
        <label className="setting-row"><span>Codec</span><select aria-label="Codec" value={codec} onChange={e => setCodec(e.target.value as 'h264'|'hevc')}><option value="h264">H.264 (most compatible)</option><option value="hevc">HEVC / H.265 (smaller)</option></select></label>
        <label className="setting-row"><span>Quality</span><select aria-label="Quality" value={quality} onChange={e => setQuality(e.target.value as 'high'|'standard'|'small')}><option value="high">High</option><option value="standard">Standard</option><option value="small">Small file</option></select></label>
        <label className="setting-row"><span>Resolution</span><select aria-label="Resolution" value={height} onChange={e => setHeight(Number(e.target.value))}>{RESOLUTIONS.filter(option => !option.value || !sourceHeight || option.value < sourceHeight).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="setting-row"><span>Frame rate</span><select aria-label="Frame rate" value={fps} onChange={e => setFps(Number(e.target.value))}><option value={0}>Original</option><option value={24}>24 fps</option><option value={25}>25 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option></select></label>
        <label className="setting-row"><span>Rotate</span><select aria-label="Rotate" value={rotate} onChange={e => setRotate(Number(e.target.value))}><option value={0}>None</option><option value={90}>90° clockwise</option><option value={180}>180°</option><option value={270}>90° counterclockwise</option></select></label>
        {codec === 'h264' && <label className="setting-row"><span>Hardware encoding<small>Faster on supported GPUs, slightly larger files.</small></span><input type="checkbox" role="switch" aria-label="Hardware encoding" checked={hardware} onChange={e => setHardware(e.target.checked)}/></label>}
      </>}
      <label className="setting-row"><span>Audio</span><input type="checkbox" role="switch" aria-label="Include audio" checked={audio} onChange={e => setAudio(e.target.checked)}/></label>
    </div>
    <div className="settings-group export-destination">
      <label className="setting-row"><span>Destination</span><select aria-label="Destination" value={destination} onChange={e => setDestination(e.target.value as 'file'|'apply')}><option value="file">Save as new file…</option><option value="apply">Replace in Videe (keeps original)</option></select></label>
      {destination === 'file' && <label className="setting-row"><span>Add to library</span><input type="checkbox" role="switch" aria-label="Add to library" checked={addToLibrary} onChange={e => setAddToLibrary(e.target.checked)}/></label>}
    </div>
    <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={!native || output < 0.25} onClick={() => onExport({mode,codec,quality,height,audio,rotate,fps,hardware,destination,addToLibrary})}>Export</button></div>
  </Modal>;
}
