import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './fake-chrome.js';
import { loadBookmarks, rank, matchedOffsets, openUrl, prunePins, pruneUsage } from '../search.js';

// Loads bookmarks into the fake tree and returns the titles rank puts first for query.
async function search(tree, query, usage = {}) {
  installFakeChrome({ tree });
  return rank(await loadBookmarks(), usage, query).map((b) => b.title);
}

const bookmark = (title, url = `https://example.com/${encodeURIComponent(title)}`) => ({ title, url });

describe('rank', () => {
  test('"pu1" finds "PROD US-01 Dashboard" first', async () => {
    const titles = await search({
      'Bookmarks Bar': [
        bookmark('Pull requests'),
        bookmark('Public holidays 2021'),
        bookmark('PROD US-01 Dashboard'),
        bookmark('Puppet runbook'),
      ],
    }, 'pu1');
    assert.equal(titles[0], 'PROD US-01 Dashboard');
  });

  test('"gh" ranks "GitHub" above "Grafana Health"', async () => {
    const titles = await search({
      'Bookmarks Bar': [
        bookmark('Grafana Health', 'https://grafana.example.com/health'),
        bookmark('GitHub', 'https://github.com/'),
      ],
    }, 'gh');
    assert.ok(titles.indexOf('GitHub') < titles.indexOf('Grafana Health'), titles.join(', '));
  });

  test('"work" ranks a title match above a folder match', async () => {
    const titles = await search({
      'Bookmarks Bar': [
        { title: 'Work', children: [bookmark('Jira board')] },
        bookmark('Work log'),
      ],
    }, 'work');
    assert.deepEqual(titles, ['Work log', 'Jira board']);
  });

  test('"log" ranks a match at the start of a word above one inside a word', async () => {
    const titles = await search({ 'Bookmarks Bar': [bookmark('Blog'), bookmark('Login page')] }, 'log');
    assert.deepEqual(titles, ['Login page', 'Blog']);
  });

  test('"github" finds a bookmark by its site address', async () => {
    const titles = await search({
      'Bookmarks Bar': [
        bookmark('Code reviews', 'https://github.com/pulls'),
        bookmark('Team calendar', 'https://calendar.example.com/'),
      ],
    }, 'github');
    assert.deepEqual(titles, ['Code reviews']);
  });

  test('more opens break a tie between equal matches', async () => {
    const now = Date.now();
    installFakeChrome({ tree: { 'Bookmarks Bar': [bookmark('Docs A'), bookmark('Docs B')] } });
    const bookmarks = await loadBookmarks();
    const usage = { [bookmarks[1].url]: { score: 5, last: now } };
    assert.deepEqual(rank(bookmarks, usage, 'docs', now).map((b) => b.title), ['Docs B', 'Docs A']);
  });

  test('an empty query lists only used bookmarks, most used first', async () => {
    const now = Date.now();
    installFakeChrome({ tree: { 'Bookmarks Bar': [bookmark('A'), bookmark('B'), bookmark('C')] } });
    const [a, b] = await loadBookmarks();
    const usage = { [a.url]: { score: 1, last: now }, [b.url]: { score: 3, last: now } };
    assert.deepEqual(rank([a, b], usage, '', now).map((x) => x.title), ['B', 'A']);
  });
});

describe('non-Latin titles and accents', () => {
  const tree = {
    'Bookmarks Bar': [
      bookmark('Новости дня'),
      bookmark('ガイドブック'),
      bookmark('Λογαριασμός τράπεζας'),
      bookmark('Café São Paulo'),
      bookmark('Unrelated'),
    ],
  };

  test('Cyrillic', async () => {
    assert.equal((await search(tree, 'новости'))[0], 'Новости дня');
  });

  test('Japanese, including letters with dakuten', async () => {
    assert.equal((await search(tree, 'ガイド'))[0], 'ガイドブック');
  });

  test('Greek, with or without final sigma and accents', async () => {
    assert.equal((await search(tree, 'λογαριασμός'))[0], 'Λογαριασμός τράπεζας');
    assert.equal((await search(tree, 'λογαριασμοσ'))[0], 'Λογαριασμός τράπεζας');
    assert.equal((await search(tree, 'τραπεζα'))[0], 'Λογαριασμός τράπεζας');
  });

  test('"cafe sao" finds "Café São Paulo"', async () => {
    assert.deepEqual(await search(tree, 'cafe sao'), ['Café São Paulo']);
  });
});

