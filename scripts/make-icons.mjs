// Regenerates icons/icon-{16,32,48,128}.png from logo.js in the default accent colour.
// Needs Google Chrome (or set CHROME to a Chromium binary):  node scripts/make-icons.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) throw new Error('Chrome not found; set CHROME to its path.');

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
