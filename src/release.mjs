export const RELEASE_REPO = 'Tomo0108/videe';
export const RELEASE_VERSION = '0.1.1';
/** @param {string} [version] */
export function artifactNames(version = RELEASE_VERSION) {
  return {
    mac: `Videe-${version}-mac-arm64.dmg`,
    win: `Videe-${version}-win-setup.exe`,
    ios: `Videe-${version}-ios.ipa`,
  };
}
/** @param {string} name */
export function latestDownloadUrl(name) {
  return `https://github.com/${RELEASE_REPO}/releases/latest/download/${name}`;
}
export const RELEASES_PAGE = `https://github.com/${RELEASE_REPO}/releases/latest`;
export const RELEASES_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
