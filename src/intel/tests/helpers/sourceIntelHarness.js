export function makeMemoryStorage(prefix = 'specs/outputs') {
  const map = new Map();

  return {
    resolveOutputKey(...parts) {
      return [prefix, ...parts].join('/');
    },
    async readJsonOrNull(key) {
      const raw = map.get(key);
      return raw ? JSON.parse(raw.toString('utf8')) : null;
    },
    async writeObject(key, body) {
      map.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body));
    },
    getMap() {
      return map;
    },
  };
}
