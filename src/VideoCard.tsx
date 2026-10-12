import {memo,type MutableRefObject} from 'react';
import {AudioLines,Check,Film,Folder,FolderOpen,Heart,Info,Play,RotateCcw,Trash2} from 'lucide-react';
import {sizeLabel,timeLabel} from './media.mjs';
import {DRAG_TYPE} from './Sidebar';
import type {MediaItem} from './store';
import type {Collection} from './organization';

export type CardActions = {
  open:(item:MediaItem, resume?:boolean)=>void;
  select:(id:string, checked:boolean, range:boolean)=>void;
  favorite:(id:string)=>void;
  info:(id:string)=>void;
  reset:(id:string)=>void;
  move:(ids:string[], dest:string)=>void;
  remove:(id:string)=>void;
  reveal?:(id:string)=>void;
  dragIds:(id:string)=>string[];
  openFolder:(id:string)=>void;
  dropOnFolder:(id:string, ids:string[])=>void;
};

function playedLabel(item:MediaItem) {
  if (!item.lastPlayed) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(item.lastPlayed);
}
const closeMenu = (element:HTMLElement) => element.closest('details')?.removeAttribute('open');
const extension = (name:string) => /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toUpperCase() || '';

/** One library row or card. Memoized so playback progress never re-renders the whole library. */
export const VideoCard = memo(function VideoCard({item,layout,selected,playing,folderName,folders,actions}:{item:MediaItem;layout:'grid'|'list';selected:boolean;playing:boolean;folderName:string;folders:Collection[];actions:MutableRefObject<CardActions>}) {
  const inProgress = item.position > 0 && item.position < item.duration - 2;
  const watched = item.duration > 0 && item.lastPlayed > 0 && !inProgress;
  const ext = extension(item.originalName || item.name);
  return <article className={`video-card${selected ? ' selected' : ''}${playing ? ' playing' : ''}`} draggable onDragStart={event => { const ids = actions.current.dragIds(item.id); event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids)); event.dataTransfer.setData('text/plain', item.name); event.dataTransfer.effectAllowed = 'move'; }}>
    <label className="video-select"><input type="checkbox" aria-label={`Select ${item.name}`} checked={selected} onChange={event => actions.current.select(item.id, event.target.checked, (event.nativeEvent as MouseEvent).shiftKey === true)} onClick={event => { if (event.shiftKey) { event.preventDefault(); actions.current.select(item.id, !selected, true); } }}/><Check size={14} strokeWidth={2.4} aria-hidden="true"/></label>
    <button className="video-open" onClick={() => actions.current.open(item)} aria-label={`Play ${item.name}`}>
      <span className="video-preview"><span className="video-thumbnail">{item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" decoding="async" draggable={false}/> : <Film size={30} strokeWidth={1.2} aria-hidden="true"/>}<span className="thumbnail-play" aria-hidden="true"><Play size={23} fill="currentColor"/></span>{layout !== 'list' && item.duration > 0 && <span className="duration-label">{timeLabel(item.duration)}</span>}{item.position > 0 && item.duration > 0 && <span className="card-progress" style={{width:`${Math.min(100, item.position / item.duration * 100)}%`}}/>}</span></span>
      <span className="video-text"><span className="video-title" title={item.name}>{playing && <AudioLines size={14} className="now-playing" aria-label="Now playing"/>}{item.name.replace(/\.[^.]+$/, '')}</span>
      {layout === 'list'
        ? <span className="video-subline">{folderName && <span className="video-folder"><Folder size={12} aria-hidden="true"/>{folderName}</span>}{ext && <span className="video-format">{ext}</span>}{inProgress ? <span className="video-state resume">{timeLabel(item.duration - item.position)} left</span> : watched ? <span className="video-state">Watched</span> : null}</span>
        : <span className="video-meta">{item.favorite && <Heart size={12} fill="currentColor" aria-hidden="true"/>}<span>{item.duration > 0 ? timeLabel(item.duration) : '—'}</span><span>{sizeLabel(item.size)}</span>{inProgress && <span>{timeLabel(item.duration - item.position)} left</span>}{folderName && <span className="video-folder"><Folder size={12} aria-hidden="true"/>{folderName}</span>}</span>}</span>
      {layout === 'list' && <><span className="video-duration">{item.duration > 0 ? timeLabel(item.duration) : '—'}</span><span className="video-size">{sizeLabel(item.size)}</span><span className="video-played">{playedLabel(item)}</span></>}
    </button>
    <button type="button" className={`video-favorite${item.favorite ? ' active' : ''}`} aria-pressed={item.favorite} aria-label={item.favorite ? `Unfavorite ${item.name}` : `Add ${item.name} to favorites`} title={item.favorite ? 'Unfavorite' : 'Add to favorites'} onClick={() => actions.current.favorite(item.id)}><Heart size={16} strokeWidth={1.8} fill={item.favorite ? 'currentColor' : 'none'} aria-hidden="true"/></button>
    <details className="file-menu" onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); } }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) event.currentTarget.open = false; }}>
      <summary aria-label={`Options for ${item.name}`} title="Info"><Info size={18} aria-hidden="true"/></summary>
      <div className="menu-panel">
        {inProgress && <button aria-label={`Resume ${item.name}`} onClick={event => { closeMenu(event.currentTarget); actions.current.open(item, true); }}><Play size={16} aria-hidden="true"/>Resume</button>}
        <button onClick={event => { actions.current.info(item.id); closeMenu(event.currentTarget); }}><Info size={16} aria-hidden="true"/>Video info</button>
        {item.native && actions.current.reveal && <button onClick={event => { actions.current.reveal?.(item.id); closeMenu(event.currentTarget); }}><FolderOpen size={16} aria-hidden="true"/>Show in folder</button>}
        <button aria-label="Reset watch history" disabled={!item.position && !item.lastPlayed} onClick={event => { actions.current.reset(item.id); closeMenu(event.currentTarget); }}><RotateCcw size={16} aria-hidden="true"/>Reset</button>
        <button onClick={event => { actions.current.favorite(item.id); closeMenu(event.currentTarget); }}><Heart size={16} aria-hidden="true"/>{item.favorite ? 'Unfavorite' : 'Add to favorites'}</button>
        {folders.length > 0 && <div className="menu-move"><span className="menu-move-label">Move to</span>{folders.some(folder => folder.ids.includes(item.id)) && <button aria-label="Remove from folder" onClick={event => { actions.current.move([item.id], ''); closeMenu(event.currentTarget); }}><Folder size={16} aria-hidden="true"/>Remove from folder</button>}{folders.map(folder => <button key={folder.id} aria-label={`Move to ${folder.name}`} onClick={event => { actions.current.move([item.id], folder.id); closeMenu(event.currentTarget); }}><Folder size={16} aria-hidden="true"/>{folder.name}</button>)}</div>}
        <button className="delete-action" onClick={event => { actions.current.remove(item.id); closeMenu(event.currentTarget); }}><Trash2 size={16} aria-hidden="true"/>Remove from library</button>
      </div>
    </details>
  </article>;
});

