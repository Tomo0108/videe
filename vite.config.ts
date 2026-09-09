import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
export default defineConfig(({ command }) => ({
  plugins: [tailwindcss(), react(), { name: 'production-csp', transformIndexHtml(_html, ctx) {
    if (command !== 'build') return [];
    const site = ctx.filename.endsWith('site.html');
    const connect = site ? "'self' https://api.github.com" : "'self'";
    return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: videe:; connect-src ${connect}; font-src 'self'; object-src 'none'; base-uri 'self'; worker-src 'self'; manifest-src 'self'` }, injectTo: 'head' as const }];
  } }],
  resolve: { alias: { '@': resolve('src') } },
  base: './',
  server: { port: 5173, strictPort: true },
  build: { rollupOptions: { input: { main: resolve('index.html'), site: resolve('site.html') } } }
}));
