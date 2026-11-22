// Zips the extension for the Chrome Web Store into dist/bookmark-search-<version>.zip:  npm run package
// The zip is built from the last commit and holds only what Chrome loads: the manifest, icons/ and
// the top-level pages, scripts and styles (not tests, scripts/ or store/).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const versionOf = (file) => JSON.parse(readFileSync(root + file, 'utf8')).version;

const version = versionOf('manifest.json');
if (versionOf('package.json') !== version) throw new Error(`package.json's version doesn't match manifest.json's ${version}.`);
if (git('status', '--porcelain')) console.warn('Uncommitted changes are left out of the zip.');

const INCLUDE = ['manifest.json', 'icons', ':(glob)*.html', ':(glob)*.js', ':(glob)*.css'];
const out = `dist/bookmark-search-${version}.zip`;
mkdirSync(root + 'dist', { recursive: true });
git('archive', '--format=zip', '-o', out, 'HEAD', '--', ...INCLUDE);
console.log(out);
