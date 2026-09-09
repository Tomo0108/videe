import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command }) => ({
  plugins: [react(), { name: 'production-csp', transformIndexHtml() { return command === 'build' ? [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob: videe:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; worker-src 'self'; manifest-src 'self'" }, injectTo: 'head' as const }] : []; } }],
  base: './', server: { port: 5173, strictPort: true }
}));
