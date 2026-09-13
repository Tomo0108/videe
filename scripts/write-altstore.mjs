import { writeFileSync } from 'node:fs';
import { altstoreSource, ipaDownloadUrl, versionNote, versionsFromReleases } from '../src/altstore.mjs';
import { RELEASE_REPO } from '../src/release.mjs';

const dest = process.argv[2] || 'public/altstore.json';
const fallback = altstoreSource({
  versions: [
    { version: '0.1.5', date: '2026-09-13T15:56:21Z', localizedDescription: versionNote('0.1.5'), downloadURL: ipaDownloadUrl('0.1.5'), size: 10980884, minOSVersion: '15.0', sha256: '803ade0d329ab4d0b8ad1b9d094238f3aa34eb282b3cdbfd9584ffb363a1b29b' },
    { version: '0.1.4', date: '2026-09-13T15:04:20Z', localizedDescription: versionNote('0.1.4'), downloadURL: ipaDownloadUrl('0.1.4'), size: 10980085, minOSVersion: '15.0', sha256: 'e96a6b7938d018ceb380656fbdbeaa051a28785941a5121c402b3bbbf5d925fc' },
    { version: '0.1.3', date: '2026-09-13T13:20:26Z', localizedDescription: versionNote('0.1.3'), downloadURL: ipaDownloadUrl('0.1.3'), size: 10977968, minOSVersion: '15.0', sha256: '32e68f1945378e686de187ed424a0e6d3ea921bf1551a8cd5728078b73d5e9a2' },
    { version: '0.1.2', date: '2026-09-13T04:48:04Z', localizedDescription: versionNote('0.1.2'), downloadURL: ipaDownloadUrl('0.1.2'), size: 10976528, minOSVersion: '15.0', sha256: '82942f6960bd4533bedd4f75daae40825038702bd35179325142858b85c643f9' },
    { version: '0.1.1', date: '2026-09-12T09:14:43Z', localizedDescription: versionNote('0.1.1'), downloadURL: ipaDownloadUrl('0.1.1'), size: 10970793, minOSVersion: '15.0', sha256: '05169dc5cddd81c1370a1eb25f2585572ba0c8983bae40549eaeda44a9048d67' },
    { version: '0.1.0', date: '2026-09-09T00:00:00Z', localizedDescription: versionNote('0.1.0'), downloadURL: ipaDownloadUrl('0.1.0'), size: 10970743, minOSVersion: '15.0', sha256: 'bcc1ed1f898cf22499e3a0c3ade5107c2ff840fe7f972a028ee6262096ea4372' },
  ],
});

let source = fallback;
try {
  const response = await fetch(`https://api.github.com/repos/${RELEASE_REPO}/releases`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'videe-altstore' } });
  if (response.ok) {
    const versions = versionsFromReleases(await response.json());
    if (versions.length) source = altstoreSource({ versions });
  }
} catch { /* Keep the last known sizes if GitHub is unreachable. */ }

writeFileSync(dest, JSON.stringify(source, null, 2) + '\n');
console.log(`Wrote ${dest} (${source.apps[0].versions.length} iOS versions)`);
