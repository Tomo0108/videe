// Prints the GitHub release description: the version notes, then the quick guide per edition.
// Usage: node scripts/release-notes.mjs [version]  (defaults to RELEASE_VERSION)
import { readFileSync } from 'node:fs';
import { githubReleaseNotes } from '../src/altstore.mjs';
import { RELEASE_VERSION } from '../src/release.mjs';
import { releaseNotesWithGuide } from '../src/release-guide.mjs';

const version = process.argv[2] || RELEASE_VERSION;
const guide = JSON.parse(readFileSync(new URL('../docs/release-guide/guide.json', import.meta.url), 'utf8'));
process.stdout.write(releaseNotesWithGuide(githubReleaseNotes(version), guide, version));
