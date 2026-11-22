// Loaded ahead of popup.js or options.js by make-store-images.mjs: swaps in the tests' fake chrome
// API, filled with made-up bookmarks, so the pages render as ordinary web pages.
// The query string sets the view: theme=light|dark, q=<text typed in the popup>,
// scope=<folder titles to search, comma-separated>.
import { installFakeChrome } from '../test/fake-chrome.js';

const params = new URLSearchParams(location.search);
const HOUR = 60 * 60 * 1000;
const now = Date.now();

const tree = {
  'Bookmarks Bar': [
    { title: 'Inbox - Gmail', url: 'https://mail.google.com/mail/u/0/#inbox' },
    { title: 'Google Calendar - Week', url: 'https://calendar.google.com/calendar/u/0/r/week' },
    { title: 'Work', children: [
      { title: 'Pull requests · GitHub', url: 'https://github.com/pulls' },
      { title: 'Review requests · GitHub', url: 'https://github.com/pulls/review-requested' },
      { title: 'Repos', children: [
        { title: 'Pull requests · northwind/web-app', url: 'https://github.com/northwind/web-app/pulls' },
        { title: 'Pull requests · northwind/api', url: 'https://github.com/northwind/api/pulls' },
        { title: 'Issues · northwind/web-app', url: 'https://github.com/northwind/web-app/issues' },
        { title: 'Releases · northwind/web-app', url: 'https://github.com/northwind/web-app/releases' },
      ] },
      { title: 'Web team · Active cycle', url: 'https://linear.app/northwind/team/WEB/active' },
      { title: 'Design system – Components', url: 'https://www.figma.com/design/k2Lx9/Design-system' },
      { title: 'Team wiki', url: 'https://www.notion.so/northwind/Team-wiki-4f1c' },
      { title: 'Dashboards', children: [
        { title: 'PROD US-01 Dashboard', url: 'https://northwind.grafana.net/d/prod-us-01' },
        { title: 'PROD EU-02 Dashboard', url: 'https://northwind.grafana.net/d/prod-eu-02' },
        { title: 'Error tracking – Issues', url: 'https://northwind.sentry.io/issues/' },
      ] },
      { title: 'Runbooks', children: [
        { title: 'On-call handbook', url: 'https://www.notion.so/northwind/On-call-handbook-9a2e' },
        { title: 'Deploying a hotfix', url: 'https://www.notion.so/northwind/Deploying-a-hotfix-77b0' },
      ] },
    ] },
    { title: 'Docs', children: [
      { title: 'About pull request reviews - GitHub Docs',
        url: 'https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews' },
      { title: 'Workflow syntax for GitHub Actions', url: 'https://docs.github.com/en/actions/writing-workflows/workflow-syntax-for-github-actions' },
      { title: 'Array.prototype.flatMap() - JavaScript | MDN',
        url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap' },
      { title: 'chrome.bookmarks | Chrome Extensions', url: 'https://developer.chrome.com/docs/extensions/reference/api/bookmarks' },
      { title: 'Test runner | Node.js Documentation', url: 'https://nodejs.org/api/test.html' },
      { title: 'Can I use… Support tables for HTML5, CSS3, etc', url: 'https://caniuse.com/' },
      { title: 'regex101: build, test, and debug regex', url: 'https://regex101.com/' },
    ] },
    { title: 'Hacker News', url: 'https://news.ycombinator.com/' },
    { title: 'YouTube', url: 'https://www.youtube.com/' },
  ],
  'Other Bookmarks': [
    { title: 'Reading', children: [
      { title: 'Pull Request Etiquette – Pragmatic Engineer', url: 'https://newsletter.pragmaticengineer.com/p/pull-requests' },
      { title: 'Julia Evans – Blog', url: 'https://jvns.ca/' },
      { title: 'Refactoring – Martin Fowler', url: 'https://martinfowler.com/books/refactoring.html' },
    ] },
    { title: 'Travel', children: [
      { title: 'Lisbon – Trip plan', url: 'https://www.google.com/maps/@38.7223,-9.1393,13z' },
      { title: 'Porto weekend – Airbnb', url: 'https://www.airbnb.com/rooms/48213' },
    ] },
    { title: 'Home', children: [
      { title: 'Sourdough starter – King Arthur', url: 'https://www.kingarthurbaking.com/recipes/sourdough-starter-recipe' },
      { title: 'Spotify – Focus playlist', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ' },
    ] },
  ],
};

// url -> [opens, hours since the last one], for "Most used" and the usage boost in search.
const OPENS = {
  'https://github.com/pulls': [24, 1],
  'https://linear.app/northwind/team/WEB/active': [19, 2],
  'https://northwind.grafana.net/d/prod-us-01': [15, 5],
  'https://www.figma.com/design/k2Lx9/Design-system': [11, 20],
  'https://github.com/pulls/review-requested': [9, 3],
  'https://www.notion.so/northwind/Team-wiki-4f1c': [8, 26],
  'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/flatMap': [6, 30],
  'https://news.ycombinator.com/': [6, 8],
  'https://northwind.sentry.io/issues/': [5, 50],
  'https://nodejs.org/api/test.html': [4, 70],
  'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ': [4, 6],
};
const usage = Object.fromEntries(Object.entries(OPENS).map(([url, [score, hours]]) =>
  [url, { score, last: now - hours * HOUR }]));
const pins = ['https://mail.google.com/mail/u/0/#inbox', 'https://calendar.google.com/calendar/u/0/r/week'];

const { root, storage } = installFakeChrome({ tree, storage: { usage, pins } });

const folderIds = (node, titles) => (node.children ?? []).flatMap((child) =>
  child.url ? [] : [...(titles.includes(child.title) ? [child.id] : []), ...folderIds(child, titles)]);
storage.settings = {
  theme: params.get('theme') ?? 'light',
  searchFolders: folderIds(root, params.get('scope')?.split(',') ?? []),
  maxResults: 8,
};

Object.assign(chrome, {
  runtime: { id: 'demo', openOptionsPage() {} },
  commands: { getAll: async () => [{ name: '_execute_action', shortcut: '⇧⌘K' }] },
});
chrome.storage.onChanged = { addListener() {} };

// Favicons come from chrome-extension://<id>/_favicon/, which only works inside the extension.
// Rows get their src before they're added to the page, so check added nodes as well as src changes.
const fixFavicon = (img) => {
  if (!img.src.startsWith('chrome-extension:')) return;
  const site = new URL(new URL(img.src).searchParams.get('pageUrl')).hostname.split('.').slice(-2).join('.');
  img.src = `https://www.google.com/s2/favicons?domain=${site}&sz=32`;
};
new MutationObserver((records) => {
  for (const { type, target, addedNodes } of records) {
    if (type === 'attributes') fixFavicon(target);
    else for (const node of addedNodes) if (node.querySelectorAll) node.querySelectorAll('img').forEach(fixFavicon);
  }
}).observe(document, { subtree: true, childList: true, attributeFilter: ['src'] });

// popup.js starts listening for input once the bookmarks are loaded, which it marks by filling in the stats.
if (params.has('q')) {
  const typed = setInterval(() => {
    if (!document.getElementById('stats')?.textContent) return;
    clearInterval(typed);
    const input = document.getElementById('q');
    input.value = params.get('q');
    input.dispatchEvent(new Event('input'));
  }, 20);
}
