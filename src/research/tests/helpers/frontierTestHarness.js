export const FRONTIER_KEY = 'specs/outputs/_intel/frontier/frontier.json';

export function createMemoryFrontierStorage(initial = {}) {
  const data = new Map(Object.entries(initial));

  return {
    resolveOutputKey: (...parts) => parts.filter(Boolean).join('/'),
    async readJsonOrNull(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async writeObject(key, body) {
      data.set(key, JSON.parse(Buffer.from(body).toString('utf8')));
    },
    snapshot(key) {
      return data.get(key);
    },
    keys() {
      return [...data.keys()];
    },
  };
}
