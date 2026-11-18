import { loadBookmarks, liveFolderIds, rank, mostUsed, getUsage, getPins, togglePin, openUrl } from './search.js';
import { getSettings, applySettings } from './settings.js';
import { icons } from './icons.js';
import { keyCombo, labelKeys } from './keys.js';

const MAX_RESULTS = 50;
const input = document.getElementById('q');
const list = document.getElementById('results');
const section = document.getElementById('section');

labelKeys();
document.getElementById('logo').innerHTML = icons.logo();
document.getElementById('search-icon').innerHTML = icons.search();
document.getElementById('settings').innerHTML = icons.settings();

const settings = await getSettings();
applySettings(settings);
const [bookmarks, usage, liveScope] = await Promise.all([
  loadBookmarks(settings.searchFolders), getUsage(), liveFolderIds(settings.searchFolders),
]);
let pins = new Set(await getPins());
let results = [];
let selected = 0;

const folderCount = new Set(bookmarks.map((b) => b.folder).filter(Boolean)).size;
// Deleted folders don't count: if none of the chosen folders remain, everything is searched.
const scoped = liveScope.length > 0;
document.getElementById('stats').textContent =
  `${bookmarks.length.toLocaleString()} bookmarks · ${folderCount.toLocaleString()} folders` +
  (scoped ? ' · filtered' : '');
document.getElementById('stats').title = scoped ? 'Limited to the folders chosen in Settings' : '';

const faviconUrl = (pageUrl) =>
  `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;

// The line under a title: the site it points to, then its folder path.
function crumbs({ host, folder }) {
  const el = document.createElement('div');
  el.className = 'crumbs';
  if (host) el.append(Object.assign(document.createElement('span'), { className: 'host', textContent: host }));
  if (folder) {
    el.insertAdjacentHTML('beforeend', icons.folder());
    folder.split(' / ').filter(Boolean).forEach((name, i) => {
      if (i > 0) el.append(Object.assign(document.createElement('span'), { className: 'sep', textContent: '›' }));
      el.append(Object.assign(document.createElement('span'), { textContent: name }));
    });
  }
  return el;
}

// Briefly replaces the bookmark counts with a confirmation, e.g. after copying.
const stats = document.getElementById('stats');
const statsText = stats.textContent;
let flashTimer;
function flash(message) {
  stats.textContent = message;
  stats.classList.add('flash');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { stats.textContent = statsText; stats.classList.remove('flash'); }, 1500);
}

function render() {
  section.innerHTML = input.value
    ? `${icons.search(12)} ${results.length === MAX_RESULTS ? `${MAX_RESULTS}+` : results.length} matches`
    : `${icons.flame()} Most used`;

  list.replaceChildren();
  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = input.value
      ? 'No bookmarks match. Try fewer letters, e.g. "pu1 ds".'
      : 'Bookmarks you open from here will show up first.';
    list.append(empty);
    return;
  }
  results.forEach((r, i) => {
    const li = document.createElement('li');
    const pinned = pins.has(r.url);
    li.className = (i === selected ? 'selected' : '') + (pinned ? ' pinned' : '');
    li.title = r.url;
    li.innerHTML = `<span class="tile"><img alt=""></span><div class="text"><div class="title"></div></div>
                    <button class="pin" title="${pinned ? 'Unpin' : 'Pin to top'} (${keyCombo('alt P')})"
                      aria-label="${pinned ? 'Unpin' : 'Pin to top'}" aria-pressed="${pinned}">${icons.pin()}</button>
                    <span class="enter">${icons.enter()}</span>`;
    li.querySelector('img').src = faviconUrl(r.url);
    li.querySelector('.title').textContent = r.title;
    if (r.folder || r.host) li.querySelector('.text').append(crumbs(r));
    li.querySelector('.pin').addEventListener('click', (e) => { e.stopPropagation(); pin(i); });
    li.addEventListener('click', (e) => open(i, whereFor(e)));
    // Middle-click opens in the background, like a link; mousedown would start autoscroll.
    li.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    li.addEventListener('auxclick', (e) => { if (e.button === 1) open(i, 'newBackgroundTab'); });
    li.addEventListener('mousemove', () => select(i));
    list.append(li);
  });
  list.children[selected]?.scrollIntoView({ block: 'nearest' });
}

// Moves the highlight without rebuilding the list.
function select(i) {
  list.children[selected]?.classList.remove('selected');
  selected = i;
  list.children[selected]?.classList.add('selected');
}

function update(keepSelection = false) {
  // Before typing, the list is the "Most used" view: pins first, then sized by the user's setting.
  results = input.value
    ? rank(bookmarks, usage, input.value).slice(0, MAX_RESULTS)
    : mostUsed(bookmarks, usage, [...pins], settings.maxResults);
  selected = keepSelection ? Math.max(0, Math.min(selected, results.length - 1)) : 0;
  render();
}

async function copyUrl(i) {
  const r = results[i];
  if (!r) return;
  try {
    await navigator.clipboard.writeText(r.url);
    flash('Link copied');
  } catch {
    flash('Couldn’t copy the link');
  }
}

async function pin(i) {
  const r = results[i];
  if (!r) return;
  pins = new Set(await togglePin(r.url));
  update(true);
  // Pinning reorders "Most used", so keep the highlight on the same bookmark.
  const at = results.findIndex((x) => x.url === r.url);
  if (at >= 0) {
    select(at);
    list.children[at].scrollIntoView({ block: 'nearest' });
  }
  input.focus();
}

// ⌥ new window, ⇧ this tab, ⌘/Ctrl background tab, otherwise a new tab (or the open one).
const whereFor = (e) =>
  e.altKey ? 'newWindow'
    : e.shiftKey ? 'currentTab'
      : (e.metaKey || e.ctrlKey) ? 'newBackgroundTab'
        : 'newForegroundTab';

async function open(i, where) {
  const r = results[i];
  if (!r) return;
  // Only a plain open jumps to an already-open tab; the modifiers ask for a specific place.
  await openUrl(r.url, where, { switchToOpen: settings.switchToOpenTab && where === 'newForegroundTab' });
  // Background tabs keep the popup open so several can be queued up.
  if (where !== 'newBackgroundTab') window.close();
  else Object.assign(usage, await getUsage());
}

document.getElementById('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
input.addEventListener('input', () => update()); // not update(event): typing resets the highlight
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
    select(Math.min(selected + 1, results.length - 1));
  } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
    select(Math.max(selected - 1, 0));
  } else if (e.altKey && e.code === 'KeyP') { // e.code, since ⌥P types "π" on a Mac
    e.preventDefault();
    pin(selected);
    return;
  } else if (e.key === 'Enter') {
    open(selected, whereFor(e));
    return;
  } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyC' && input.selectionStart === input.selectionEnd) {
    // With text selected in the search box, ⌘C copies that text as usual.
    e.preventDefault();
    copyUrl(selected);
    return;
  } else {
    return;
  }
  e.preventDefault();
  list.children[selected]?.scrollIntoView({ block: 'nearest' });
});

update();
