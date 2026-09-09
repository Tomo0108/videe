import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { artifactNames } from '../src/release.mjs';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status || 1);
}

function findApp(directory) {
  if (!existsSync(directory)) return '';
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile()) continue;
    if (entry.name.endsWith('.app')) return path;
    const nested = findApp(path);
    if (nested) return nested;
  }
  return '';
}

if (process.platform !== 'darwin') {
  console.error('iOS packages must be built on macOS.');
  process.exit(1);
}

run('npm', ['run', 'ios:sync']);
const derived = join('release', 'ios-derived');
rmSync(derived, { recursive: true, force: true });
run('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj',
  '-scheme', 'App',
  '-configuration', 'Release',
  '-sdk', 'iphoneos',
  '-destination', 'generic/platform=iOS',
  '-derivedDataPath', derived,
  'CODE_SIGN_IDENTITY=-',
  'CODE_SIGNING_REQUIRED=NO',
  'CODE_SIGNING_ALLOWED=NO',
  'DEVELOPMENT_TEAM=',
  'build'
]);
const appPath = findApp(join(derived, 'Build', 'Products'));
if (!appPath) {
  console.error('xcodebuild finished without an .app bundle.');
  process.exit(1);
}
const stage = join('release', 'ios-payload');
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'Payload'), { recursive: true });
cpSync(appPath, join(stage, 'Payload', 'Videe.app'), { recursive: true });
const ipa = join('release', artifactNames().ios);
rmSync(ipa, { force: true });
run('/usr/bin/ditto', ['-c', '-k', '--norsrc', '--keepParent', 'Payload', join('..', artifactNames().ios)], { cwd: stage });
console.log(`Wrote ${ipa}`);
