import { copyFileSync } from 'node:fs';
import { isPlayerHtml } from './html-kind.mjs';

if (!isPlayerHtml('dist/index.html')) {
  if (!isPlayerHtml('dist/app.html')) throw new Error('Videe player HTML was not in dist');
  copyFileSync('dist/app.html', 'dist/index.html');
}
