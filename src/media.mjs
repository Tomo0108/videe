export const EXTENSIONS = ['mp4','m4v','mov','webm','mkv','avi','wmv','flv','mpeg','mpg','m2ts','mts','ts','3gp','ogv','vob','mxf','hevc','av1'];
export function isVideo(name, type = '') { return type.startsWith('video/') || EXTENSIONS.includes(name.split('.').pop()?.toLowerCase()); }
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
