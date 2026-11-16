// Embedded mpv playback engine (Windows).
//
// libmpv-2.dll (an LGPL build, bundled under resources/mpv) runs in its own process
// (mpv-host.cjs), so a decoder crash can't take Videe down. mpv draws into a borderless child
// window that Videe places over the player area of the page; the page keeps drawing its own
// controls and reports where the video area is. Playback is controlled over mpv's JSON IPC
// (a named pipe).
//
// On Linux the engine can be turned on for tests with VIDEE_MPV=1 and VIDEE_MPV_NODE=<node>
// (system libmpv, no picture or sound), which is enough to test the control path.
const { screen } = require('electron');
const { join } = require('node:path');
const { existsSync } = require('node:fs');
const net = require('node:net');
const { spawn } = require('node:child_process');

const PROPERTIES = ['time-pos', 'duration', 'pause', 'eof-reached', 'dwidth', 'dheight', 'paused-for-cache', 'seeking', 'idle-active'];
const SETTABLE = new Set(['pause', 'speed', 'volume', 'mute', 'loop-file', 'sub-visibility', 'sid', 'aid', 'hwdec', 'video-zoom', 'video-pan-x', 'video-pan-y']);
const COMMANDS = new Set(['seek', 'sub-add', 'sub-remove', 'stop', 'frame-step', 'frame-back-step']);

function libraryPath() {
  if (process.platform === 'win32') {
    const candidates = [join(process.resourcesPath || '', 'mpv', 'libmpv-2.dll'), join(__dirname, '..', 'vendor', 'mpv', 'libmpv-2.dll')];
    return candidates.find(file => existsSync(file)) || '';
  }
  if (process.platform === 'linux' && process.env.VIDEE_MPV === '1') return 'libmpv.so.2';
  return '';
}

let koffi;
function loadKoffi() { return (koffi ||= require('koffi')); }

/** Win32 child window that mpv renders into. */
class ChildWindow {
  constructor(parentHandle) {
    const user32 = loadKoffi().load('user32.dll');
    // Window handles are passed as plain integers.
    this.create = user32.func('CreateWindowExW', 'intptr_t', ['uint32', 'str16', 'str16', 'uint32', 'int', 'int', 'int', 'int', 'intptr_t', 'intptr_t', 'intptr_t', 'intptr_t']);
    this.setPos = user32.func('SetWindowPos', 'bool', ['intptr_t', 'intptr_t', 'int', 'int', 'int', 'int', 'uint32']);
    this.destroyWindow = user32.func('DestroyWindow', 'bool', ['intptr_t']);
    this.setRegion = user32.func('SetWindowRgn', 'int', ['intptr_t', 'intptr_t', 'bool']);
    const gdi32 = loadKoffi().load('gdi32.dll');
    this.rectRegion = gdi32.func('CreateRectRgn', 'intptr_t', ['int', 'int', 'int', 'int']);
    this.combineRegion = gdi32.func('CombineRgn', 'int', ['intptr_t', 'intptr_t', 'intptr_t', 'int']);
    this.deleteObject = gdi32.func('DeleteObject', 'bool', ['intptr_t']);
    this.regionKey = '';
    // WS_CHILD | WS_CLIPSIBLINGS | SS_BLACKRECT. A STATIC control without SS_NOTIFY lets mouse
    // input fall through to the page underneath, so clicks and the cursor keep working.
    this.hwnd = this.create(0, 'STATIC', '', 0x40000000 | 0x04000000 | 0x4, 0, 0, 1, 1, parentHandle, 0, 0, 0);
    if (!this.hwnd) throw new Error('Could not create the video window.');
    this.visible = false;
  }
  get id() { return String(this.hwnd); }
  place(rect) {
    // SWP_NOACTIVATE | SWP_NOOWNERZORDER, plus SWP_SHOWWINDOW or SWP_HIDEWINDOW. HWND_TOP keeps it above the page.
    if (!rect) { if (this.visible) this.setPos(this.hwnd, 0, 0, 0, 0, 0, 0x10 | 0x200 | 0x80 | 0x1 | 0x2); this.visible = false; return; }
    this.setPos(this.hwnd, 0, rect.x, rect.y, Math.max(1, rect.width), Math.max(1, rect.height), 0x10 | 0x200 | 0x40);
    this.visible = true;
    this.cut(rect.holes || []);
  }
  /** Cuts the page's bars (controls, header) out of the window, so they show over the video without resizing it. */
  cut(holes) {
    const key = holes.map(h => `${h.x},${h.y},${h.width},${h.height}`).join(';');
    if (key === this.regionKey) return;
    this.regionKey = key;
    if (!holes.length) { this.setRegion(this.hwnd, 0, true); return; }
    const region = this.rectRegion(-1, -1, 100000, 100000);
    for (const h of holes) {
      const hole = this.rectRegion(h.x, h.y, h.x + h.width, h.y + h.height);
      this.combineRegion(region, region, hole, 4); // RGN_DIFF
      this.deleteObject(hole);
    }
    // The window owns the region from here on.
    this.setRegion(this.hwnd, region, true);
  }
  destroy() { try { this.destroyWindow(this.hwnd); } catch { /* Already gone with the window. */ } }
}

