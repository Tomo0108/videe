import {memo,useRef,type MutableRefObject} from 'react';
import {AudioLines,Check,Film,Folder,Heart,Info,Play} from 'lucide-react';
import {sizeLabel,timeLabel} from './media.mjs';
import {DRAG_TYPE} from './Sidebar';
import type {MediaItem} from './store';
import type {Collection} from './organization';
import {locale,t,type Language} from './i18n.mjs';

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
  return new Intl.DateTimeFormat(locale(), { month: 'short', day: 'numeric' }).format(item.lastPlayed);
}
export const extension = (name:string) => /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toUpperCase() || '';

/** One library row or card. Memoized so playback progress never re-renders the whole library. */
// `language` is unused in the body but part of the memo key, so rows re-render when the language changes.
export const VideoCard = memo(function VideoCard({item,layout,selected,playing,folderName,folders,actions}:{item:MediaItem;layout:'grid'|'list';selected:boolean;playing:boolean;folderName:string;folders:Collection[];language?:Language;actions:MutableRefObject<CardActions>}) {
  const inProgress = item.position > 0 && item.position < item.duration - 2;
  // Touch: a long press on a row starts selection, like Photos and Files.
  const pressTimer = useRef(0); const longPressed = useRef(false);
  const cancelPress = () => { window.clearTimeout(pressTimer.current); pressTimer.current = 0; };
  return <article className={`video-card${selected ? ' selected' : ''}${playing ? ' playing' : ''}`} draggable
    onPointerDown={event => { if (event.pointerType !== 'touch' || event.button !== 0) return; longPressed.current = false; cancelPress(); pressTimer.current = window.setTimeout(() => { pressTimer.current = 0; longPressed.current = true; actions.current.select(item.id, !selected, false); navigator.vibrate?.(10); }, 500); }}
    onPointerUp={cancelPress} onPointerCancel={cancelPress} onPointerLeave={cancelPress} onContextMenu={event => { if (longPressed.current) event.preventDefault(); }}
    onClickCapture={event => { if (longPressed.current) { longPressed.current = false; event.preventDefault(); event.stopPropagation(); } }} onDragStart={event => { const ids = actions.current.dragIds(item.id); event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids)); event.dataTransfer.setData('text/plain', item.name); event.dataTransfer.effectAllowed = 'move'; }}>
    <label className="video-select"><input type="checkbox" aria-label={t('Select {name}', {name: item.name})} checked={selected} onChange={event => actions.current.select(item.id, event.target.checked, (event.nativeEvent as MouseEvent).shiftKey === true)} onClick={event => { if (event.shiftKey) { event.preventDefault(); actions.current.select(item.id, !selected, true); } }}/><Check size={14} strokeWidth={2.4} aria-hidden="true"/></label>
    <button className="video-open" onClick={() => actions.current.open(item)} aria-label={t('Play {name}', {name: item.name})}>
      <span className="video-preview"><span className={`video-thumbnail${item.thumbnail ? '' : ' pending'}`}>{item.thumbnail ? <img src={item.thumbnail} alt="" loading="lazy" decoding="async" draggable={false}/> : <Film size={24} strokeWidth={1.3} aria-hidden="true"/>}<span className="thumbnail-play" aria-hidden="true"><Play size={23} fill="currentColor"/></span>{layout !== 'list' && item.duration > 0 && <span className="duration-label">{timeLabel(item.duration)}</span>}{item.position > 0 && item.duration > 0 && <span className="card-progress" style={{width:`${Math.min(100, item.position / item.duration * 100)}%`}}/>}</span></span>
      <span className="video-text"><span className="video-title" title={item.name}>{playing && <AudioLines size={14} className="now-playing" aria-label={t('Now playing')}/>}{item.name.replace(/\.[^.]+$/, '')}</span></span>
      {layout === 'list' && <><span className="video-duration">{item.duration > 0 ? timeLabel(item.duration) : '—'}</span><span className="video-size">{sizeLabel(item.size)}</span><span className="video-played">{playedLabel(item)}</span></>}
    </button>
    <button type="button" className={`video-favorite${item.favorite ? ' active' : ''}`} aria-pressed={item.favorite} aria-label={item.favorite ? t('Unfavorite {name}', {name: item.name}) : t('Add {name} to favorites', {name: item.name})} title={item.favorite ? t('Unfavorite') : t('Add to favorites')} onClick={() => actions.current.favorite(item.id)}><Heart size={16} strokeWidth={1.8} fill={item.favorite ? 'currentColor' : 'none'} aria-hidden="true"/></button>
    <button type="button" className="video-info-button" aria-label={t('Info for {name}', {name: item.name})} title={t('Info')} onClick={() => actions.current.info(item.id)}><Info size={17} aria-hidden="true"/></button>
  </article>;
});

/** Folder tile for the library overview. Accepts dropped videos. */
export function FolderCard({folder,items,layout,actions}:{folder:Collection;items:MediaItem[];layout:'grid'|'list';actions:MutableRefObject<CardActions>}) {
  const members = items.filter(item => folder.ids.includes(item.id));
  const covers = members.filter(item => item.thumbnail).slice(0, 4);
  const total = members.reduce((sum, item) => sum + (item.duration || 0), 0);
  const size = members.reduce((sum, item) => sum + (item.size || 0), 0);
  const watched = members.filter(item => item.lastPlayed > 0).length;
  return <button type="button" className={`folder-card ${layout}`} aria-label={t('Open folder {name}', {name: folder.name})} onClick={() => actions.current.openFolder(folder.id)}
    onDragOver={event => { if (!event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); event.currentTarget.classList.add('drop-target'); }}
    onDragLeave={event => event.currentTarget.classList.remove('drop-target')}
    onDrop={event => { event.currentTarget.classList.remove('drop-target'); if (!event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); event.stopPropagation(); try { const ids = JSON.parse(event.dataTransfer.getData(DRAG_TYPE) || '[]'); if (Array.isArray(ids) && ids.length) actions.current.dropOnFolder(folder.id, ids); } catch { /* Ignore foreign drops. */ } }}>
    <span className={`folder-cover count-${covers.length}`}>{covers.length ? covers.map(item => <img key={item.id} src={item.thumbnail} alt="" loading="lazy" decoding="async" draggable={false}/>) : <Folder size={layout === 'list' ? 20 : 34} strokeWidth={1.4} aria-hidden="true"/>}</span>
    <span className="folder-text"><span className="folder-name">{folder.name}</span><span className="folder-meta">{t(members.length === 1 ? '1 video' : '{n} videos', {n: members.length})}{total > 0 ? ` · ${timeLabel(total)}` : ''}{layout === 'list' && size > 0 ? ` · ${sizeLabel(size)}` : ''}{layout === 'list' && members.length > 0 ? ` · ${t('{watched}/{total} watched', {watched, total: members.length})}` : ''}</span></span>
  </button>;
}
