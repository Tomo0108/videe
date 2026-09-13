/** @typedef {{id:string,name:string,kind:'folder'|'playlist',ids:string[]}} Collection */

/** Shared root folder name from directory-picker files, or empty when files are loose. */
export function sourceFolderName(files) {
  const names = [];
  for (const file of files) {
    const relative = typeof file?.webkitRelativePath === 'string' ? file.webkitRelativePath : '';
    const first = relative.split(/[/\\]/).find(part => part && part !== '.');
    if (first) names.push(first);
  }
  if (!names.length) return '';
  const first = names[0];
  return names.every(name => name === first) ? first.slice(0, 80) : '';
}

/** Put videos in a folder named after the import source. Same name merges; folders stay exclusive. */
export function placeInFolder(collections, name, ids) {
  const trimmed = String(name || '').trim().slice(0, 80);
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id))];
  if (!trimmed || !unique.length) return { collections, folderId: '' };
  const existing = collections.find(c => c.kind === 'folder' && c.name === trimmed);
  if (existing) {
    return {
      collections: collections.map(c => c.id === existing.id
        ? { ...c, ids: [...new Set([...c.ids, ...unique])] }
        : c.kind === 'folder' ? { ...c, ids: c.ids.filter(id => !unique.includes(id)) } : c),
      folderId: existing.id,
    };
  }
  const folder = { id: crypto.randomUUID(), name: trimmed, kind: 'folder', ids: unique };
  return {
    collections: [
      ...collections.map(c => c.kind === 'folder' ? { ...c, ids: c.ids.filter(id => !unique.includes(id)) } : c),
      folder,
    ],
    folderId: folder.id,
  };
}

/** Move videos into a folder, playlist, or Unfiled (`dest` empty). Folders remain exclusive. */
export function moveToFolder(collections, ids, dest) {
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id))];
  if (!unique.length) return collections;
  const target = dest ? collections.find(c => c.id === dest) : undefined;
  if (dest && !target) return collections;
  return collections.map(c => ({
    ...c,
    ids: c.id === dest
      ? [...new Set([...c.ids, ...unique])]
      : c.kind === 'folder' && (target?.kind === 'folder' || !dest)
        ? c.ids.filter(id => !unique.includes(id))
        : c.ids,
  }));
}
