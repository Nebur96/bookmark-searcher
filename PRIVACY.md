# Privacy policy

_Last updated: 19 November 2026_

Bookmark Search is a Chrome extension for searching and opening your bookmarks. It runs entirely in your browser. It has no server and sends nothing over the network. It has no analytics, ads or tracking.

## What it reads

- **Your bookmarks** (`bookmarks` permission), to search them and show which folder each one is in. It never changes your bookmarks.
- **The addresses of your open tabs** (`tabs` permission). It checks them only when you open a bookmark, so it can switch to a tab that already shows that page instead of opening a duplicate.
- **Site icons** (`favicon` permission), from Chrome's own icon cache, to show next to each bookmark.

## What it stores

It uses `chrome.storage.local`, which stays on your device and isn't synced to your Google account. It stores:

- **Settings:** theme, accent color, compact mode, which folders to search, and how many bookmarks to list.
- **Usage history:** for each bookmark you open through the extension, its address, a count of how often you open it, and when you last opened it. This ranks the bookmarks you use most higher. Old opens count for less over time. At most 500 bookmarks are tracked, and entries for deleted bookmarks are removed.
- **Pinned bookmarks:** the addresses of the bookmarks you pin, in order.

What you type in the search box isn't stored.

## What it shares

Nothing. No data leaves your device, so none of it is sold, given to third parties, or used for advertising or any other purpose.

The use of information received from Chrome APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies), including the Limited Use requirements.

## Deleting your data

- To clear your usage history, open Settings and click **Reset counter** under Ranking.
- To remove a pin, unpin the bookmark in the popup or in Settings.
- Uninstalling the extension deletes everything it stored.

## Changes and contact

Changes to this policy are published on this page with a new date. For questions, [open an issue](https://github.com/Nebur96/bookmark-searcher/issues).
