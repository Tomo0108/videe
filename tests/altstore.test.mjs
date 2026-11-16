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

test('0.1.5 release notes describe library cleanup', () => {
  assert.match(versionNote('0.1.5'), /bulk library removal/i);
  assert.match(githubReleaseNotes('0.1.5'), /nested folder import/i);
  assert.match(githubReleaseNotes('0.1.5'), /AltStore or Sideloadly/);
});

test('AltStore Classic source lists the IPA permissions and skips mislabelled IPAs', async () => {
  const { readFileSync } = await import('node:fs');
  const { IOS_PRIVACY } = await import('../src/altstore.mjs');
  const { iosBuildNumber } = await import('../src/release.mjs');
  const plist = readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8');
  const keys = [...plist.matchAll(/<key>(NS\w+UsageDescription)<\/key>\s*<string>([^<]*)<\/string>/g)];
  assert.deepEqual(Object.fromEntries(keys.map(([, key, value]) => [key, value])), IOS_PRIVACY);

  const ipa = version => ({ tag_name: `v${version}`, published_at: '2026-11-16T00:00:00Z', assets: [{ name: `Videe-${version}-ios.ipa`, size: 100, browser_download_url: ipaDownloadUrl(version) }] });
  const versions = versionsFromReleases([ipa('0.1.22'), ipa('0.1.23'), ipa('0.1.24')]);
  assert.deepEqual(versions.map(v => v.version), ['0.1.24', '0.1.23']);
  assert.equal(versions[0].buildVersion, '124');
  assert.equal(iosBuildNumber('0.1.23'), '123');

  const app = altstoreSource({ versions }).apps[0];
  assert.deepEqual(app.appPermissions, { entitlements: [], privacy: IOS_PRIVACY });
  assert.equal(app.buildVersion, '124');
  assert.equal('marketplaceID' in app, false);
  assert.match(app.downloadURL, /\.ipa$/);
});
