/** How many previews the desktop app reads at once. Each one is a short FFmpeg run outside the renderer. */
export const NATIVE_THUMBNAIL_JOBS = 3;
/**
 * The previews to work on now, in library order. Files read by FFmpeg run a few at a time;
 * files decoded in the page run alone, because each one needs its own video decoder.
 * @template {{id: string, native?: boolean}} T
 * @param {T[]} items
 * @param {{needs: (item: T) => boolean, skip?: string, attempted?: Set<string>, nativeFrames?: boolean, limit?: number}} options
 * @returns {T[]}
 */
export function thumbnailBatch(items, { needs, skip = '', attempted = new Set(), nativeFrames = false, limit = NATIVE_THUMBNAIL_JOBS }) {
  const batch = [];
  for (const item of items) {
    if (item.id === skip || attempted.has(item.id) || !needs(item)) continue;
    if (!(nativeFrames && item.native)) { if (!batch.length) batch.push(item); break; }
    batch.push(item);
    if (batch.length >= limit) break;
  }
  return batch;
}
