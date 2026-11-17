import { RELEASE_REPO, iosBuildNumber } from './release.mjs';

export const SITE_ORIGIN = 'https://videe-zeta.vercel.app';
export const ALTSTORE_JSON = `${SITE_ORIGIN}/altstore.json`;
export const ALTSTORE_ADD = `altstore://source?url=${encodeURIComponent(ALTSTORE_JSON)}`;

// The source targets AltStore Classic: downloadURL points straight at the .ipa (AltStore PAL would need a
// notarized ADP and a marketplaceID instead).
// AltStore checks every install against the source: the IPA's version must match, and its permissions must
// match appPermissions exactly. Keep IOS_PRIVACY in step with the UsageDescription keys in ios/App/App/Info.plist.
export const IOS_PRIVACY = {
  NSPhotoLibraryUsageDescription: '選んだ動画を Videe で開くために、写真ライブラリにアクセスします。',
  NSDocumentsFolderUsageDescription: 'このデバイスに保存された動画ファイルを Videe で開くために使います。',
};
// IPAs before 0.1.23 were all built with the version 0.1.5 inside, so AltStore would reject them.
export const FIRST_ALTSTORE_VERSION = '0.1.23';

function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}

const NOTES = {
  '0.1.32': 'On Windows, the title bar is gone: the minimize, maximize and close buttons now sit in the top-right corner of the app'"'"'s own header, so the icon and name no longer appear twice.',
  '0.1.31': 'MKV and other videos whose picture the app can decode (HEVC, H.264, AV1, VP9) now play in the built-in player at their original quality: repackaged as they play, never re-encoded, with exact seeking and nothing written to disk. On Windows this removes the stutter and tearing lines; the mpv engine is kept only for older formats such as MPEG-2 and VC-1.',
  '0.1.30': 'On Windows, MKV and other videos playing with the built-in mpv engine are smooth again, with no stutter and no tearing lines.',
  '0.1.29': 'On Windows, fast motion and scene changes in videos playing with the built-in mpv engine no longer tear.',
  '0.1.28': 'On Windows, interlaced videos (TV and camcorder recordings) playing with the built-in mpv engine are deinterlaced, so they no longer flicker.',
  '0.1.27': 'On Windows, video playing with the built-in mpv engine no longer flickers.',
  '0.1.26': 'On Windows, the control bar over a video playing with the built-in mpv engine is frosted glass over the picture again, with rounded corners that match.',
  '0.1.25': 'On Windows, full screen with the built-in mpv engine fills the whole screen again, and showing the controls no longer resizes the video.',
  '0.1.24': 'On Windows, MKV, AVI and other formats play right away with a built-in mpv engine, with no conversion and nothing written to disk. On Mac they play through live conversion with no preparing step.',
  '0.1.23': 'Installs again from AltStore Classic: the iOS app now carries its real version number, and the AltStore source lists the photo and file permissions it uses.',
  '0.1.22': 'Release pages now include an illustrated quick guide for Mac, Windows, and iPhone / iPad, and the in-app guide has an iPhone / iPad edition.',
  '0.1.21': 'The empty library is now just the two buttons for choosing videos or a folder.',
  '0.1.20': 'Flatter buttons and icons with no glows or blurred backdrops, and a simpler empty library.',
  '0.1.19': 'Cleaner icons without the glow, and the empty library buttons now read simply "Choose videos" and "Choose a folder".',
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
      appPermissions: { entitlements: [], privacy: { ...IOS_PRIVACY } },
      version: latest.version,
      ...(latest.buildVersion ? { buildVersion: latest.buildVersion } : {}),
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
    if (release.draft || release.prerelease || compareVersions(version, FIRST_ALTSTORE_VERSION) < 0) return [];
    const sha = String(ipa.digest || '').replace(/^sha256:/, '');
    return [{
      version,
      buildVersion: iosBuildNumber(version),
      date: release.published_at || new Date().toISOString(),
      localizedDescription: versionNote(version, release.name || ''),
      downloadURL: ipa.browser_download_url,
      size: ipa.size,
      minOSVersion: '15.0',
      ...(sha ? { sha256: sha } : {}),
    }];
  }).sort((a, b) => compareVersions(b.version, a.version));
}
