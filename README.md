# Bookmark Search

A Chrome extension to fuzzy-search your bookmarks from a hotkey and jump straight to them.

## Features

- **Popup search** — press `⌘ Shift K` (macOS) or `Ctrl+Shift+K` (Windows/Linux) and start typing.
- **Address-bar mode** — type `b`, then Space, then your query in the omnibox.
- **Usage-based ranking** — bookmarks you open more often rank higher over time.
- **Pinned bookmarks** and a "Most used" view.
- **Switch to open tab** — opening a bookmark that's already open jumps to its tab.
- **Customizable** — theme (light/dark/system), density, accent color, and which folders to search.

## Install (unpacked)

1. Clone this repo.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repo folder.

To change the hotkey, go to `chrome://extensions/shortcuts`.

## Tests

The search ranking, highlighting, tab switching and pruning in `search.js` are tested with Node's built-in test runner, so there's nothing to install (Node 20+):

```sh
npm test
```

The tests run `search.js` in Node with a stand-in for the `chrome` API (`test/fake-chrome.js`).

## Icons

The logo is drawn by `logo.js`, which is also used for the logo in the popup and Settings and for the toolbar icon in your accent colour. After changing it, regenerate the PNGs in `icons/` (needs Google Chrome; set `CHROME` to use another Chromium binary):

```sh
node scripts/make-icons.mjs
```
