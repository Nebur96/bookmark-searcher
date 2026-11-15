// Applies the cached theme before first paint so pages don't flash the wrong colours.
// settings.js keeps this cache in sync with chrome.storage.
try {
  const s = JSON.parse(localStorage.getItem('bj-settings'));
  if (s?.theme && s.theme !== 'system') document.documentElement.dataset.theme = s.theme;
  if (s?.density) document.documentElement.dataset.density = s.density;
  if (s?.accent) document.documentElement.style.setProperty('--accent-base', s.accent);
} catch {}
