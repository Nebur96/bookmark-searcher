# Chrome Web Store listing

What to enter in the [developer dashboard](https://chrome.google.com/webstore/devconsole), tab by tab.
The images in this folder come from `node scripts/make-store-images.mjs`, and the zip from `npm run package`.

## Package

Upload `dist/bookmark-search-<version>.zip`. For an update, bump `version` in both `manifest.json` and `package.json`, commit, then run `npm run package`.

## Store listing

**Description** (the summary under the name comes from `description` in `manifest.json`):

```text
Bookmark Search finds any bookmark in a few keystrokes and opens it, without reaching for the mouse or digging through folders.

Press Ctrl+Shift+K (⌘⇧K on a Mac), type a few letters and press Enter. Matching is fuzzy, like a code editor's file finder: "gh pr" finds "Pull requests · GitHub", and "pu1 ds" finds "PROD US-01 Dashboard". It searches titles, folder names and sites, and ignores accents and capitals.

FEATURES
• Fuzzy search across bookmark titles, folders and sites
• Address-bar search: type b, then Space, then what you're looking for
• Learns what you use: bookmarks you open often rank higher, and old habits fade
• A "Most used" list before you type, with pinned bookmarks at the top
• Switches to the tab if a bookmark is already open, instead of opening a duplicate
• Open in a new tab, this tab, a background tab or a new window, or copy the link
• Search only the folders you choose
• Light, dark or system theme, accent colors and a compact mode

PRIVATE BY DESIGN
Everything runs in your browser. Bookmark Search has no server, sends nothing over the network, and has no analytics or ads. Your settings and usage history stay on your device.

To change the shortcut, open chrome://extensions/shortcuts.
```

- **Category:** Functionality & UI
- **Language:** English
- **Store icon:** `icons/icon-128.png`
- **Screenshots, in this order:** `store/1-search.png`, `store/2-most-used.png`, `store/3-settings.png`
- **Small promo tile:** `store/promo.png`
- **Marquee promo tile:** none (only needed to be featured in the store's marquee)
- **Homepage URL:** https://github.com/Nebur96/bookmark-searcher
- **Support URL:** https://github.com/Nebur96/bookmark-searcher/issues
- **Mature content:** off

## Privacy practices

**Single purpose:**

```text
Search your bookmarks from a keyboard shortcut or the address bar, and open the one you pick.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `bookmarks` | Reads your bookmarks so you can search them and open them from the popup or the address bar. Bookmarks are never changed. |
| `storage` | Saves your settings, pinned bookmarks, and how often you open each bookmark (to rank the ones you use most first), in chrome.storage.local on your device. |
| `tabs` | When you open a bookmark, checks the URLs of your open tabs so it can switch to a tab that already shows that page instead of opening a duplicate. |
| `favicon` | Shows each bookmark's site icon, from Chrome's local favicon cache, in the popup and on the Settings page. |

**Remote code:** No, I am not using remote code.

**Data usage:**

- Data collected: tick **Web history** only. The extension keeps the address and last-open time of each bookmark you open through it, to rank results. That fits Web history ("pages a user has visited... and time of visit"). It never leaves the device, but the Web Store asks for disclosure of locally stored data too.
- Tick all three certifications: no selling or transferring data to third parties, no use unrelated to the single purpose, no use for creditworthiness or lending.
- **Privacy policy URL:** https://github.com/Nebur96/bookmark-searcher/blob/main/PRIVACY.md

## Distribution

- **Payments:** free
- **Visibility:** public (or unlisted to share the link before it shows up in search)
- **Regions:** all

## Test instructions (optional, for the reviewer)

```text
No account or setup is needed. Add a few bookmarks, press Ctrl+Shift+K (⌘⇧K on a Mac) and type part of a title. In the address bar, type b, then Space, then a search.
```
