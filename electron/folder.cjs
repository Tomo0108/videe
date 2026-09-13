const { readdir } = require('node:fs/promises');
const { join, extname } = require('node:path');

const VIDEO_EXT = new Set(['mp4','m4v','mov','webm','mkv','avi','wmv','flv','mpeg','mpg','m2ts','mts','ts','3gp','ogv','vob','mxf','hevc','av1']);

async function collectVideoPaths(root, { maxFiles = 1000, maxDepth = 8 } = {}) {
  const acc = [];
  async function walk(dir, depth) {
    if (acc.length >= maxFiles || depth > maxDepth) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (acc.length >= maxFiles) return;
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.isFile() && VIDEO_EXT.has(extname(entry.name).slice(1).toLowerCase())) acc.push(full);
    }
  }
  await walk(root, 0);
  return acc;
}

module.exports = { collectVideoPaths, VIDEO_EXT };
