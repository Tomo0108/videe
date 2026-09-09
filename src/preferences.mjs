/** @typedef {{ resume: boolean, autoplay: boolean, autoAdvance: boolean, repeat: 'off'|'one'|'all', speed: number, volume: number, theme: 'system'|'light'|'dark', layout: 'grid'|'list', sort: 'recent'|'name'|'duration'|'size' }} Preferences */
/** @type {Preferences} */
export const defaults = { resume: true, autoplay: true, autoAdvance: true, repeat: 'off', speed: 1, volume: 0.8, theme: 'system', layout: 'grid', sort: 'recent' };
/** Validate persisted settings, including migration from the original autoplay setting.
 * @param {unknown} value
 * @returns {Preferences}
 */
export function normalizePreferences(value) {
  const result = {...defaults};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const data = /** @type {Record<string, unknown>} */ (value);
  for (const key of /** @type {const} */ (['resume', 'autoplay', 'autoAdvance'])) {
    if (typeof data[key] === 'boolean') result[key] = data[key];
  }
  if (typeof data.autoAdvance !== 'boolean' && typeof data.autoplay === 'boolean') result.autoAdvance = data.autoplay;
  if (typeof data.volume === 'number' && Number.isFinite(data.volume)) result.volume = Math.max(0, Math.min(1, data.volume));
  if (typeof data.speed === 'number' && [0.5,0.75,1,1.25,1.5,1.75,2].includes(data.speed)) result.speed = data.speed;
  if (data.repeat === 'off' || data.repeat === 'one' || data.repeat === 'all') result.repeat = data.repeat;
  if (data.theme === 'system' || data.theme === 'light' || data.theme === 'dark') result.theme = data.theme;
  if (data.layout === 'grid' || data.layout === 'list') result.layout = data.layout;
  if (data.sort === 'recent' || data.sort === 'name' || data.sort === 'duration' || data.sort === 'size') result.sort = data.sort;
  return result;
}
/** @param {number} index @param {number} length @param {Preferences['repeat']} repeat @param {boolean} autoAdvance */
export function nextOnEnded(index, length, repeat, autoAdvance) {
  if(index < 0 || index >= length) return -1;
  if(repeat === 'one') return index;
  if(repeat === 'all') return (index + 1) % length;
  return autoAdvance && index + 1 < length ? index + 1 : -1;
}
