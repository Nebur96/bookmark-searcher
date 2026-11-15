// A stand-in for the parts of the chrome extension API that search.js uses, so it can run in Node.

// tree: the bookmark folders under the root, e.g. { 'Bookmarks Bar': [{ title, url }, { title: 'Work', children: [...] }] }.
// windows: [{ id, focused, incognito }]; tabs: [{ id, windowId, url, pendingUrl, active, lastAccessed, incognito }].
export function installFakeChrome({ tree = {}, storage = {}, windows = [{ id: 1, focused: true, incognito: false }], tabs = [] } = {}) {
  let nextId = 1;
  const toNode = (item, parentId) => {
    const id = String(nextId++);
    if (!item.children) return { id, parentId, title: item.title, url: item.url };
    return { id, parentId, title: item.title, children: item.children.map((c) => toNode(c, id)) };
  };
  const root = { id: String(nextId++), title: '', children: [] };
  for (const [title, children] of Object.entries(tree)) root.children.push(toNode({ title, children }, root.id));

  const calls = [];
  const data = structuredClone(storage);
  const win = (id) => windows.find((w) => w.id === id);

  globalThis.chrome = {
    bookmarks: {
      getTree: async () => [root],
    },
    storage: {
      local: {
        get: async (key) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
        set: async (items) => { calls.push(['storage.set', items]); Object.assign(data, structuredClone(items)); },
        remove: async (key) => { calls.push(['storage.remove', key]); delete data[key]; },
      },
    },
    tabs: {
      query: async ({ active, currentWindow } = {}) => {
        const focused = windows.find((w) => w.focused);
        return tabs.filter((t) => (active === undefined || t.active === active) &&
          (!currentWindow || t.windowId === focused.id));
      },
      update: async (id, props) => { calls.push(['tabs.update', id, props]); },
      create: async (props) => { calls.push(['tabs.create', props]); },
    },
    windows: {
      getLastFocused: async () => win(windows.find((w) => w.focused).id),
      update: async (id, props) => { calls.push(['windows.update', id, props]); },
      create: async (props) => { calls.push(['windows.create', props]); },
    },
  };
  return { root, calls, storage: data };
}