test('an untitled bookmark with a 500k-character data: URL does not break search', async () => {
  const url = 'data:text/plain,' + 'x'.repeat(500_000);
  installFakeChrome({ tree: { 'Bookmarks Bar': [{ title: '', url }, bookmark('Data warehouse')] } });
  const bookmarks = await loadBookmarks();
  const titles = rank(bookmarks, {}, 'data').map((b) => b.title);
  assert.equal(titles.length, 2);
  assert.equal(titles[0], 'Data warehouse');
  const untitled = bookmarks.find((b) => b.url === url);
  assert.deepEqual([...matchedOffsets(untitled, 'data')[1]].sort(), [0, 1, 2, 3]);
});

describe('matchedOffsets', () => {
  // [folder, title, site] offsets as sorted arrays, for comparing.
  const offsets = (b, query) => matchedOffsets(b, query).map((set) => [...set].sort((x, y) => x - y));

  async function load(title, url, folder) {
    const item = bookmark(title, url);
    installFakeChrome({ tree: { 'Bookmarks Bar': folder ? [{ title: folder, children: [item] }] : [item] } });
    return (await loadBookmarks())[0];
  }

  test('highlights word starts in the title', async () => {
    assert.deepEqual(offsets(await load('PROD US-01 Dashboard'), 'pu1'), [[], [0, 5, 9], []]);
    assert.deepEqual(offsets(await load('GitHub', 'https://github.com/'), 'gh'), [[], [0, 3], []]);
  });

  test('highlights the folder and the site', async () => {
    assert.deepEqual(offsets(await load('Jira board', 'https://x.com/', 'Work'), 'work'), [[0, 1, 2, 3], [], []]);
    assert.deepEqual(offsets(await load('Code reviews', 'https://www.github.com/pulls'), 'github'),
      [[], [], [0, 1, 2, 3, 4, 5]]);
  });

  test('offsets point into the original text, past accents and separators', async () => {
    assert.deepEqual(offsets(await load('Café São Paulo'), 'cafe sao'), [[], [0, 1, 2, 3, 5, 6, 7], []]);
  });

  test('letters outside the BMP such as 𝒳', async () => {
    // 𝒳 takes two UTF-16 units, so "b" is at offset 5, not 4.
    assert.deepEqual(offsets(await load('a 𝒳 b'), '𝒳b'), [[], [2, 5], []]);
  });

  test('no highlights for a token that does not match', async () => {
    assert.deepEqual(offsets(await load('GitHub'), 'zzz'), [[], [], []]);
  });
});

