// Finds a Chrome binary for the scripts that render pages headlessly. Set CHROME to use another Chromium.
import { existsSync } from 'node:fs';

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

export function findChrome() {
  const chrome = CANDIDATES.find((p) => p && existsSync(p));
  if (!chrome) throw new Error('Chrome not found; set CHROME to its path.');
  return chrome;
}
