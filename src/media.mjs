// Chromium plays many of these directly; the desktop app can convert the rest
// to a broadly compatible MP4 when its codecs are not supported by the player.
export const EXTENSIONS = ['mp4','m4v','mov','qt','webm','mkv','avi','divx','wmv','asf','flv','f4v','mpeg','mpg','m2ts','mts','ts','3gp','3g2','ogv','vob','mxf','dv','hevc','av1','rm','rmvb'];
export function isVideo(name, type = '') { return type.startsWith('video/') || EXTENSIONS.includes(name.split('.').pop()?.toLowerCase()); }
export async function filesFromDirectory(handle, acc = [], depth = 0, prefix = handle.name || '') {
  if (acc.length >= 1000 || depth > 8) return acc;
  for await (const entry of handle.values()) {
    if (acc.length >= 1000) break;
    if (entry.name.startsWith('.')) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') await filesFromDirectory(entry, acc, depth + 1, relative);
    else if (entry.kind === 'file' && isVideo(entry.name)) {
      const file = await entry.getFile();
      try { Object.defineProperty(file, 'webkitRelativePath', { value: relative }); } catch { /* File path is informational. */ }
      acc.push(file);
    }
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

// ---------------------------------------------------------------------------
// Playback engine. Like VLC, Videe inspects each file before playing it and
// picks the cheapest path that the built-in decoder can show smoothly:
// direct playback, a fast stream-copy remux, or live transcoding.

/** @param {string} value */
function clockSeconds(value) {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(String(value || '').trim());
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
}

/**
 * Read the stream layout that `ffmpeg -i` prints to stderr.
 * @param {string} stderr
 */
export function parseMediaInfo(stderr) {
  const text = String(stderr || '');
  const format = /^Input #0, ([^ ]+?), from /m.exec(text)?.[1] || '';
  const durationMatch = /^\s*Duration: ([\d:.]+|N\/A)(?:, start: (-?[\d.]+))?(?:, bitrate: (\d+) kb\/s)?/m.exec(text);
  const info = {
    format,
    duration: durationMatch ? clockSeconds(durationMatch[1]) : 0,
    start: durationMatch?.[2] ? Number(durationMatch[2]) : 0,
    bitrate: durationMatch?.[3] ? Number(durationMatch[3]) * 1000 : 0,
    /** @type {null | {codec:string, profile:string, pixFmt:string, width:number, height:number, fps:number, interlaced:boolean, bitDepth:number, chroma:string, rotation:number}} */
    video: null,
    /** @type {{codec:string, profile:string, channels:string, sampleRate:number, language:string}[]} */
    audio: [],
    subtitles: 0,
  };
  const streamRe = /^\s*Stream #0:(\d+)(?:\[[^\]]*\])?(?:\((\w+)\))?: (Video|Audio|Subtitle): (.+)$/gm;
  let match;
  while ((match = streamRe.exec(text))) {
    const [, , language = '', kind, rest] = match;
    if (kind === 'Subtitle') { info.subtitles++; continue; }
    const codec = /^([\w-]+)/.exec(rest)?.[1] || '';
    const profile = /^[\w-]+ \(([^)]+)\)/.exec(rest)?.[1]?.replace(/^.*\/ 0x[0-9a-f]+$/i, '') || '';
    if (kind === 'Audio') {
      const sampleRate = Number(/(\d+) Hz/.exec(rest)?.[1] || 0);
      const channels = /Hz, ([^,]+)/.exec(rest)?.[1]?.trim() || '';
      info.audio.push({ codec, profile, channels, sampleRate, language });
      continue;
    }
    if (info.video || /\(attached pic\)/.test(rest) || /^(mjpeg|png|bmp)\b/.test(codec) && /attached|cover/i.test(rest)) continue;
    // `..., yuv420p10le(tv, bt709, top first), 1920x1080 [SAR ...` — the pixel format sits right before the frame size.
    const layout = /,\s*([a-z][a-z0-9_]*)(?:\(([^)]*)\))?,\s*(\d{2,5})x(\d{2,5})/i.exec(rest);
    const pixFmt = layout?.[1] || '';
    const size = layout ? [layout[0], layout[3], layout[4]] : /(?:^|, )(\d{2,5})x(\d{2,5})/.exec(rest);
    const fps = Number(/([\d.]+) fps/.exec(rest)?.[1] || /([\d.]+) tbr/.exec(rest)?.[1] || 0);
    const interlaced = /top first|bottom first|top coded first|bottom coded first|interlaced/i.test(layout?.[2] || '');
    const bitDepth = Number(/p(9|10|12|14|16)(?:le|be)/.exec(pixFmt)?.[1] || 8);
    const chroma = /444|gbr|rgb|bgr/.test(pixFmt) ? '444' : /422/.test(pixFmt) ? '422' : /411/.test(pixFmt) ? '411' : '420';
    info.video = { codec, profile, pixFmt, width: size ? Number(size[1]) : 0, height: size ? Number(size[2]) : 0, fps, interlaced, bitDepth, chroma, rotation: 0 };
  }
  const rotation = /rotation of (-?[\d.]+) degrees/.exec(text);
  if (info.video && rotation) info.video.rotation = Math.round(Number(rotation[1]));
  return info;
}

