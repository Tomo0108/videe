import { copyFileSync, renameSync } from 'node:fs';
renameSync('dist/index.html', 'dist/app.html');
copyFileSync('dist/site.html', 'dist/index.html');
