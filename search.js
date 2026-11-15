// Shared bookmark loading, fuzzy ranking and open-frequency tracking.

// Open counts decay so habits can change: a click is worth half as much after two weeks.
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_TRACKED = 500;
const MAX_USAGE_BOOST = 4;

// Strips accents (é -> e), then recomposes so other scripts' marks (e.g. Japanese
// dakuten) stay part of their letter. Final sigma is folded too, since a title is
// indexed one letter at a time and can't tell which sigma ends a word.
const normalize = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/ς/g, 'σ');

// Letters and digits of any script count as word characters, not just a-z and 0-9.
const splitWords = (s) => normalize(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// fzf-style scoring weights.
const WORD_START = 2;
const FIRST_AT_WORD_START = 4;
const CONSECUTIVE = 2;
const GAP = 0.1;

// The searchable parts of a bookmark. A matched letter counts fully in the title, a bit
// less in the folder path and least in the site name, so the title wins among equal matches.
const FOLDER = 0, TITLE = 1, SITE = 2;
const FIELD_WEIGHT = [0.8, 1, 0.6];

// Untitled bookmarks are searched by their URL, which can be huge (e.g. data: URLs).
const MAX_INDEXED_TITLE = 300;

const LETTER = /\p{L}/u, DIGIT = /\p{N}/u, MARK = /\p{M}/u, UPPER = /\p{Lu}/u, LOWER = /\p{Ll}/u;

// 1 = letter, 2 = digit, 0 = separator, -1 = combining mark (part of the previous letter).
const kindOf = (c) => {
  const code = c.charCodeAt(0);
  if (code < 128) return code >= 97 && code <= 122 ? 1 : code >= 48 && code <= 57 ? 2 : 0;
  return LETTER.test(c) ? 1 : DIGIT.test(c) ? 2 : MARK.test(c) ? -1 : 0;
};
const isUpper = (c) => (c < '\x80' ? c >= 'A' && c <= 'Z' : UPPER.test(c));
const isLower = (c) => (c < '\x80' ? c >= 'a' && c <= 'z' : LOWER.test(c));

// Builds a bookmark's searchable text from its fields: their letters and digits, folded like
// normalize(), run together. Alongside each letter it keeps whether a word starts there
// (after a separator, between letters and digits, or at a camelCase hump, so "US-01",
// "us01" and "GitHub" split into us/01 and git/hub) and which field and character of the
// original text it came from, for weighting and highlighting.
function buildIndex(fields) {
  const chars = [], starts = [], field = [], offset = [];
  fields.forEach((text, f) => {
    let prevKind = 0, prevLower = false, at = 0;
    for (const ch of text) {
      const folded = ch < '\x80' ? ch.toLowerCase() : normalize(ch);
      let first = true;
      for (const c of folded) {
        const kind = kindOf(c);
        if (kind === -1) continue;
        if (kind === 0) { prevKind = 0; continue; }
        const start = kind !== prevKind || (first && prevLower && isUpper(ch));
        // One entry per UTF-16 unit, so letters outside the BMP take two.
        for (let u = 0; u < c.length; u++) {
          chars.push(c[u]);
          starts.push(start && u === 0 ? 1 : 0);
          field.push(f);
          offset.push(at);
        }
        prevKind = kind;
        first = false;
      }
      prevLower = isLower(ch);
      at += ch.length;
    }
  });
  return {
    compact: chars.join(''),
    wordStarts: Uint8Array.from(starts),
    field: Uint8Array.from(field),
    offset: Int32Array.from(offset),
  };
}

// The site a bookmark points to, as shown ("grafana.example.com"), and the part of it
// worth searching: no "www." and no ".com"-style ending, which nearly every URL shares.
function siteOf(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch {}
  return { host, searchable: host.replace(/\.[a-z]+$/, '') };
}

const collectFolderIds = (node, ids = new Set()) => {
  for (const child of node.children ?? []) {
    if (!child.url) { ids.add(child.id); collectFolderIds(child, ids); }
  }
  return ids;
};

// The ids in folderIds that are still bookmark folders (e.g. not since deleted).
export async function liveFolderIds(folderIds) {
  const [root] = await chrome.bookmarks.getTree();
  const existing = collectFolderIds(root);
  return folderIds.filter((id) => existing.has(id));
}

// Flattens the bookmark tree, keeping each bookmark's folder path and site as searchable text.
// With scopeFolderIds, only bookmarks inside those folders (or their subfolders) are kept;
// folders that no longer exist are ignored, and if none remain everything is searched.
export async function loadBookmarks(scopeFolderIds = []) {
  const [root] = await chrome.bookmarks.getTree();
  const existing = collectFolderIds(root);
  const scope = new Set(scopeFolderIds.filter((id) => existing.has(id)));
  const out = [];
  const walk = (node, path, inScope) => {
    for (const child of node.children ?? []) {
      if (child.url) {
        if (!inScope || child.url.startsWith('javascript:')) continue;
        const title = child.title || child.url;
        const folder = path.join(' / ');
        const { host, searchable } = siteOf(child.url);
        const fields = [];
        fields[FOLDER] = folder;
        fields[TITLE] = title.slice(0, MAX_INDEXED_TITLE);
        fields[SITE] = searchable;
        out.push({ title, url: child.url, folder, host, ...buildIndex(fields) });
      } else {
        // Skip the top-level roots ("Bookmarks Bar", "Other Bookmarks") in the path.
        walk(child, node.parentId ? [...path, child.title] : path, inScope || scope.has(child.id));
      }
    }
  };
  walk(root, [], scope.size === 0);
  return out;
}

// Score rows reused across calls, since scoring runs for every bookmark on every keystroke.
let rowA = new Float64Array(256), rowB = new Float64Array(256);

// Best subsequence match of token in the bookmark's text, rewarding letters that start
// a word and runs of consecutive letters (so "pu1" -> PROD US-01). -Infinity = no match.
// With trace ({ rows: one Int32Array per token letter }), also records where each letter
// matched so matchedOffsets can walk the best match back.
function scoreToken(token, b, trace) {
  const s = b.compact, n = s.length;
  // Cheap check first: most bookmarks don't contain the token's letters in order at all.
  for (let i = 0, j = -1; i < token.length; i++) {
    j = s.indexOf(token[i], j + 1);
    if (j < 0) return -Infinity;
  }
  if (rowA.length < n) { rowA = new Float64Array(n * 2); rowB = new Float64Array(n * 2); }
  let prev = rowA, cur = rowB;
  for (let i = 0; i < token.length; i++) {
    cur.fill(-Infinity, 0, n);
    let bestBeforeGap = -Infinity, bestK = -1; // max over k <= j-2 of prev[k] + GAP*k, and its k
    for (let j = i; j < n; j++) {
      if (i > 0 && j >= 2) {
        const v = prev[j - 2] + GAP * (j - 2);
        if (v > bestBeforeGap) { bestBeforeGap = v; bestK = j - 2; }
      }
      if (s[j] !== token[i]) continue;
      const w = FIELD_WEIGHT[b.field[j]];
      const base = w * (1 + (b.wordStarts[j] ? (i === 0 ? FIRST_AT_WORD_START : WORD_START) : 0));
      if (i === 0) { cur[j] = base; continue; }
      const run = prev[j - 1] + w * CONSECUTIVE, jump = bestBeforeGap - GAP * (j - 1);
      cur[j] = base + Math.max(run, jump);
      if (trace) trace.rows[i][j] = run >= jump ? j - 1 : bestK;
    }
    const t = prev; prev = cur; cur = t;
  }
  let best = -Infinity;
  for (let j = 0; j < n; j++) {
    if (prev[j] > best) { best = prev[j]; if (trace) trace.end = j; }
  }
  return best;
}

// Which characters of each field the query matched: [folder, title, site] sets of string
// offsets into b.folder, b.title and b.host, e.g. for drawing them in bold.
export function matchedOffsets(b, query) {
  const out = [new Set(), new Set(), new Set()];
  for (const token of splitWords(query)) {
    const trace = { rows: Array.from({ length: token.length }, () => new Int32Array(b.compact.length)), end: -1 };
    if (scoreToken(token, b, trace) === -Infinity) continue;
    for (let i = token.length - 1, j = trace.end; i >= 0; j = trace.rows[i--][j]) {
      out[b.field[j]].add(b.offset[j]);
    }
  }
  return out;
}

const decayed = (entry, now) =>
  entry ? entry.score * 0.5 ** ((now - entry.last) / HALF_LIFE_MS) : 0;

// usage: { [url]: { score, last } } as stored by recordOpen.
export function rank(bookmarks, usage, query, now = Date.now()) {
  const tokens = splitWords(query);
  const frecency = (url) => decayed(usage[url], now);

  if (tokens.length === 0) {
    return bookmarks
      .map((b) => ({ b, f: frecency(b.url) }))
      .filter((x) => x.f > 0)
      .sort((x, y) => y.f - x.f)
      .map((x) => x.b);
  }

  const scored = [];
  for (const b of bookmarks) {
    let score = 0;
    for (const t of tokens) {
      score += scoreToken(t, b);
      if (score === -Infinity) break;
    }
    if (score === -Infinity) continue;
    // Log scale so a heavily used bookmark wins among similar matches without
    // beating a clearly better text match.
    const boost = Math.min(MAX_USAGE_BOOST, Math.log2(1 + frecency(b.url)));
    scored.push({ b, score: score + boost });
  }
  scored.sort((x, y) => y.score - x.score || x.b.title.length - y.b.title.length);
  return scored.map((s) => s.b);
}

// The "Most used" view: pinned bookmarks first, in the order they were pinned, then the
// most used of the rest up to limit. Pins always show, even if there are more than limit.
export function mostUsed(bookmarks, usage, pins, limit, now = Date.now()) {
  const order = new Map(pins.map((url, i) => [url, i]));
  const pinned = bookmarks.filter((b) => order.has(b.url)).sort((x, y) => order.get(x.url) - order.get(y.url));
  const rest = rank(bookmarks.filter((b) => !order.has(b.url)), usage, '', now);
  return [...pinned, ...rest.slice(0, Math.max(0, limit - pinned.length))];
}

// pins: bookmark URLs in the order they were pinned.
export async function getPins() {
  const { pins = [] } = await chrome.storage.local.get('pins');
  return pins;
}

export async function setPins(urls) {
  await chrome.storage.local.set({ pins: urls });
}

export async function togglePin(url) {
  const pins = await getPins();
  const next = pins.includes(url) ? pins.filter((u) => u !== url) : [...pins, url];
  await chrome.storage.local.set({ pins: next });
  return next;
}

export async function getUsage() {
  const { usage = {} } = await chrome.storage.local.get('usage');
  return usage;
}

export async function recordOpen(url, now = Date.now()) {
  const usage = await getUsage();
  usage[url] = { score: decayed(usage[url], now) + 1, last: now };

  const urls = Object.keys(usage);
  if (urls.length > MAX_TRACKED) {
    urls.sort((a, b) => decayed(usage[a], now) - decayed(usage[b], now))
      .slice(0, urls.length - MAX_TRACKED)
      .forEach((u) => delete usage[u]);
  }
  await chrome.storage.local.set({ usage });
}

// Same page if the URLs only differ by #fragment or a trailing slash.
const pageKey = (url) => {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href.replace(/\/$/, '');
  } catch {
    return url;
  }
};

