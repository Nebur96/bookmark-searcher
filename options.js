import { loadBookmarks, rank, pruneUsage, prunePins, clearUsage, usageScore, getPins, setPins } from './search.js';
import { getSettings, saveSettings, applySettings, applyAccent, clampMaxResults, ACCENT_PRESETS } from './settings.js';
import { icons } from './icons.js';
import { keyCombo, labelKeys } from './keys.js';

labelKeys();

const summary = document.getElementById('usage-summary');
const topList = document.getElementById('usage-top');
const status = document.getElementById('usage-status');
const resetButton = document.getElementById('reset-usage');
const toggleButton = document.getElementById('usage-toggle');
const themeGroup = document.getElementById('theme');
const compactSwitch = document.getElementById('compact');

document.getElementById('logo').innerHTML = icons.logo(20);

const faviconUrl = (pageUrl) =>
  `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;

// Appearance

const accentGroup = document.getElementById('accent');
const customSwatch = accentGroup.querySelector('.custom');
const customInput = document.getElementById('accent-custom');

for (const preset of ACCENT_PRESETS) {
  const b = document.createElement('button');
  b.className = 'swatch';
  b.title = preset.name;
  b.dataset.value = preset.value;
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', preset.name);
  b.style.setProperty('--c', preset.value);
  b.addEventListener('click', async () => renderAppearance(await saveSettings({ accent: preset.value })));
  accentGroup.insertBefore(b, customSwatch);
}
customInput.addEventListener('input', () => applyAccent(customInput.value)); // live preview while dragging
customInput.addEventListener('change', async () => renderAppearance(await saveSettings({ accent: customInput.value })));

function renderAppearance(settings) {
  for (const b of themeGroup.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === settings.theme));
  }
  compactSwitch.setAttribute('aria-checked', String(settings.density === 'compact'));

  const accent = settings.accent.toLowerCase();
  let isPreset = false;
  for (const b of accentGroup.querySelectorAll('button.swatch')) {
    const on = b.dataset.value === accent;
    isPreset ||= on;
    b.setAttribute('aria-checked', String(on));
  }
  customSwatch.setAttribute('aria-checked', String(!isPreset));
  customSwatch.style.setProperty('--c', accent);
  customInput.value = accent;
}

themeGroup.addEventListener('click', async (e) => {
  const value = e.target.closest('button')?.dataset.value;
  if (value) renderAppearance(await saveSettings({ theme: value }));
});
compactSwitch.addEventListener('click', async () => {
  const compact = compactSwitch.getAttribute('aria-checked') !== 'true';
  renderAppearance(await saveSettings({ density: compact ? 'compact' : 'comfortable' }));
});

// Most used

const maxResultsInput = document.getElementById('max-results');
maxResultsInput.addEventListener('change', async () => {
  const { maxResults } = await saveSettings({ maxResults: clampMaxResults(maxResultsInput.valueAsNumber) });
  maxResultsInput.value = maxResults; // show the clamped value if it was out of range
  renderUsage();
});

// Search scope

const treeEl = document.getElementById('folder-tree');
const scopeSummary = document.getElementById('scope-summary');
const scopeClear = document.getElementById('scope-clear');
let searchFolders = new Set();
let expanded = null; // folder ids shown open; seeded on first render

const subfolders = (node) => (node.children ?? []).filter((c) => !c.url);
const bookmarkCount = (node) =>
  (node.children ?? []).reduce((n, c) => n + (c.url ? 1 : bookmarkCount(c)), 0);
const descendantIds = (node) => subfolders(node).flatMap((f) => [f.id, ...descendantIds(f)]);

// Opens the top-level folders plus the path to every selected folder.
function seedExpanded(root) {
  expanded = new Set(subfolders(root).map((f) => f.id));
  const visit = (node, ancestors) => {
    if (searchFolders.has(node.id)) ancestors.forEach((id) => expanded.add(id));
    subfolders(node).forEach((f) => visit(f, [...ancestors, node.id]));
  };
  subfolders(root).forEach((f) => visit(f, []));
}

function folderNode(folder, inherited) {
  const li = document.createElement('li');
  const children = subfolders(folder);
  const checked = searchFolders.has(folder.id);
  const open = expanded.has(folder.id);

  const row = document.createElement('label');
  row.className = 'node' + (inherited ? ' inherited' : '');
  row.innerHTML = `<button class="chev${children.length ? '' : ' leaf'}" aria-expanded="${open}"
      aria-label="Expand">${icons.chevron()}</button><input type="checkbox">
    <span class="ficon">${icons.folder(15)}</span><span class="name"></span><span class="count"></span>`;
  row.querySelector('.name').textContent = folder.title || '(untitled)';
  row.querySelector('.count').textContent = bookmarkCount(folder);

  const box = row.querySelector('input');
  box.checked = checked || inherited;
  box.disabled = inherited;
  if (inherited) row.title = 'Included because a parent folder is checked';
  box.addEventListener('change', () => {
    if (box.checked) {
      searchFolders.add(folder.id);
      descendantIds(folder).forEach((id) => searchFolders.delete(id)); // now implied by the parent
    } else {
      searchFolders.delete(folder.id);
    }
    saveScope();
  });

  row.querySelector('.chev').addEventListener('click', (e) => {
    e.preventDefault(); // don't toggle the checkbox via the label
    if (open) expanded.delete(folder.id); else expanded.add(folder.id);
    renderScope();
  });

  li.append(row);
  if (open && children.length) {
    const ul = document.createElement('ul');
    ul.append(...children.map((c) => folderNode(c, inherited || checked)));
    li.append(ul);
  }
  return li;
}

async function renderScope() {
  const [[root], inScope] = await Promise.all([chrome.bookmarks.getTree(), loadBookmarks([...searchFolders])]);

  // Forget folders that have since been deleted, so the summary only counts real ones.
  const live = new Set(descendantIds(root));
  const stale = [...searchFolders].filter((id) => !live.has(id));
  if (stale.length) {
    stale.forEach((id) => searchFolders.delete(id));
    await saveSettings({ searchFolders: [...searchFolders] });
  }

  if (!expanded) seedExpanded(root);
  treeEl.replaceChildren(...subfolders(root).map((f) => folderNode(f, false)));

  const n = searchFolders.size;
  scopeSummary.textContent = n === 0
    ? `Searching all ${inScope.length} bookmarks. Check folders to search only inside them.`
    : `Searching ${inScope.length} bookmarks in ${n} folder${n === 1 ? '' : 's'} (subfolders included).`;
  scopeClear.disabled = n === 0;
}

async function saveScope() {
  await saveSettings({ searchFolders: [...searchFolders] });
  renderScope();
}

scopeClear.addEventListener('click', () => {
  searchFolders.clear();
  saveScope();
});

// Usage history

const COLLAPSED_ROWS = 10;
let usageExpanded = false;

// Long lists start collapsed to COLLAPSED_ROWS; the extra rows are hidden by CSS.
function renderUsageToggle(count) {
  toggleButton.hidden = count <= COLLAPSED_ROWS;
  topList.classList.toggle('collapsed', !usageExpanded);
  toggleButton.textContent = usageExpanded ? 'Show fewer' : `Show all ${count}`;
  toggleButton.setAttribute('aria-expanded', String(usageExpanded));
}

toggleButton.addEventListener('click', () => {
  usageExpanded = !usageExpanded;
  renderUsageToggle(topList.children.length);
});

async function renderUsage() {
  const [bookmarks, { maxResults }] = await Promise.all([loadBookmarks(), getSettings()]);
  const usage = await pruneUsage(bookmarks); // so totals only count bookmarks that still exist
  const tracked = Object.keys(usage).length;
  summary.textContent = tracked === 0
    ? 'Nothing tracked yet. Bookmarks you open from Bookmark Search get ranked higher over time.'
    : `${tracked} bookmark${tracked === 1 ? '' : 's'} tracked. Clicks fade by half every two weeks.`;

  const top = rank(bookmarks, usage, '').slice(0, maxResults);
  const max = top.length ? usageScore(usage, top[0].url) : 1;
  const total = Object.keys(usage).reduce((sum, url) => sum + usageScore(usage, url), 0);
  topList.replaceChildren(...top.map((b) => {
    const li = document.createElement('li');
    li.innerHTML = '<img alt=""><span class="name"></span><span class="bar"><span></span></span>';
    li.querySelector('img').src = faviconUrl(b.url);
    li.querySelector('.name').textContent = b.title;
    const score = usageScore(usage, b.url);
    const pct = total ? (score / total) * 100 : 0;
    const bar = li.querySelector('.bar');
    bar.dataset.tip = `${pct < 1 ? '<1' : Math.round(pct)}% of your picks`;
    bar.setAttribute('aria-label', bar.dataset.tip);
    bar.querySelector('span').style.width = `${Math.max(6, (score / max) * 100)}%`;
    return li;
  }));
  renderUsageToggle(top.length);
  resetButton.disabled = tracked === 0;
}

resetButton.addEventListener('click', async () => {
  if (!confirm('Reset usage history? Search results go back to text-match order only.')) return;
  await clearUsage();
  await renderUsage();
  status.textContent = 'Usage history cleared.';
  status.hidden = false;
});

// Pinned

const pinsList = document.getElementById('pins-list');
const pinsSummary = document.getElementById('pins-summary');
let refocus = null; // { index, action } of the button to focus again after a re-render

async function renderPins() {
  const bookmarks = await loadBookmarks();
  const pins = await prunePins(bookmarks); // pins of deleted bookmarks are dropped, like usage history
  const byUrl = new Map(bookmarks.map((b) => [b.url, b]));
  pinsSummary.textContent = pins.length
    ? 'Shown first in the popup, in this order.'
    : `Nothing pinned yet. In the popup, press ${keyCombo('alt P')} or the pin button on a row.`;
  pinsList.replaceChildren(...pins.map((url, i) => {
    const b = byUrl.get(url);
    const li = document.createElement('li');
    li.innerHTML = `<img alt=""><span class="name"></span><span class="site"></span>
      <button class="icon-btn" data-action="up" title="Move up" aria-label="Move up">${icons.arrowUp()}</button>
      <button class="icon-btn" data-action="down" title="Move down" aria-label="Move down">${icons.arrowDown()}</button>
      <button class="icon-btn" data-action="unpin" title="Unpin" aria-label="Unpin">${icons.x()}</button>`;
    li.querySelector('img').src = faviconUrl(url);
    li.querySelector('.name').textContent = b.title;
    li.querySelector('.site').textContent = b.host;
    li.title = url;
    li.querySelector('[data-action="up"]').disabled = i === 0;
    li.querySelector('[data-action="down"]').disabled = i === pins.length - 1;
    return li;
  }));

  if (refocus) {
    const li = pinsList.children[Math.min(refocus.index, pinsList.children.length - 1)];
    const button = li?.querySelector(`[data-action="${refocus.action}"]`);
    (button && !button.disabled ? button : li?.querySelector('[data-action="unpin"]'))?.focus();
    refocus = null;
  }
}

pinsList.addEventListener('click', async (e) => {
  const button = e.target.closest('button');
  if (!button) return;
  const i = [...pinsList.children].indexOf(button.closest('li'));
  const pins = await getPins();
  const { action } = button.dataset;
  if (action === 'unpin') {
    pins.splice(i, 1);
    refocus = { index: i, action: 'unpin' };
  } else {
    const j = action === 'up' ? i - 1 : i + 1;
    [pins[i], pins[j]] = [pins[j], pins[i]];
    refocus = { index: j, action };
  }
  await setPins(pins); // re-rendered by the storage listener below
});

// Pins also change from the popup while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.pins) renderPins();
});

// Opening

const switchTabsToggle = document.getElementById('switch-tabs');
switchTabsToggle.addEventListener('click', async () => {
  const on = switchTabsToggle.getAttribute('aria-checked') !== 'true';
  const { switchToOpenTab } = await saveSettings({ switchToOpenTab: on });
  switchTabsToggle.setAttribute('aria-checked', String(switchToOpenTab));
});

// Shortcuts

const [command] = await chrome.commands.getAll();
document.getElementById('shortcut').textContent = command?.shortcut || 'Not set';
document.getElementById('change-shortcut').addEventListener('click', () =>
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

const settings = await getSettings();
applySettings(settings);
renderAppearance(settings);
maxResultsInput.value = settings.maxResults;
switchTabsToggle.setAttribute('aria-checked', String(settings.switchToOpenTab));
searchFolders = new Set(settings.searchFolders);
renderScope();
renderUsage();
renderPins();