class MpvEngine {
  constructor(win, send) {
    this.win = win; this.send = send;
    this.requests = new Map(); this.nextRequest = 1;
    this.lastTime = 0; this.timer = undefined; this.pendingTime = null;
  }
  static available() { return !!libraryPath(); }

  async start() {
    let wid = '';
    if (process.platform === 'win32') {
      const handle = this.win.getNativeWindowHandle();
      this.child = new ChildWindow(handle.length >= 8 ? handle.readBigInt64LE(0) : BigInt(handle.readInt32LE(0)));
      wid = this.child.id;
    }
    const name = `videe-mpv-${process.pid}-${Date.now()}`;
    this.pipe = process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(require('node:os').tmpdir(), `${name}.sock`);
    const options = {
      wid, 'input-ipc-server': this.pipe,
      config: 'no', 'load-scripts': 'no', ytdl: 'no', osc: 'no', 'osd-level': '0', terminal: 'no',
      'input-default-bindings': 'no', 'input-vo-keyboard': 'no', 'input-cursor': 'no', 'input-cursor-passthrough': 'yes', 'cursor-autohide': 'no',
      'keep-open': 'yes', idle: 'yes', 'force-window': 'no', 'audio-display': 'no', 'sub-auto': 'no', 'save-position-on-quit': 'no',
      hwdec: 'auto-safe', vo: 'gpu-next', background: 'color', 'background-color': '#000000',
      'hr-seek': 'yes', 'demuxer-max-bytes': '150MiB', 'sub-visibility': 'no',
    };
    // Tests on Linux run mpv without a picture or sound; only the control path is checked there.
    if (process.platform !== 'win32') Object.assign(options, { vo: 'null', ao: 'null', hwdec: 'no' });
    for (const key of Object.keys(options)) if (options[key] === '') delete options[key];
    // Electron runs the host as plain Node. Linux tests use a separate Node (VIDEE_MPV_NODE), since
    // there libmpv's FFmpeg would clash with the one Electron loads.
    const runtime = process.env.VIDEE_MPV_NODE || process.execPath;
    const host = spawn(runtime, [join(__dirname, 'mpv-host.cjs')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });
    this.host = host;
    const ready = new Promise((resolve, reject) => {
      let text = '';
      host.stderr.setEncoding('utf8');
      host.stderr.on('data', chunk => { text = (text + chunk).slice(-4000); if (/^ready$/m.test(text)) resolve(); else if (/^failed/m.test(text)) reject(new Error('Could not start the playback engine.')); });
      host.once('error', () => reject(new Error('Could not start the playback engine.')));
      host.once('exit', () => reject(new Error('Could not start the playback engine.')));
    });
    host.on('exit', () => { if (this.host === host) this.host = undefined; if (!this.closing) { this.send({ type: 'error', message: 'Playback engine stopped.' }); this.onExit?.(); } });
    host.stdin.on('error', () => {});
    host.stdin.write(JSON.stringify({ library: libraryPath(), options }) + '\n');
    await ready;
    await this.connect();
    for (const [index, property] of PROPERTIES.entries()) this.raw(['observe_property', index + 1, property]).catch(() => {});
  }

  async connect() {
    for (let attempt = 0; attempt < 75 && !this.socket; attempt++) {
      try {
        this.socket = await new Promise((resolve, reject) => {
          const socket = net.connect(this.pipe);
          socket.once('connect', () => resolve(socket));
          socket.once('error', reject);
        });
      } catch { await new Promise(resolve => setTimeout(resolve, 40)); }
    }
    if (!this.socket) throw new Error('Could not start the playback engine.');
    let buffer = '';
    this.socket.setEncoding('utf8');
    this.socket.on('data', chunk => {
      buffer += chunk;
      let line;
      while ((line = buffer.indexOf('\n')) >= 0) {
        const text = buffer.slice(0, line); buffer = buffer.slice(line + 1);
        if (!text.trim()) continue;
        try { this.message(JSON.parse(text)); } catch { /* Ignore malformed lines. */ }
      }
    });
    this.socket.on('error', () => {});
  }

