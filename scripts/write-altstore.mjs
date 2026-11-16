import { writeFileSync } from 'node:fs';
import { altstoreSource, ipaDownloadUrl, versionNote, versionsFromReleases } from '../src/altstore.mjs';
import { RELEASE_REPO } from '../src/release.mjs';

const dest = process.argv[2] || 'public/altstore.json';
// Used only until a release from FIRST_ALTSTORE_VERSION on exists, or when GitHub is unreachable.
// The 0.1.5 IPA really is 0.1.5 inside, so AltStore accepts it.
const fallback = altstoreSource({
  versions: [
    { version: '0.1.5', date: '2026-09-13T15:56:21Z', localizedDescription: versionNote('0.1.5'), downloadURL: ipaDownloadUrl('0.1.5'), size: 10980884, minOSVersion: '15.0', sha256: '803ade0d329ab4d0b8ad1b9d094238f3aa34eb282b3cdbfd9584ffb363a1b29b' },
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
