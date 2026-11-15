// Address-bar mode: type "b", then Space, then your query.
import { loadBookmarks, rank, matchedOffsets, getUsage, openUrl } from './search.js';
import { getSettings } from './settings.js';

const MAX_SUGGESTIONS = 8;

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The searchable bookmarks and usage, kept between keystrokes and rebuilt only after a
// change. Chrome stops this worker when idle, which drops the cache; it's rebuilt on next use.
let bookmarksCache = null;
let usageCache = null;

const cached = (load, clear) => load().catch((err) => { clear(); throw err; });
const getBookmarks = () =>
  (bookmarksCache ??= cached(async () => loadBookmarks((await getSettings()).searchFolders), () => { bookmarksCache = null; }));
const getUsageCached = () => (usageCache ??= cached(getUsage, () => { usageCache = null; }));

for (const event of [chrome.bookmarks.onCreated, chrome.bookmarks.onRemoved, chrome.bookmarks.onChanged,
  chrome.bookmarks.onMoved, chrome.bookmarks.onChildrenReordered, chrome.bookmarks.onImportEnded]) {
  event.addListener(() => { bookmarksCache = null; });
}
// One-off data migrations, run once per install or update rather than on every use.
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove('recent'); // the old recently-opened list, superseded by usage
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings) bookmarksCache = null; // the search scope may have changed
  if (changes.usage) usageCache = null;
});

async function search(text) {
  const [bookmarks, usage] = await Promise.all([getBookmarks(), getUsageCached()]);
  return rank(bookmarks, usage, text);
}

// text with the characters at the given offsets wrapped in <match>, all XML-escaped.
function highlight(text, offsets) {
  let out = '', run = '', inMatch = false;
  const flush = () => { if (run) out += inMatch ? `<match>${escapeXml(run)}</match>` : escapeXml(run); run = ''; };
  for (let i = 0; i < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(i));
    const matched = offsets.has(i);
    if (matched !== inMatch) { flush(); inMatch = matched; }
    run += ch;
    i += ch.length;
  }
  flush();
  return out;
}

function describe(b, text) {
  const [folder, title, site] = matchedOffsets(b, text);
  return highlight(b.title, title) +
    (b.folder ? `  <dim>${highlight(b.folder, folder)}</dim>` : '') +
    (b.host ? `  <url>${highlight(b.host, site)}</url>` : '');
}

chrome.omnibox.onInputStarted.addListener(() => {
  getBookmarks(); // warm the cache while the first letters are typed
  chrome.omnibox.setDefaultSuggestion({ description: 'Search your bookmarks' });
});

// Inputs can resolve out of order; only the latest may set the default suggestion.
let latestInput = 0;

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const id = ++latestInput;
  const results = (await search(text)).slice(0, MAX_SUGGESTIONS);
  if (id !== latestInput) return;
  // The default row is what Enter opens (the top match), so it isn't repeated below.
  const [top, ...rest] = results;
  chrome.omnibox.setDefaultSuggestion({
    description: top
      ? `Open ${describe(top, text)}`
      : text.trim() ? `No bookmarks match <match>${escapeXml(text)}</match>` : 'Search your bookmarks',
  });
  suggest(rest.map((r) => ({ content: r.url, description: describe(r, text) })));
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  // A selected suggestion passes its URL; pressing Enter on raw text takes the top match.
  let url = text;
  if (!/^[a-z-]+:\/\//i.test(text)) {
    const [top] = await search(text);
    if (!top) return;
    url = top.url;
  }
  // Plain Enter here is 'currentTab'; only an explicit background tab skips the switch.
  const { switchToOpenTab } = await getSettings();
  await openUrl(url, disposition, { switchToOpen: switchToOpenTab && disposition !== 'newBackgroundTab' });
});
