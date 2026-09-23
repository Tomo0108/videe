const { readdir } = require('node:fs/promises');
const { basename, extname, join, relative } = require('node:path');

const VIDEO_EXT = new Set(['mp4','m4v','mov','qt','webm','mkv','avi','divx','wmv','asf','flv','f4v','mpeg','mpg','m2ts','mts','ts','3gp','3g2','ogv','vob','mxf','dv','hevc','av1','rm','rmvb']);

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

function folderGroupName(root, filePath) {
  const parts = relative(root, filePath).split(/[/\\]/).filter(Boolean);
  if (parts.length <= 1) return basename(root);
  return parts[0];
}

module.exports = { collectVideoPaths, VIDEO_EXT, folderGroupName };