const CODEC_NAMES = { h264: 'H.264', hevc: 'HEVC', av1: 'AV1', vp9: 'VP9', vp8: 'VP8', mpeg4: 'MPEG-4', msmpeg4v3: 'DivX', mpeg2video: 'MPEG-2', mpeg1video: 'MPEG-1', prores: 'ProRes', dnxhd: 'DNxHD', wmv3: 'WMV', vc1: 'VC-1', theora: 'Theora', mjpeg: 'Motion JPEG', aac: 'AAC', ac3: 'AC-3', eac3: 'E-AC-3', dts: 'DTS', mp3: 'MP3', mp2: 'MP2', opus: 'Opus', vorbis: 'Vorbis', flac: 'FLAC', truehd: 'TrueHD', alac: 'ALAC', wmav2: 'WMA' };
/** @param {string} codec */
export function codecName(codec) {
  if (CODEC_NAMES[codec]) return CODEC_NAMES[codec];
  if (/^pcm_/.test(codec)) return 'PCM';
  return String(codec || '').toUpperCase();
}
const DIRECT_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1', 'theora']);
const DIRECT_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
const MP4_FORMAT = /\b(mov|mp4|m4a)\b/;
const WEBM_VIDEO = new Set(['vp8', 'vp9', 'av1']);
const WEBM_AUDIO = new Set(['opus', 'vorbis']);

/**
 * Decide how a file should reach the built-in decoder.
 * @param {ReturnType<typeof parseMediaInfo>} info
 * @param {{platform?: string}} [options]
 * @returns {{mode: 'direct'|'remux'|'transcode', reasons: string[], audio: 'copy'|'aac'|'none', deinterlace: boolean}}
 */
export function playbackPlan(info, { platform = '' } = {}) {
  const reasons = [];
  const video = info?.video;
  const audio = info?.audio?.[0];
  let transcode = false;
  if (video) {
    const hevcNative = video.codec === 'hevc' && (platform === 'darwin' || platform === 'win32') && video.chroma === '420' && video.bitDepth <= 10;
    if (!DIRECT_VIDEO.has(video.codec) && !hevcNative) { transcode = true; reasons.push(`${codecName(video.codec) || 'This'} video is converted for playback`); }
    else if (video.codec === 'h264' && (video.bitDepth > 8 || video.chroma !== '420')) { transcode = true; reasons.push(`H.264 ${video.bitDepth}-bit ${video.chroma.replace(/(\d)(\d)(\d)/, '$1:$2:$3')} is decoded in software`); }
    else if (video.chroma !== '420' && video.codec !== 'vp9' && video.codec !== 'av1') { transcode = true; reasons.push(`${video.chroma.replace(/(\d)(\d)(\d)/, '$1:$2:$3')} color needs conversion`); }
    if (video.interlaced) { transcode = true; reasons.push('Interlaced video is deinterlaced'); }
  }
  const audioOk = !audio || DIRECT_AUDIO.has(audio.codec);
  if (!audioOk) reasons.push(`${codecName(audio.codec)} audio is converted to AAC`);
  const webmOk = /\bwebm\b/.test(info?.format || '') && (!video || WEBM_VIDEO.has(video.codec)) && (!audio || WEBM_AUDIO.has(audio.codec));
  const containerOk = MP4_FORMAT.test(info?.format || '') || webmOk || /^ogg$/.test(info?.format || '');
  if (!containerOk && !transcode) reasons.push('Container is repackaged as MP4');
  const audioMode = !audio ? 'none' : audioOk ? 'copy' : 'aac';
  if (transcode) return { mode: 'transcode', reasons, audio: audio ? 'aac' : 'none', deinterlace: !!video?.interlaced };
  if (!containerOk || !audioOk) return { mode: 'remux', reasons, audio: audioMode, deinterlace: false };
  return { mode: 'direct', reasons, audio: audioMode, deinterlace: false };
}

/** Video filter for live playback: deinterlace, cap at 1080p, 8-bit 4:2:0. */
export function liveFilter(info) {
  const filters = [];
  if (info?.video?.interlaced) filters.push('bwdif=mode=send_frame:parity=auto:deint=interlaced');
  filters.push("scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2");
  filters.push('format=yuv420p');
  return filters.join(',');
}

