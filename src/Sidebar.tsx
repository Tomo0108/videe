import {useState} from 'react';
import {Clock3,Film,Folder,FolderPlus,Heart,ListPlus,ListVideo,PanelLeftClose,PanelLeftOpen} from 'lucide-react';
import type {Collection} from './organization';

export const DRAG_TYPE = 'application/x-videe-ids';
export type View = 'all' | 'favorites' | 'continue';

export function readDraggedIds(event:React.DragEvent) {
  try { const ids = JSON.parse(event.dataTransfer.getData(DRAG_TYPE) || '[]'); return Array.isArray(ids) ? ids.filter((id:unknown):id is string => typeof id === 'string') : []; } catch { return []; }
}

/** Library navigation with live counts, folders and playlists. Folders accept dragged videos. */
export function Sidebar({view,scope,counts,collections,collapsed,onView,onScope,onCreate,onDropIds,onToggle}:{view:View;scope:string;counts:Record<View,number>&{collections:Record<string,number>};collections:Collection[];collapsed:boolean;onView:(view:View)=>void;onScope:(id:string)=>void;onCreate:(kind:'folder'|'playlist')=>void;onDropIds:(id:string,ids:string[])=>void;onToggle:()=>void}) {
  const [target,setTarget] = useState('');
  const destinations = [{id:'all' as View,label:'All videos',icon:Film},{id:'continue' as View,label:'Continue watching',icon:Clock3},{id:'favorites' as View,label:'Favorites',icon:Heart}];
  const folders = collections.filter(c => c.kind === 'folder');
  const playlists = collections.filter(c => c.kind === 'playlist');
  const dropProps = (id:string) => ({
    onDragOver:(event:React.DragEvent) => { if (!event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (target !== id) setTarget(id); },
    onDragLeave:() => setTarget(current => current === id ? '' : current),
    onDrop:(event:React.DragEvent) => { if (!event.dataTransfer.types.includes(DRAG_TYPE)) return; event.preventDefault(); event.stopPropagation(); setTarget(''); const ids = readDraggedIds(event); if (ids.length) onDropIds(id, ids); },
  });
  const row = (collection:Collection) => <button key={collection.id} type="button" className={`sidebar-item${scope === collection.id ? ' selected' : ''}${target === collection.id ? ' drop-target' : ''}`} aria-label={collection.name} title={collection.name} aria-pressed={scope === collection.id} onClick={() => onScope(collection.id)} {...dropProps(collection.id)}>
    {collection.kind === 'folder' ? <Folder size={18} aria-hidden="true"/> : <ListVideo size={18} aria-hidden="true"/>}
    <span className="sidebar-label-text">{collection.name}</span>
    <small className="sidebar-count">{counts.collections[collection.id] || 0}</small>
  </button>;
  return <aside className={`library-sidebar${collapsed ? ' collapsed' : ''}`} aria-label="Sidebar">
    <nav aria-label="Library navigation" data-selected={scope ? undefined : view}>
      <span className="nav-pill" aria-hidden="true"/>
      {destinations.map(({id,label,icon:Icon}) => <button key={id} type="button" aria-label={label} title={label} aria-pressed={view === id && !scope} className={view === id && !scope ? 'selected' : ''} onClick={() => onView(id)} {...(id === 'all' ? dropProps('') : {})}>
        <Icon size={20} aria-hidden="true"/><span className="sidebar-label-text" aria-hidden="true">{label}</span><small className="sidebar-count" aria-hidden="true">{counts[id]}</small>
      </button>)}
    </nav>
    <div className="sidebar-section">
      <div className="sidebar-heading"><span>Folders</span><button type="button" className="icon-button" aria-label="Create folder" title="New folder" onClick={() => onCreate('folder')}><FolderPlus size={16} aria-hidden="true"/></button></div>
      {folders.length ? folders.map(row) : <p className="sidebar-empty">Open a folder or drag videos here.</p>}
    </div>
    <div className="sidebar-section">
      <div className="sidebar-heading"><span>Playlists</span><button type="button" className="icon-button" aria-label="Create playlist" title="New playlist" onClick={() => onCreate('playlist')}><ListPlus size={16} aria-hidden="true"/></button></div>
      {playlists.length ? playlists.map(row) : <p className="sidebar-empty">No playlists yet.</p>}
    </div>
    <button type="button" className="icon-button sidebar-toggle" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={onToggle}>{collapsed ? <PanelLeftOpen size={18} aria-hidden="true"/> : <PanelLeftClose size={18} aria-hidden="true"/>}</button>
  </aside>;
}