  raw(command) {
    const request_id = this.nextRequest++;
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) { reject(new Error('Playback engine stopped.')); return; }
      this.requests.set(request_id, { resolve, reject });
      this.socket.write(JSON.stringify({ command, request_id }) + '\n');
    });
  }

  message(msg) {
    if (msg.request_id && this.requests.has(msg.request_id)) {
      const { resolve, reject } = this.requests.get(msg.request_id); this.requests.delete(msg.request_id);
      if (msg.error === 'success') resolve(msg.data); else reject(new Error(msg.error || 'mpv error'));
      return;
    }
    if (msg.event === 'property-change') {
      // Position updates are sent at most every 100 ms; everything else goes out at once.
      if (msg.name === 'time-pos') { if (typeof msg.data === 'number') { this.pendingTime = msg.data; this.flushTime(); } return; }
      this.send({ type: 'property', name: msg.name, value: msg.data ?? null });
      return;
    }
    if (msg.event === 'file-loaded') { void this.announceLoaded(); return; }
    if (msg.event === 'end-file') { if (msg.reason === 'error') this.send({ type: 'error', message: msg.file_error || 'Could not open this video.' }); return; }
    if (msg.event === 'playback-restart') this.send({ type: 'restart' });
  }

  flushTime() {
    if (this.timer) return;
    const wait = Math.max(0, 100 - (Date.now() - this.lastTime));
    this.timer = setTimeout(() => {
      this.timer = undefined; this.lastTime = Date.now();
      if (this.pendingTime !== null) { this.send({ type: 'property', name: 'time-pos', value: this.pendingTime }); this.pendingTime = null; }
    }, wait);
  }

  async announceLoaded() {
    const get = property => this.raw(['get_property', property]).catch(() => null);
    const [duration, width, height] = await Promise.all([get('duration'), get('width'), get('height')]);
    this.send({ type: 'loaded', duration: Number(duration) || 0, width: Number(width) || 0, height: Number(height) || 0 });
  }

  async open(file, { volume = 1, speed = 1, muted = false } = {}) {
    await this.raw(['set_property', 'pause', true]);
    await this.raw(['set_property', 'volume', Math.round(Math.max(0, Math.min(1, Number(volume) || 0)) * 100)]);
    await this.raw(['set_property', 'speed', Number(speed) || 1]);
    await this.raw(['set_property', 'mute', !!muted]);
    await this.raw(['loadfile', file, 'replace']);
  }

  set(property, value) {
    if (!SETTABLE.has(property) || !['string', 'number', 'boolean'].includes(typeof value)) throw new Error('Unsupported setting.');
    return this.raw(['set_property', property, value]);
  }

  command(name, args) {
    if (!COMMANDS.has(name) || !Array.isArray(args) || args.length > 4 || args.some(arg => !['string', 'number'].includes(typeof arg))) throw new Error('Unsupported command.');
    return this.raw([name, ...args.map(String)]);
  }

  /** `rect` is in CSS pixels of the page; null hides the video. */
  place(rect) {
    if (!this.child) return;
    if (!rect || this.win.isDestroyed()) { this.child.place(null); return; }
    const scale = this.win.webContents.getZoomFactor() * screen.getDisplayMatching(this.win.getBounds()).scaleFactor;
    const px = box => ({ x: Math.round(box.x * scale), y: Math.round(box.y * scale), width: Math.round(box.width * scale), height: Math.round(box.height * scale) });
    this.child.place({ ...px(rect), holes: (rect.holes || []).map(px) });
  }

  async stop() {
    this.child?.place(null);
    await this.raw(['stop']).catch(() => {});
  }

  destroy() {
    this.closing = true;
    clearTimeout(this.timer);
    for (const { reject } of this.requests.values()) reject(new Error('Playback engine stopped.'));
    this.requests.clear();
    try { this.socket?.destroy(); } catch { /* Ignore. */ }
    const host = this.host;
    if (host) { try { host.stdin.end(); } catch { /* Ignore. */ } setTimeout(() => { if (host.exitCode === null) host.kill(); }, 3000).unref(); }
    this.child?.destroy(); this.child = undefined;
  }
}

module.exports = { MpvEngine, libraryPath };
