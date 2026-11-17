/**
 * Plays a repackaged live stream (fragmented MP4 with the file's original video) through Media Source
 * Extensions. The stream is placed at its real time in the file, so the player can land on any exact
 * frame inside what has arrived, even though the stream itself begins at a keyframe.
 */

type Box = { type: string; start: number; end: number; body: number };

function boxes(view: DataView, start: number, end: number): Box[] {
  const list: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(view.getUint8(at + 4), view.getUint8(at + 5), view.getUint8(at + 6), view.getUint8(at + 7));
    let body = at + 8;
    if (size === 1) { size = Number(view.getBigUint64(at + 8)); body = at + 16; }
    else if (size === 0) size = end - at;
    if (size < 8 || at + size > end) break;
    list.push({ type, start: at, end: at + size, body });
    at += size;
  }
  return list;
}
const child = (view: DataView, box: Box, type: string, skip = 0) => boxes(view, box.body + skip, box.end).find(b => b.type === type);
const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

function videoCodec(view: DataView, entry: Box): string {
  const inner = (type: string) => child(view, entry, type, 78);
  if (entry.type === 'avc1' || entry.type === 'avc3') {
    const c = inner('avcC'); if (!c) return entry.type;
    return `${entry.type}.${hex(view.getUint8(c.body + 1))}${hex(view.getUint8(c.body + 2))}${hex(view.getUint8(c.body + 3))}`;
  }
  if (entry.type === 'hvc1' || entry.type === 'hev1') {
    const c = inner('hvcC'); if (!c) return entry.type;
    const b = c.body;
    const first = view.getUint8(b + 1);
    const space = ['', 'A', 'B', 'C'][first >> 6];
    const tier = first & 0x20 ? 'H' : 'L';
    const profile = first & 0x1f;
    let compat = view.getUint32(b + 2), reversed = 0;
    for (let i = 0; i < 32; i++) { reversed = (reversed << 1) | (compat & 1); compat >>>= 1; }
    const constraints: number[] = [];
    for (let i = 0; i < 6; i++) constraints.push(view.getUint8(b + 6 + i));
    while (constraints.length && constraints[constraints.length - 1] === 0) constraints.pop();
    return [`${entry.type}.${space}${profile}`, (reversed >>> 0).toString(16).toUpperCase(), `${tier}${view.getUint8(b + 12)}`, ...constraints.map(hex)].join('.');
  }
  if (entry.type === 'av01') {
    const c = inner('av1C'); if (!c) return 'av01';
    const a = view.getUint8(c.body + 1), d = view.getUint8(c.body + 2);
    const depth = d & 0x40 ? (d & 0x20 ? 12 : 10) : 8;
    return `av01.${a >> 5}.${String(a & 0x1f).padStart(2, '0')}${d & 0x80 ? 'H' : 'M'}.${String(depth).padStart(2, '0')}`;
  }
  if (entry.type === 'vp09') {
    const c = inner('vpcC'); if (!c) return 'vp09';
    const b = c.body + 4;
    return `vp09.${String(view.getUint8(b)).padStart(2, '0')}.${String(view.getUint8(b + 1)).padStart(2, '0')}.${String(view.getUint8(b + 2) >> 4).padStart(2, '0')}`;
  }
  return entry.type;
}

function audioCodec(view: DataView, entry: Box): string {
  if (entry.type === 'fLaC') return 'flac';
  if (entry.type === 'Opus') return 'opus';
  if (entry.type === '.mp3') return 'mp3';
  if (entry.type !== 'mp4a') return entry.type;
  const esds = child(view, entry, 'esds', 28);
  if (!esds) return 'mp4a.40.2';
  // ES_Descriptor (3) → DecoderConfigDescriptor (4): object type, then DecoderSpecificInfo (5).
  const bytes = new Uint8Array(view.buffer, view.byteOffset + esds.body + 4, esds.end - esds.body - 4);
  const size = (at: number) => { let n = 0, i = at; for (let k = 0; k < 4; k++) { const v = bytes[i++]; n = (n << 7) | (v & 0x7f); if (!(v & 0x80)) break; } return i; };
  let i = 0;
  if (bytes[i] === 3) { i = size(i + 1); i += 3; }
  if (bytes[i] !== 4) return 'mp4a.40.2';
  i = size(i + 1);
  const objectType = bytes[i];
  if (objectType !== 0x40) return `mp4a.${hex(objectType)}`;
  i += 13;
  if (bytes[i] !== 5) return 'mp4a.40.2';
  i = size(i + 1);
  return `mp4a.40.${bytes[i] >> 3 || 2}`;
}

