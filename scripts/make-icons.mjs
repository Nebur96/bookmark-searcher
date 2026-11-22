// Regenerates icons/icon-{16,32,48,128}.png from logo.js in the default accent colour.
// Needs Google Chrome (or set CHROME to a Chromium binary):  node scripts/make-icons.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome } from './chrome.mjs';

const chrome = findChrome();

const page = pathToFileURL(fileURLToPath(new URL('icons.html', import.meta.url))).href;
const dom = execFileSync(chrome, ['--headless', '--disable-gpu', '--allow-file-access-from-files', '--dump-dom', page],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const json = dom.match(/<pre id="out">(.*?)<\/pre>/s)?.[1];
if (!json) throw new Error('icons.html produced no output.');

const dir = fileURLToPath(new URL('../icons/', import.meta.url));
mkdirSync(dir, { recursive: true });
for (const [size, url] of Object.entries(JSON.parse(json))) {
  writeFileSync(`${dir}icon-${size}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`icons/icon-${size}.png`);
}
