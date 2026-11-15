// User preferences, stored in chrome.storage and mirrored to localStorage for theme-init.js.

export const ACCENT_PRESETS = [
  { name: 'Green', value: '#16a34a' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Slate', value: '#475569' },
];

export const MAX_RESULTS_LIMIT = 50;

// searchFolders: folder ids to limit search to; empty means all bookmarks.
// maxResults: how many rows the popup's "Most used" view lists, 1 to MAX_RESULTS_LIMIT.
// switchToOpenTab: opening a bookmark that's already open in a tab jumps to that tab.
export const DEFAULTS = {
  theme: 'system', density: 'comfortable', accent: '#16a34a', searchFolders: [], maxResults: 10, switchToOpenTab: true,
};

export const clampMaxResults = (n) =>
  Number.isFinite(n) ? Math.min(MAX_RESULTS_LIMIT, Math.max(1, Math.round(n))) : DEFAULTS.maxResults;

export async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULTS, ...settings };
  merged.maxResults = clampMaxResults(merged.maxResults);
  return merged;
}

export async function saveSettings(patch) {
  const settings = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings });
  applySettings(settings);
  return settings;
}

export function applySettings(settings) {
  const root = document.documentElement;
  if (settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  root.dataset.density = settings.density;
  applyAccent(settings.accent);
  try { localStorage.setItem('bj-settings', JSON.stringify(settings)); } catch {}
}

export function applyAccent(color) {
  document.documentElement.style.setProperty('--accent-base', color);
}