/** The MSE type for an init segment (ftyp + moov), e.g. video/mp4; codecs="hvc1.2.4.L120.90,flac". */
export function mseType(init: Uint8Array): string {
  const view = new DataView(init.buffer, init.byteOffset, init.byteLength);
  const moov = boxes(view, 0, init.byteLength).find(b => b.type === 'moov');
  const codecs: string[] = [];
  if (moov) for (const trak of boxes(view, moov.body, moov.end).filter(b => b.type === 'trak')) {
    const stbl = ['mdia', 'minf', 'stbl'].reduce<Box | undefined>((box, type) => box && child(view, box, type), trak);
    const stsd = stbl && child(view, stbl, 'stsd');
    const entry = stsd && boxes(view, stsd.body + 8, stsd.end)[0];
    if (!entry) continue;
    codecs.push(['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp09'].includes(entry.type) ? videoCodec(view, entry) : audioCodec(view, entry));
  }
  return `video/mp4; codecs="${codecs.join(',')}"`;
}

/** Where the init segment (ftyp + moov) ends, once all of it has arrived; 0 before that. */
function initEnd(data: Uint8Array): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const moov = boxes(view, 0, data.byteLength).find(b => b.type === 'moov');
  return moov ? moov.end : 0;
}

export type MseStream = { url: string; dispose(): void };

/**
 * `offset` is the stream's start time in the file (its first keyframe). `media` returns the element
 * that plays it, for keeping the buffer bounded. `fail` is called if the browser can't play it.
 */
export function mseStream(src: string, offset: number, duration: number, media: () => HTMLMediaElement | null, fail: (message: string) => void): MseStream {
  const source = new MediaSource();
  const url = URL.createObjectURL(source);
  const abort = new AbortController();
  let disposed = false;
  const done = (sb: SourceBuffer) => new Promise<void>((resolve, reject) => {
    const ok = () => { sb.removeEventListener('error', bad); resolve(); };
    const bad = () => { sb.removeEventListener('updateend', ok); reject(new Error('append failed')); };
    sb.addEventListener('updateend', ok, { once: true }); sb.addEventListener('error', bad, { once: true });
  });
  const run = async () => {
    if (duration > 0) source.duration = duration;
    const response = await fetch(src, { signal: abort.signal });
    if (!response.ok || !response.body) throw new Error('Could not open this video.');
    const reader = response.body.getReader();
    let head: Uint8Array<ArrayBuffer> = new Uint8Array(0);
    let sb: SourceBuffer | undefined;
    const append = async (chunk: Uint8Array<ArrayBuffer>) => {
      for (;;) {
        try { sb!.appendBuffer(chunk); await done(sb!); return; }
        catch (error) {
          if (disposed) return;
          if ((error as DOMException)?.name !== 'QuotaExceededError') throw error;
          // Full: drop what's well behind the playhead, or wait for playback to catch up.
          const now = media()?.currentTime ?? 0;
          const buffered = sb!.buffered;
          if (buffered.length && buffered.start(0) < now - 10) { sb!.remove(0, now - 10); await done(sb!); }
          else await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    };
    for (;;) {
      const { value, done: ended } = await reader.read();
      if (disposed) return;
      if (ended) break;
      if (!sb) {
        const joined = new Uint8Array(head.length + value.length); joined.set(head); joined.set(value, head.length); head = joined;
        if (!initEnd(head)) continue;
        const type = mseType(head.subarray(0, initEnd(head)));
        if (!MediaSource.isTypeSupported(type)) throw new Error(`Unsupported: ${type}`);
        sb = source.addSourceBuffer(type);
        sb.mode = 'segments';
        sb.timestampOffset = offset;
        await append(head); head = new Uint8Array(0);
      } else await append(value);
      // Keep about a minute ahead and a little behind; reading pauses so ffmpeg waits too.
      for (;;) {
        const element = media(); const buffered = sb.buffered;
        if (disposed || !element || !buffered.length) break;
        const now = element.currentTime;
        if (buffered.start(0) < now - 30 && !sb.updating) { sb.remove(0, now - 20); await done(sb); }
        if (buffered.end(buffered.length - 1) - now < 90) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (!disposed && source.readyState === 'open' && sb && !sb.updating) source.endOfStream();
  };
  source.addEventListener('sourceopen', () => {
    run().catch(error => { if (!disposed && !abort.signal.aborted) fail(error instanceof Error ? error.message : String(error)); });
  }, { once: true });
  return { url, dispose() { disposed = true; abort.abort(); URL.revokeObjectURL(url); } };
}
