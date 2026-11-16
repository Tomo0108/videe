// Runs libmpv in its own process (Electron started as plain Node), so a crash in a video decoder
// can't take the player down with it. The parent sends one line of JSON with the library path and
// options; mpv is then controlled by the parent over mpv's IPC pipe. Closing stdin shuts mpv down.
const koffi = require('koffi');
let ctx, api, input = '';
function shutdown(code = 0) {
  if (ctx) { try { api.destroy(ctx); } catch { /* Exiting anyway. */ } ctx = null; }
  process.exit(code);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (ctx) return;
  input += chunk;
  const end = input.indexOf('\n');
  if (end < 0) return;
  try {
    const { library, options } = JSON.parse(input.slice(0, end));
    const lib = koffi.load(library);
    api = {
      create: lib.func('void *mpv_create()'),
      setOption: lib.func('int mpv_set_option_string(void *ctx, const char *name, const char *data)'),
      initialize: lib.func('int mpv_initialize(void *ctx)'),
      requestEvent: lib.func('int mpv_request_event(void *ctx, int event, int enable)'),
      destroy: lib.func('void mpv_terminate_destroy(void *ctx)'),
    };
    ctx = api.create();
    if (!ctx) throw new Error('mpv_create failed');
    for (const [name, value] of Object.entries(options)) api.setOption(ctx, name, String(value));
    // Events go through the IPC pipe; the client queue would only fill up.
    for (let event = 1; event < 32; event++) api.requestEvent(ctx, event, 0);
    if (api.initialize(ctx) < 0) throw new Error('mpv_initialize failed');
    process.stderr.write('ready\n');
  } catch (error) {
    process.stderr.write(`failed ${error instanceof Error ? error.message : error}\n`);
    shutdown(1);
  }
});
process.stdin.on('end', () => shutdown(0));
process.on('disconnect', () => shutdown(0));
// Keep the process alive while mpv runs on its own threads.
setInterval(() => {}, 1 << 30);
