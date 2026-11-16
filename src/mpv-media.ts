/**
 * A stand-in for <video> backed by the embedded mpv engine (Windows desktop app).
 * It offers the parts of HTMLMediaElement the player uses and fires the same events,
 * so the player's controls, seeking, looping and resume logic work unchanged.
 */
export type MpvEvent =
  | { type: 'property'; name: string; value: unknown }
  | { type: 'loaded'; duration: number; width: number; height: number }
  | { type: 'restart' }
  | { type: 'error'; message: string };

export type MpvBridge = {
  available(): Promise<boolean>;
  open(id: string, options: { volume: number; speed: number; muted: boolean }): Promise<void>;
  set(name: string, value: unknown): Promise<void>;
  command(name: string, args: (string | number)[]): Promise<unknown>;
  place(rect: { x: number; y: number; width: number; height: number; holes?: { x: number; y: number; width: number; height: number }[] } | null): Promise<void>;
  stop(): Promise<void>;
  onEvent(cb: (event: MpvEvent) => void): () => void;
};

export class MpvMedia extends EventTarget {
  private time = 0;
  private length = NaN;
  private isPaused = true;
  private isEnded = false;
  private rate = 1;
  private level = 1;
  private silent = false;
  private looping = false;
  private width = 0;
  private height = 0;
  private ready = 0;
  private seekingTo: number | null = null;
  private off: () => void;
  error: { message: string } | null = null;
  readonly textTracks = Object.assign([] as TextTrack[], { addEventListener() {}, removeEventListener() {} }) as unknown as TextTrackList;

  constructor(private bridge: MpvBridge, readonly id: string) {
    super();
    this.off = bridge.onEvent(event => this.handle(event));
  }

  async open(options: { volume: number; speed: number; muted: boolean }) {
    this.level = options.volume; this.rate = options.speed; this.silent = options.muted;
    try { await this.bridge.open(this.id, options); }
    catch (e) { this.fail(e instanceof Error ? e.message : String(e)); }
  }

  private emit(type: string) { this.dispatchEvent(new Event(type)); }
  private fail(message: string) { this.error = { message }; this.emit('error'); }

  private handle(event: MpvEvent) {
    if (event.type === 'loaded') {
      this.length = event.duration || NaN; this.width = event.width; this.height = event.height; this.ready = 4; this.error = null; this.isEnded = false;
      this.emit('loadedmetadata'); this.emit('canplay');
      return;
    }
    if (event.type === 'error') { this.fail(event.message); return; }
    if (event.type === 'restart') { this.seekingTo = null; if (!this.isPaused) this.emit('playing'); this.emit('seeked'); return; }
    const { name, value } = event;
    if (name === 'time-pos' && typeof value === 'number') {
      if (this.seekingTo === null) this.time = value;
      this.emit('timeupdate');
    } else if (name === 'duration' && typeof value === 'number') this.length = value;
    else if (name === 'dwidth' && typeof value === 'number') this.width = value;
    else if (name === 'dheight' && typeof value === 'number') this.height = value;
    else if (name === 'pause' && typeof value === 'boolean') {
      if (value === this.isPaused) return;
      this.isPaused = value;
      if (value) this.emit('pause'); else { this.emit('play'); this.emit('playing'); }
    } else if (name === 'eof-reached' && value === true && !this.looping) {
      this.isEnded = true;
      if (Number.isFinite(this.length)) this.time = this.length;
      this.emit('timeupdate'); this.emit('ended');
    } else if (name === 'paused-for-cache') this.emit(value ? 'waiting' : 'playing');
  }

  get currentTime() { return this.seekingTo ?? this.time; }
  set currentTime(value: number) {
    const target = Math.max(0, Number(value) || 0);
    this.seekingTo = target; this.time = target; this.isEnded = false;
    void this.bridge.command('seek', [target, 'absolute+exact']).catch(() => { this.seekingTo = null; });
  }
  get duration() { return this.length; }
  get paused() { return this.isPaused; }
  get ended() { return this.isEnded; }
  get seeking() { return this.seekingTo !== null; }
  get readyState() { return this.ready; }
  get videoWidth() { return this.width; }
  get videoHeight() { return this.height; }
  get playbackRate() { return this.rate; }
  set playbackRate(value: number) { this.rate = value; void this.bridge.set('speed', value); }
  get volume() { return this.level; }
  set volume(value: number) { this.level = value; void this.bridge.set('volume', Math.round(Math.max(0, Math.min(1, value)) * 100)); }
  get muted() { return this.silent; }
  set muted(value: boolean) { this.silent = value; void this.bridge.set('mute', value); }
  get loop() { return this.looping; }
  set loop(value: boolean) { if (value === this.looping) return; this.looping = value; void this.bridge.set('loop-file', value ? 'inf' : 'no'); }

  play() {
    // At the end, playing starts over like a <video> element does.
    if (this.isEnded) this.currentTime = 0;
    this.isEnded = false;
    return this.bridge.set('pause', false);
  }
  pause() { void this.bridge.set('pause', true); }
  removeAttribute() { /* Matches <video>.removeAttribute('src') used when closing. */ }
  load() { /* <video>.load() resets the element; mpv has nothing to reset. */ }

  /** Subtitles: WebVTT text shown by mpv, or null to remove them. */
  async setSubtitle(text: string | null, visible: boolean) {
    await this.bridge.command('sub-remove', []).catch(() => {});
    if (text) await this.bridge.command('sub-add', [`memory://${text}`, 'select']).catch(() => {});
    await this.bridge.set('sub-visibility', visible && !!text).catch(() => {});
  }

  dispose() { this.off(); void this.bridge.stop(); }
}
