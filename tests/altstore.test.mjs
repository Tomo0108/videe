import test from 'node:test';
import assert from 'node:assert/strict';
import { altstoreSource, githubReleaseNotes, ipaDownloadUrl, versionNote, versionsFromReleases } from '../src/altstore.mjs';

test('AltStore sources include byte size and a direct IPA URL', () => {
  const source = altstoreSource({
    versions: [{ version: '0.1.3', date: '2026-09-13T13:20:26Z', localizedDescription: 'Fix', downloadURL: ipaDownloadUrl('0.1.3'), size: 10977968, minOSVersion: '15.0' }],
  });
  const app = source.apps[0];
  assert.equal(app.size, 10977968);
  assert.equal(app.downloadURL, 'https://github.com/Tomo0108/videe/releases/download/v0.1.3/Videe-0.1.3-ios.ipa');
  assert.equal(app.downloadURL.includes('/latest/download/'), false);
  assert.equal(app.versions[0].size, 10977968);
});

test('GitHub releases become AltStore versions with sha256', () => {
  const versions = versionsFromReleases([{
    tag_name: 'v0.1.3',
    published_at: '2026-09-13T13:20:26Z',
    name: 'Videe 0.1.3',
    assets: [{ name: 'Videe-0.1.3-ios.ipa', size: 10977968, browser_download_url: ipaDownloadUrl('0.1.3'), digest: 'sha256:abc' }],
  }]);
  assert.equal(versions[0].sha256, 'abc');
  assert.equal(versions[0].size, 10977968);
});

test('0.1.4 release notes describe the library list', () => {
  assert.match(versionNote('0.1.4'), /sortable library lists/i);
  assert.match(githubReleaseNotes('0.1.4'), /sortable library lists/i);
  assert.match(githubReleaseNotes('0.1.4'), /AltStore or Sideloadly/);
});
