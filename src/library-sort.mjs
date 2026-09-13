/** @typedef {'recent'|'name'|'duration'|'size'} LibrarySort */
/** @typedef {'asc'|'desc'} SortDir */
/** @typedef {{sort: LibrarySort, dir: SortDir}} SortPref */

export const LIBRARY_SORTS = /** @type {const} */ (['name', 'duration', 'size', 'recent']);
export const DEFAULT_DIR = { recent: 'desc', name: 'asc', duration: 'desc', size: 'desc' };
const STORAGE = 'videe-folder-sort';

/** @param {unknown} value @returns {LibrarySort} */
export function normalizeSort(value) {
  return LIBRARY_SORTS.includes(/** @type {LibrarySort} */ (value)) ? /** @type {LibrarySort} */ (value) : 'recent';
}

/** @param {unknown} value @param {LibrarySort} [sort] @returns {SortDir} */
export function normalizeDir(value, sort = 'recent') {
  if (value === 'asc' || value === 'desc') return value;
  return DEFAULT_DIR[sort];
}

/** @param {string} scope @param {string} view @param {boolean} playlist */
export function sortKey(scope, view, playlist) {
  if (playlist) return '';
  return scope || `view:${view}`;
}

/** @param {SortPref} current @param {LibrarySort} next */
export function nextSortPref(current, next) {
  if (current.sort === next) return { sort: next, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { sort: next, dir: DEFAULT_DIR[next] };
}

export function readFolderSort() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    /** @type {Record<string, SortPref>} */
    const result = {};
    for (const [key, entry] of Object.entries(data)) {
      if (!key || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const sort = normalizeSort(/** @type {{sort?: unknown}} */ (entry).sort);
      result[key] = { sort, dir: normalizeDir(/** @type {{dir?: unknown}} */ (entry).dir, sort) };
    }
    return result;
  } catch {
    return {};
  }
}

/** @param {Record<string, SortPref>} value */
export function writeFolderSort(value) {
  localStorage.setItem(STORAGE, JSON.stringify(value));
}

/** @param {{name:string,duration:number,size:number,lastPlayed:number,added:number}} a @param {{name:string,duration:number,size:number,lastPlayed:number,added:number}} b @param {LibrarySort} sort @param {SortDir} dir */
export function compareMedia(a, b, sort, dir) {
  const sign = dir === 'asc' ? 1 : -1;
  let delta = 0;
  if (sort === 'name') delta = a.name.localeCompare(b.name, 'en', { numeric: true });
  else if (sort === 'duration') delta = a.duration - b.duration;
  else if (sort === 'size') delta = a.size - b.size;
  else delta = (a.lastPlayed || a.added) - (b.lastPlayed || b.added);
  return delta * sign || a.name.localeCompare(b.name, 'en', { numeric: true });
}
