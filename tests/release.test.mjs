import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactNames, latestDownloadUrl, RELEASE_VERSION } from '../src/release.mjs';
test('release artifact names stay stable for GitHub latest download URLs', () => {
  const names = artifactNames('0.1.0');
  assert.equal(names.mac, 'Videe-0.1.0-mac-arm64.dmg');
  assert.equal(names.win, 'Videe-0.1.0-win-setup.exe');
  assert.equal(names.ios, 'Videe-0.1.0-ios.ipa');
  assert.match(latestDownloadUrl(names.mac), /releases\/latest\/download\/Videe-0\.1\.0-mac-arm64\.dmg$/);
  assert.equal(artifactNames().mac.includes(RELEASE_VERSION), true);
});