/** Folder tile for the library overview. Accepts dropped videos. */
export function FolderCard({folder,items,layout,actions}:{folder:Collection;items:MediaItem[];layout:'grid'|'list';actions:MutableRefObject<CardActions>}) {
  const members = items.filter(item => folder.ids.includes(item.id));
  const covers = members.filter(item => item.thumbnail).slice(0, 4);
  const total = members.reduce((sum, item) => sum + (item.duration || 0), 0);
  const size = members.reduce((sum, item) => sum + (item.size || 0), 0);
  const watched = members.filter(item => item.lastPlayed > 0).length;
  return <button type="button" className={`folder-card ${layout}`} aria-label={`Open folder ${folder.name}`} onClick={() => actions.current.openFolder(folder.id)}
    onDragOver={event => { if (!event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); event.currentTarget.classList.add('drop-target'); }}
    onDragLeave={event => event.currentTarget.classList.remove('drop-target')}
    onDrop={event => { event.currentTarget.classList.remove('drop-target'); if (!event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); event.stopPropagation(); try { const ids = JSON.parse(event.dataTransfer.getData(DRAG_TYPE) || '[]'); if (Array.isArray(ids) && ids.length) actions.current.dropOnFolder(folder.id, ids); } catch { /* Ignore foreign drops. */ } }}>
    <span className={`folder-cover count-${covers.length}`}>{covers.length ? covers.map(item => <img key={item.id} src={item.thumbnail} alt="" loading="lazy" decoding="async" draggable={false}/>) : <Folder size={layout === 'list' ? 20 : 34} strokeWidth={1.4} aria-hidden="true"/>}</span>
    <span className="folder-text"><span className="folder-name">{folder.name}</span><span className="folder-meta">{members.length} {members.length === 1 ? 'video' : 'videos'}{total > 0 ? ` · ${timeLabel(total)}` : ''}{layout === 'list' && size > 0 ? ` · ${sizeLabel(size)}` : ''}{layout === 'list' && members.length > 0 ? ` · ${watched}/${members.length} watched` : ''}</span></span>
  </button>;
}
