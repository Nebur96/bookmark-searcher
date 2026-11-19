// Renders the Chrome Web Store images into store/: 1280×800 screenshots of the popup and Settings on
// made-up bookmarks, and the 440×280 small promo tile. Each is store-frame.html, served locally so the
// pages can import the demo chrome API, and captured by headless Chrome (favicons need the internet).
// Needs Google Chrome (or set CHROME to a Chromium binary):  node scripts/make-store-images.mjs
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { findChrome } from './chrome.mjs';

const IMAGES = { '1-search': [1280, 800], '2-most-used': [1280, 800], '3-settings': [1280, 800], promo: [440, 280] };

const chrome = findChrome();
const root = fileURLToPath(new URL('../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
const DEMO = '<script type="module" src="scripts/store-demo.js"></script>';

const server = createServer((req, res) => {
  const path = join(root, decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(root) || !statSync(path, { throwIfNoEntry: false })?.isFile()) return res.writeHead(404).end();
  let body = readFileSync(path);
  // The demo chrome API has to be in place before the page's own module runs.
  if (path === join(root, 'popup.html') || path === join(root, 'options.html')) {
    body = body.toString().replace('</head>', `  ${DEMO}\n</head>`);
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const dir = join(root, 'store');
mkdirSync(dir, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), 'bookmark-search-'));
try {
  for (const [name, [width, height]] of Object.entries(IMAGES)) {
    await promisify(execFile)(chrome, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`, '--virtual-time-budget=5000', `--screenshot=${join(dir, `${name}.png`)}`,
      `${base}/scripts/store-frame.html?shot=${name}`,
    ]);
    console.log(`store/${name}.png`);
  }
} finally {
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
