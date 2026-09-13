import { copyFileSync, renameSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isPlayerHtml } from './html-kind.mjs';

if (isPlayerHtml('dist/index.html')) {
  renameSync('dist/index.html', 'dist/app.html');
  copyFileSync('dist/site.html', 'dist/index.html');
} else if (!isPlayerHtml('dist/app.html')) {
  throw new Error('Videe player HTML was not in dist/index.html or dist/app.html');
}
const altstore = spawnSync(process.execPath, ['scripts/write-altstore.mjs', 'dist/altstore.json'], { stdio: 'inherit' });
if (altstore.status !== 0) throw new Error('Could not refresh AltStore source');