/** Encoder arguments tuned for real-time playback. */
export function liveEncoderArgs(encoder, fps = 30) {
  const gop = String(Math.max(12, Math.round((fps || 30) * 2)));
  if (encoder === 'h264_videotoolbox') return ['-c:v', encoder, '-realtime', '1', '-b:v', '10M', '-maxrate', '16M', '-g', gop, '-profile:v', 'high'];
  if (encoder === 'h264_nvenc') return ['-c:v', encoder, '-preset', 'p2', '-tune', 'll', '-rc', 'vbr', '-cq', '21', '-b:v', '0', '-g', gop, '-profile:v', 'high'];
  if (encoder === 'h264_qsv') return ['-c:v', encoder, '-preset', 'veryfast', '-global_quality', '22', '-g', gop, '-profile:v', 'high'];
  if (encoder === 'h264_amf') return ['-c:v', encoder, '-usage', 'lowlatency', '-quality', 'speed', '-rc', 'cqp', '-qp_i', '20', '-qp_p', '22', '-g', gop];
  return ['-c:v', 'libx264', '-preset', fps > 40 ? 'superfast' : 'veryfast', '-tune', 'zerolatency', '-crf', '20', '-g', gop, '-profile:v', 'high'];
}

/**
 * ffmpeg arguments that stream a fragmented MP4 to stdout from `start` seconds.
 * @param {string} input @param {number} start @param {ReturnType<typeof parseMediaInfo>} info @param {string} encoder
 */
export function liveArgs(input, start, info, encoder = 'libx264') {
  const seek = Math.max(0, Number(start) || 0);
  return [
    '-hide_banner', '-nostdin', '-loglevel', 'error',
    ...(encoder === 'libx264' ? [] : ['-hwaccel', 'auto']),
    ...(seek > 0 ? ['-ss', seek.toFixed(3)] : []),
    '-i', input,
    '-map', '0:V:0?', '-map', '0:a:0?', '-sn', '-dn',
    '-vf', liveFilter(info),
    ...liveEncoderArgs(encoder, info?.video?.fps),
    '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '500000',
    'pipe:1',
  ];
}

/** ffmpeg arguments for a stream-copy remux into a seekable MP4. */
export function remuxArgs(input, plan, info) {
  const hevc = info?.video?.codec === 'hevc';
  return ['-i', input, '-map', '0:V:0?', '-map', '0:a:0?', '-sn', '-dn', '-c:v', 'copy', ...(hevc ? ['-tag:v', 'hvc1'] : []),
    ...(plan.audio === 'aac' ? ['-c:a', 'aac', '-b:a', '256k'] : ['-c:a', 'copy'])];
}

/** Human readable codec summary. */
export function codecLabel(info) {
  const video = info?.video;
  const audio = info?.audio?.[0];
  const parts = [];
  if (video) parts.push(`${codecName(video.codec)}${video.height ? ` ${video.height}${video.interlaced ? 'i' : 'p'}` : ''}${video.fps ? ` ${Math.round(video.fps * 100) / 100}fps` : ''}`);
  if (audio) parts.push(codecName(audio.codec));
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Editing.

/** Frame-accurate timecode HH:MM:SS:FF. */
export function timecode(seconds, fps = 30) {
  const rate = Math.max(1, Math.round(Number(fps) || 30));
  const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  let frames = Math.floor(value * rate + 1e-6);
  const ff = frames % rate; frames = Math.floor(frames / rate);
  const s = frames % 60, m = Math.floor(frames / 60) % 60, h = Math.floor(frames / 3600);
  return [h, m, s, ff].map(n => String(n).padStart(2, '0')).join(':');
}

/** Parse `HH:MM:SS:FF`, `HH:MM:SS.mmm`, `MM:SS` or plain seconds. Returns NaN when invalid. */
export function parseTimecode(text, fps = 30) {
  const value = String(text || '').trim();
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const frames = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}):(\d{1,3})$/.exec(value);
  if (frames) return Number(frames[1] || 0) * 3600 + Number(frames[2]) * 60 + Number(frames[3]) + Number(frames[4]) / Math.max(1, Math.round(fps || 30));
  const clock = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(value);
  if (clock) return Number(clock[1] || 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  return NaN;
}

/** Sorted, clamped, non-overlapping export segments. */
export function normalizeSegments(segments, duration) {
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const list = (Array.isArray(segments) ? segments : [])
    .map(segment => ({ ...segment, start: clampTime(Math.min(segment.start, segment.end), length), end: clampTime(Math.max(segment.start, segment.end), length) }))
    .filter(segment => segment.end - segment.start >= 0.05)
    .sort((a, b) => a.start - b.start);
  const result = [];
  for (const segment of list) {
    const last = result[result.length - 1];
    if (last && segment.start < last.end) last.end = Math.max(last.end, segment.end);
    else result.push({ ...segment });
  }
  return result;
}

