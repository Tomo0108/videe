import { RELEASE_REPO } from './release.mjs';

export const SITE_ORIGIN = 'https://videe-zeta.vercel.app';
export const ALTSTORE_JSON = `${SITE_ORIGIN}/altstore.json`;
export const ALTSTORE_ADD = `altstore://source?url=${encodeURIComponent(ALTSTORE_JSON)}`;

const NOTES = {
  '0.1.6': 'Smoother 4K playback, direct file import, and broader video-format support.',
  '0.1.5': 'Bulk library removal, nested folder import, and deleting a folder also removes its videos.',
  '0.1.4': 'Sortable library lists with duration and size, per-folder order, and an info button for file details.',
  '0.1.3': 'Embedded subtitles, folder deletion, and a full-screen player that fills 4K displays.',
  '0.1.2': 'Folders, loop ranges, segment removal, and a calmer library.',
  '0.1.1': 'UI cleanup and library tools.',
  '0.1.0': 'First sideload build.',
};

export function versionNote(version, fallback = '') {
  return NOTES[version] || fallback || `Videe ${version}`;
}

export function githubReleaseNotes(version) {
  return `${versionNote(version)}

Native Videe builds for Mac, Windows, and iOS sideload.

The web player copies videos into browser storage. These apps open local files instead.

macOS is unsigned: Control-click Open. Windows may show SmartScreen. iOS IPA is for AltStore or Sideloadly.`;
}

export function ipaDownloadUrl(version) {
  return `https://github.com/${RELEASE_REPO}/releases/download/v${version}/Videe-${version}-ios.ipa`;
}

export function altstoreSource({ sourceURL = ALTSTORE_JSON, iconURL = `${SITE_ORIGIN}/icons/icon-512.png`, versions }) {
  const latest = versions[0];
  if (!latest?.version || !latest.downloadURL || !Number.isInteger(latest.size) || latest.size <= 0) {
    throw new Error('AltStore versions need version, downloadURL, and size in bytes.');
  }
  return {
    name: 'Videe',
    identifier: 'app.videe.source',
    sourceURL,
    apps: [{
      name: 'Videe',
      bundleIdentifier: 'app.videe.player',
      developerName: 'Videe',
      subtitle: 'A local video player',
      localizedDescription: 'Play videos that already live on this device. Install with AltStore, Sideloadly, or Finder.',
      iconURL,
      tintColor: '1F5FD0',
      category: 'entertainment',
      appPermissions: {},
      version: latest.version,
      versionDate: latest.date,
      versionDescription: latest.localizedDescription,
      downloadURL: latest.downloadURL,
      size: latest.size,
      versions,
    }],
  };
}

export function versionsFromReleases(releases) {
  return releases.flatMap(release => {
    const version = String(release.tag_name || '').replace(/^v/, '');
    const ipa = (release.assets || []).find(asset => /\.ipa$/i.test(asset.name));
    if (!version || !ipa?.browser_download_url || !ipa.size) return [];
    const sha = String(ipa.digest || '').replace(/^sha256:/, '');
    return [{
      version,
      date: release.published_at || new Date().toISOString(),
      localizedDescription: versionNote(version, release.name || ''),
      downloadURL: ipa.browser_download_url,
      size: ipa.size,
      minOSVersion: '15.0',
      ...(sha ? { sha256: sha } : {}),
    }];
  });
}
