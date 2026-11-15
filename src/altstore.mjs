import { RELEASE_REPO } from './release.mjs';

export const SITE_ORIGIN = 'https://videe-zeta.vercel.app';
export const ALTSTORE_JSON = `${SITE_ORIGIN}/altstore.json`;
export const ALTSTORE_ADD = `altstore://source?url=${encodeURIComponent(ALTSTORE_JSON)}`;

const NOTES = {
  '0.1.18': 'A richer look throughout: poster-style cards that lift on hover, a darkened screening room with a frosted control bar and accent seek bar while watching, a Video info sheet with the artwork up top, a friendlier empty library, deeper light and dark themes, and bottom sheets on phones.',
  '0.1.17': 'The library opens in grid view, the player zooms into the picture in steps from the controls, and each video has an Info button that gathers play, favorite, move and remove in one place.',
  '0.1.16': 'Videe now speaks Japanese: every screen, menu, dialog, message, the tour and the quick guide are in Japanese by default, and English is one switch away in Settings → Display → Language.',
  '0.1.15': 'Player controls fade out sooner and as soon as the cursor leaves the player or the window.',
  '0.1.14': 'The quick guide gains a side panel that lists every step and follows along as you read, and its close button works again in the Mac app.',
  '0.1.13': 'Faster loading: previews are made in parallel with fewer ffmpeg runs, and large folders import more quickly.',
  '0.1.12': 'A cleaner library: only titles appear under videos, and Video info gathers duration, size, format, progress, folder and more on tidy one-line rows. Long names no longer break menus or the phone layout, and subtitles start off with Japanese tracks chosen first.',
  '0.1.11': 'The Mac app opens again: it is now signed so macOS no longer reports it as damaged. Only the open button you pressed shows a spinner while videos import.',
  '0.1.10': 'An illustrated quick guide for Windows and Mac (Help button, F1 or ⌘?) and a short first-launch tour of the key settings. Scrubbing in smooth playback no longer errors, smooth playback is remembered per video, and library menus behave better.',
  '0.1.9': 'Set Videe as the default app for videos: files opened from Finder, Explorer or the Files app now load and play right away, whether Videe is running or not.',
  '0.1.8': 'Smooth playback for any codec with live conversion like VLC, a pro editor with a frame-accurate timeline and export, and a redesigned library with folders, playlists and drag and drop.',
  '0.1.7': 'Smoother MP4 playback with lightweight progress saves, plus a persistent mini player that continues across the library.',
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
