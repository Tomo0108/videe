import { existsSync, readFileSync } from 'node:fs';

/** @param {string} file */
export function isPlayerHtml(file) {
  if (!existsSync(file)) return false;
  const html = readFileSync(file, 'utf8');
  return html.includes('/src/main.tsx') || /assets\/main-/.test(html);
}