describe('openUrl', () => {
  const URL = 'https://example.com/page';

  test('with switching on, prefers a tab in the focused window', async () => {
    const { calls } = installFakeChrome({
      windows: [{ id: 1, focused: false, incognito: false }, { id: 2, focused: true, incognito: false }],
      tabs: [
        { id: 10, windowId: 1, url: URL, lastAccessed: 200, incognito: false },
        { id: 20, windowId: 2, url: URL, lastAccessed: 100, incognito: false },
      ],
    });
    await openUrl(URL, 'newForegroundTab', { switchToOpen: true });
    assert.deepEqual(calls.filter(([c]) => c !== 'storage.set'), [['tabs.update', 20, { active: true }]]);
  });

  test('with switching on, uses the most recently used tab and focuses its window', async () => {
    const { calls } = installFakeChrome({
      windows: [{ id: 1, focused: true, incognito: false }, { id: 2, focused: false, incognito: false }],
      tabs: [
        { id: 20, windowId: 2, url: URL, lastAccessed: 100, incognito: false },
        { id: 21, windowId: 2, url: URL, lastAccessed: 300, incognito: false },
      ],
    });
    await openUrl(URL, 'newForegroundTab', { switchToOpen: true });
    assert.deepEqual(calls.filter(([c]) => c !== 'storage.set'), [
      ['tabs.update', 21, { active: true }],
      ['windows.update', 2, { focused: true }],
    ]);
  });

  test('ignores #fragment and trailing-slash differences', async () => {
    for (const tabUrl of [URL + '#section', URL + '/', URL + '/#top']) {
      const { calls } = installFakeChrome({ tabs: [{ id: 5, windowId: 1, url: tabUrl, incognito: false }] });
      await openUrl(URL, 'newForegroundTab', { switchToOpen: true });
      assert.deepEqual(calls.filter(([c]) => c !== 'storage.set'), [['tabs.update', 5, { active: true }]], tabUrl);
    }
  });

  test('finds a tab that is still loading', async () => {
    const { calls } = installFakeChrome({
      tabs: [{ id: 5, windowId: 1, url: '', pendingUrl: URL, incognito: false }],
    });
    await openUrl(URL, 'newForegroundTab', { switchToOpen: true });
    assert.deepEqual(calls.filter(([c]) => c !== 'storage.set'), [['tabs.update', 5, { active: true }]]);
  });

  test('does not switch between private and normal windows', async () => {
    const { calls } = installFakeChrome({
      windows: [{ id: 1, focused: true, incognito: false }, { id: 2, focused: false, incognito: true }],
      tabs: [{ id: 5, windowId: 2, url: URL, incognito: true }],
    });
    await openUrl(URL, 'newForegroundTab', { switchToOpen: true });
    assert.deepEqual(calls.filter(([c]) => c !== 'storage.set'), [['tabs.create', { url: URL, active: true }]]);

    const fromPrivate = installFakeChrome({
      windows: [{ id: 1, focused: false, incognito: false }, { id: 2, focused: true, incognito: true }],
      tabs: [{ id: 5, windowId: 1, url: URL, incognito: false }],
    });
    await openUrl(URL, 'newForegroundTab', { switchToOpen: true });
    assert.deepEqual(fromPrivate.calls.filter(([c]) => c !== 'storage.set'), [['tabs.create', { url: URL, active: true }]]);
  });

  test('with switching off, opens a new tab even if one is open', async () => {
    const { calls } = installFakeChrome({ tabs: [{ id: 5, windowId: 1, url: URL, incognito: false }] });
    await openUrl(URL);
    assert.deepEqual(calls.filter(([c]) => c !== 'storage.set'), [['tabs.create', { url: URL, active: true }]]);
  });

  test('new window, background tab and current tab', async () => {
    let fake = installFakeChrome();
    await openUrl(URL, 'newWindow');
    assert.deepEqual(fake.calls.filter(([c]) => c !== 'storage.set'), [['windows.create', { url: URL, focused: true }]]);

    fake = installFakeChrome();
    await openUrl(URL, 'newBackgroundTab');
    assert.deepEqual(fake.calls.filter(([c]) => c !== 'storage.set'), [['tabs.create', { url: URL, active: false }]]);

    fake = installFakeChrome({ tabs: [{ id: 7, windowId: 1, url: 'https://other.example/', active: true, incognito: false }] });
    await openUrl(URL, 'currentTab');
    assert.deepEqual(fake.calls.filter(([c]) => c !== 'storage.set'), [['tabs.update', 7, { url: URL }]]);
  });

  test('records the open', async () => {
    const { storage } = installFakeChrome();
    await openUrl(URL);
    await openUrl(URL);
    assert.ok(storage.usage[URL].score > 1.99 && storage.usage[URL].score <= 2);
  });
});

describe('prunePins and pruneUsage', () => {
  const live = [{ url: 'https://a.example/' }, { url: 'https://b.example/' }];
  const stale = 'https://gone.example/';

  test('prunePins drops pins that are no longer bookmarked, keeping their order', async () => {
    const { storage } = installFakeChrome({ storage: { pins: ['https://b.example/', stale, 'https://a.example/'] } });
    assert.deepEqual(await prunePins(live), ['https://b.example/', 'https://a.example/']);
    assert.deepEqual(storage.pins, ['https://b.example/', 'https://a.example/']);
  });

  test('prunePins does not write when nothing changed', async () => {
    const { calls } = installFakeChrome({ storage: { pins: ['https://a.example/'] } });
    assert.deepEqual(await prunePins(live), ['https://a.example/']);
    assert.deepEqual(calls, []);
  });

  test('pruneUsage drops history for URLs that are no longer bookmarked', async () => {
    const entry = { score: 1, last: 0 };
    const { storage } = installFakeChrome({ storage: { usage: { 'https://a.example/': entry, [stale]: entry } } });
    assert.deepEqual(await pruneUsage(live), { 'https://a.example/': entry });
    assert.deepEqual(storage.usage, { 'https://a.example/': entry });
  });

  test('pruneUsage does not write when nothing changed', async () => {
    const { calls } = installFakeChrome({ storage: { usage: { 'https://a.example/': { score: 1, last: 0 } } } });
    await pruneUsage(live);
    assert.deepEqual(calls, []);
  });
});
