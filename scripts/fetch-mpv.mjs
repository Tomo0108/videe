// Downloads the LGPL build of libmpv for Windows x64 into vendor/mpv (bundled as resources/mpv).
// Source: https://github.com/zhongfly/mpv-winbuild (libmpv under LGPLv2.1+, FFmpeg under LGPLv3).
// Uses the latest release unless MPV_RELEASE names a tag. Needs 7-Zip or Windows' built-in tar. Set GITHUB_TOKEN to avoid API rate limits.
import { mkdir, readdir, rm, writeFile, copyFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const target = resolve('vendor/mpv');
const repo = 'zhongfly/mpv-winbuild';
const headers = { 'User-Agent': 'videe-build', Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
try { await stat(join(target, 'libmpv-2.dll')); if (!process.argv.includes('--force')) { console.log('libmpv already in vendor/mpv'); process.exit(0); } } catch { /* Download it. */ }
const tag = process.env.MPV_RELEASE;
const release = await (await fetch(`https://api.github.com/repos/${repo}/releases/${tag ? `tags/${tag}` : 'latest'}`, { headers })).json();
const asset = (release.assets || []).find(a => /^mpv-dev-lgpl-x86_64-\d.*\.7z$/.test(a.name));
if (!asset) throw new Error(`No LGPL x86_64 libmpv in ${repo} ${release.tag_name || tag || 'latest'}: ${(release.assets || []).map(a => a.name).join(', ') || release.message}`);
console.log(`Downloading ${asset.name} (${release.tag_name})`);
const work = join(tmpdir(), `videe-mpv-${Date.now()}`);
await mkdir(work, { recursive: true });
const archive = join(work, asset.name);
const response = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'videe-build' } });
if (!response.ok) throw new Error(`Download failed: ${response.status}`);
await writeFile(archive, Buffer.from(await response.arrayBuffer()));
// 7-Zip if installed, otherwise the tar that ships with Windows 10+ (bsdtar reads .7z).
try { execFileSync('7z', ['x', '-y', `-o${work}`, archive], { stdio: 'ignore' }); }
catch { execFileSync('tar', ['-xf', archive, '-C', work], { stdio: 'ignore' }); }
const dll = (await readdir(work, { recursive: true })).find(name => /(^|[\\/])libmpv-2\.dll$/.test(name));
if (!dll) throw new Error('libmpv-2.dll not found in the archive');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await copyFile(join(work, dll), join(target, 'libmpv-2.dll'));
await writeFile(join(target, 'README.txt'), `libmpv ${release.tag_name} (${asset.name}) from https://github.com/${repo}\nLicensed under the GNU LGPL v2.1 or later; FFmpeg inside is under the GNU LGPL v3.\nSource code: https://github.com/mpv-player/mpv and https://github.com/${repo}\nYou may replace libmpv-2.dll with your own build of libmpv.\n`);
await rm(work, { recursive: true, force: true });
console.log('libmpv ready in vendor/mpv');