// Brings an already-open tab showing url to the front, preferring the focused window and
// then the most recently used tab. Incognito and normal windows don't mix.
// Returns whether such a tab was found.
async function switchToTab(url) {
  const [focused, tabs] = await Promise.all([chrome.windows.getLastFocused(), chrome.tabs.query({})]);
  const key = pageKey(url);
  const open = tabs
    .filter((t) => t.incognito === focused.incognito && [t.url, t.pendingUrl].some((u) => u && pageKey(u) === key))
    .sort((a, b) => (b.windowId === focused.id) - (a.windowId === focused.id) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
  const [tab] = open;
  if (!tab) return false;
  await chrome.tabs.update(tab.id, { active: true });
  if (tab.windowId !== focused.id) await chrome.windows.update(tab.windowId, { focused: true });
  return true;
}

// where: 'currentTab', 'newForegroundTab', 'newBackgroundTab' (as the omnibox passes them)
// or 'newWindow'. With switchToOpen, a tab already showing url is used instead, if there is one.
export async function openUrl(url, where = 'newForegroundTab', { switchToOpen = false } = {}) {
  await recordOpen(url);
  if (switchToOpen && (await switchToTab(url))) return;
  if (where === 'currentTab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.tabs.update(tab.id, { url });
  } else if (where === 'newWindow') {
    await chrome.windows.create({ url, focused: true });
  } else {
    await chrome.tabs.create({ url, active: where !== 'newBackgroundTab' });
  }
}

// Drops history for URLs that are no longer bookmarked (deleted, or edited to a new URL).
// Pass the full, unscoped bookmark list, or bookmarks outside the search scope lose their history.
export async function pruneUsage(allBookmarks) {
  const usage = await getUsage();
  const live = new Set(allBookmarks.map((b) => b.url));
  const stale = Object.keys(usage).filter((url) => !live.has(url));
  if (stale.length === 0) return usage;
  stale.forEach((url) => delete usage[url]);
  await chrome.storage.local.set({ usage });
  return usage;
}

// Drops pins whose URL is no longer bookmarked. Like pruneUsage, pass the full, unscoped list.
export async function prunePins(allBookmarks) {
  const pins = await getPins();
  const live = new Set(allBookmarks.map((b) => b.url));
  const kept = pins.filter((url) => live.has(url));
  if (kept.length !== pins.length) await setPins(kept);
  return kept;
}

export async function clearUsage() {
  await chrome.storage.local.remove('usage');
}

// Current (decayed) open score for a URL, e.g. for showing relative usage.
export const usageScore = (usage, url, now = Date.now()) => decayed(usage[url], now);
