export const EXTENSIONS = ['mp4','m4v','mov','webm','mkv','avi','wmv','flv','mpeg','mpg','m2ts','mts','ts','3gp','ogv','vob','mxf','hevc','av1'];
export function isVideo(name, type = '') { return type.startsWith('video/') || EXTENSIONS.includes(name.split('.').pop()?.toLowerCase()); }
export async function filesFromDirectory(handle, acc = [], depth = 0) {
  if (acc.length >= 1000 || depth > 8) return acc;
  for await (const entry of handle.values()) {
    if (acc.length >= 1000) break;
    if (entry.name.startsWith('.')) continue;
    if (entry.kind === 'directory') await filesFromDirectory(entry, acc, depth + 1);
    else if (entry.kind === 'file' && isVideo(entry.name)) acc.push(await entry.getFile());
  }
  return acc;
}
export function timeLabel(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const n = Math.floor(seconds), h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = String(n % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
export function sizeLabel(bytes) { return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`; }
export function toVtt(text) {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (/^WEBVTT(?:\s|$)/.test(clean)) return clean;
  if (!/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(clean)) throw new Error('Choose an SRT or WebVTT subtitle file.');
  return 'WEBVTT\n\n' + clean.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2') + '\n';
}
export function clampTime(value, duration) { return Math.max(0, Math.min(Number.isFinite(duration) ? duration : 0, value)); }
/** Inclusive loop window, or null when the span is shorter than 0.25s. */
export function clipLoop(a, b, duration) {
  if (![a, b, duration].every(Number.isFinite) || duration <= 0) return null;
  const start = clampTime(Math.min(a, b), duration);
  const end = clampTime(Math.max(a, b), duration);
  return end - start >= 0.25 ? { a: start, b: end } : null;
}
function stamp(value) { return Math.max(0, Number(value)).toFixed(3); }
/** Parts to keep after deleting [a, b]. Last part omits end to run to EOF. */
export function keepSegments(a, b, duration) {
  const range = clipLoop(a, b, duration);
  if (!range) return null;
  const parts = [];
  if (range.a >= 0.05) parts.push({ start: 0, end: range.a });
  if (duration - range.b >= 0.05) parts.push({ start: range.b });
  const kept = parts.reduce((sum, part) => sum + ((part.end ?? duration) - part.start), 0);
  return parts.length && kept >= 0.25 ? parts : null;
}
export function cutFilter(parts, audio) {
  const video = parts.map((part, i) => {
    const end = part.end == null ? '' : `:end=${stamp(part.end)}`;
    return `[0:v]trim=start=${stamp(part.start)}${end},setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2[v${i}]`;
  });
  const sounds = audio ? parts.map((part, i) => {
    const end = part.end == null ? '' : `:end=${stamp(part.end)}`;
    return `[0:a]atrim=start=${stamp(part.start)}${end},asetpts=PTS-STARTPTS[a${i}]`;
  }) : [];
  if (parts.length === 1) return [...video, ...sounds].join(';');
  const pads = parts.map((_, i) => audio ? `[v${i}][a${i}]` : `[v${i}]`).join('');
  return [...video, ...sounds, `${pads}concat=n=${parts.length}:v=1:a=${audio ? 1 : 0}${audio ? '[v][a]' : '[v]'}`].join(';');
}
export function cutMaps(parts, audio) {
  if (parts.length === 1) return audio ? ['-map', '[v0]', '-map', '[a0]'] : ['-map', '[v0]'];
  return audio ? ['-map', '[v]', '-map', '[a]'] : ['-map', '[v]'];
}
const IMAGE_SUBTITLES = /pgs|dvd_subtitle|dvb_sub|hdmv|xsub/i;
const TEXT_SUBTITLES = /subrip|ass|ssa|webvtt|mov_text|srt|text|eia_608|ttml|microdvd/i;
const LANGUAGE_NAMES = { ja: 'Japanese', jpn: 'Japanese', en: 'English', eng: 'English', ko: 'Korean', kor: 'Korean', zh: 'Chinese', zho: 'Chinese', chi: 'Chinese' };
export function subtitleLabel(language, index) {
  const name = LANGUAGE_NAMES[String(language || '').toLowerCase()] || language;
  return name || `Subtitle ${index + 1}`;
}
export function parseSubtitleStreams(stderr) {
  const tracks = [];
  let ordinal = 0;
  const lineRe = /^\s*Stream #0:\d+(?:\[[^\]]*\])?(?:\((\w+)\))?: Subtitle:\s*([^\s,]+)/gm;
  let match;
  while ((match = lineRe.exec(String(stderr || '')))) {
    const language = match[1] || '';
    const codec = match[2] || '';
    const index = ordinal++;
    if (IMAGE_SUBTITLES.test(codec) || !TEXT_SUBTITLES.test(codec)) continue;
    tracks.push({ index, language, codec, label: subtitleLabel(language, index) });
  }
  return tracks;
}
