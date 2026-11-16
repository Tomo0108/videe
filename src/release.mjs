export const RELEASE_REPO = 'Tomo0108/videe';
export const RELEASE_VERSION = '0.1.25';
/** CFBundleVersion for an iOS build: 0.1.23 → 123. AltStore compares it with the source's buildVersion. */
export function iosBuildNumber(version = RELEASE_VERSION) {
  const [major = 0, minor = 0, patch = 0] = String(version).split('.').map(Number);
  return String(major * 10000 + minor * 100 + patch);
}
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
