// Keyboard shortcut labels in the user's platform style: "⌘ C" on a Mac, "Ctrl+C" elsewhere.

export const isMac = /mac/i.test(navigator.userAgentData?.platform ?? navigator.platform);

const NAMES = isMac ? { mod: '⌘', alt: '⌥', shift: '⇧' } : { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' };

// combo: space-separated keys, using mod/alt/shift for modifiers, e.g. "mod C".
export const keyCombo = (combo) => combo.split(' ').map((k) => NAMES[k] ?? k).join(isMac ? ' ' : '+');

// Relabels every element with a data-keys combo; the HTML holds the Mac labels as fallback.
export function labelKeys(root = document) {
  for (const el of root.querySelectorAll('[data-keys]')) el.textContent = keyCombo(el.dataset.keys);
}