/** Split the segment under `time` in two. An empty list means the whole clip. */
export function splitSegments(segments, time, duration, makeId = () => Math.random().toString(36).slice(2)) {
  const list = segments.length ? segments : [{ id: makeId(), start: 0, end: duration }];
  const index = list.findIndex(segment => time > segment.start + 0.05 && time < segment.end - 0.05);
  if (index < 0) return list;
  const target = list[index];
  return [...list.slice(0, index), { ...target, end: time }, { id: makeId(), start: time, end: target.end }, ...list.slice(index + 1)];
}

/** Total length that will be exported. */
export function segmentsDuration(segments, duration) {
  const list = normalizeSegments(segments, duration);
  return list.length ? list.reduce((sum, segment) => sum + segment.end - segment.start, 0) : (duration || 0);
}

const QUALITY = { h264: { high: 18, standard: 21, small: 26 }, hevc: { high: 20, standard: 24, small: 28 } };

/**
 * Re-encode export arguments (everything after `-i input`).
 * @param {{segments:{start:number,end:number}[], codec?:'h264'|'hevc', quality?:'high'|'standard'|'small', height?:number, audio?:boolean, rotate?:number, fps?:number, encoder?:string}} options
 * @param {{duration:number, hasAudio:boolean}} source
 */
export function exportEncodeArgs(options, source) {
  const parts = normalizeSegments(options.segments, source.duration);
  const keep = parts.length ? parts : [{ start: 0, end: source.duration }];
  const audio = options.audio !== false && source.hasAudio;
  const post = [];
  if (options.height) post.push(`scale=-2:'min(${Math.round(options.height)},ih)'`);
  const rotate = ((Number(options.rotate) || 0) % 360 + 360) % 360;
  if (rotate === 90) post.push('transpose=1');
  else if (rotate === 180) post.push('hflip,vflip');
  else if (rotate === 270) post.push('transpose=2');
  if (options.fps) post.push(`fps=${Number(options.fps)}`);
  post.push('scale=trunc(iw/2)*2:trunc(ih/2)*2', 'format=yuv420p');
  const filters = [];
  keep.forEach((part, i) => {
    const end = Number.isFinite(part.end) && part.end < source.duration - 0.001 ? `:end=${stamp(part.end)}` : '';
    filters.push(`[0:V:0]trim=start=${stamp(part.start)}${end},setpts=PTS-STARTPTS[v${i}]`);
    if (audio) filters.push(`[0:a:0]atrim=start=${stamp(part.start)}${end},asetpts=PTS-STARTPTS[a${i}]`);
  });
  const pads = keep.map((_, i) => audio ? `[v${i}][a${i}]` : `[v${i}]`).join('');
  filters.push(`${pads}concat=n=${keep.length}:v=1:a=${audio ? 1 : 0}${audio ? '[cv][a]' : '[cv]'}`);
  filters.push(`[cv]${post.join(',')}[v]`);
  const codec = options.codec === 'hevc' ? 'hevc' : 'h264';
  const crf = String(QUALITY[codec][options.quality || 'standard'] ?? QUALITY[codec].standard);
  const encoder = options.encoder || '';
  const video = encoder && encoder !== 'libx264'
    ? ['-c:v', encoder, '-b:v', options.quality === 'high' ? '24M' : options.quality === 'small' ? '6M' : '12M']
    : codec === 'hevc' ? ['-c:v', 'libx265', '-preset', 'medium', '-crf', crf, '-tag:v', 'hvc1'] : ['-c:v', 'libx264', '-preset', 'medium', '-crf', crf, '-profile:v', 'high'];
  return ['-filter_complex', filters.join(';'), '-map', '[v]', ...(audio ? ['-map', '[a]', '-c:a', 'aac', '-b:a', '256k'] : ['-an']), ...video];
}

/** Lossless (stream copy) export: one ffmpeg call per segment, then concat. */
export function exportCopySegmentArgs(input, segment, output, audio = true) {
  return ['-hide_banner', '-nostdin', '-y', '-ss', stamp(segment.start), '-i', input, '-t', stamp(segment.end - segment.start),
    '-map', '0:V:0?', ...(audio ? ['-map', '0:a?'] : ['-an']), '-sn', '-dn', '-c', 'copy', '-avoid_negative_ts', 'make_zero', output];
}

/** Concat demuxer list file contents. */
export function concatList(files) {
  return files.map(file => `file '${String(file).replace(/'/g, "'\\''")}'`).join('\n') + '\n';
}
