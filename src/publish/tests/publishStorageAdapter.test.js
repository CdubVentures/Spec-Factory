import test from 'node:test';
import assert from 'node:assert/strict';
import {
  outputKey,
  readJson,
  writeJson,
  writeText,
  writeBuffer,
  listOutputKeys
} from '../publishStorageAdapter.js';

function makeMockStorage(data = {}) {
  const written = [];
  return {
    written,
    resolveOutputKey(...parts) {
      return `legacy/${parts.join('/')}`;
    },
    async readJsonOrNull(key) {
      return data[key] || null;
    },
    async readTextOrNull(key) {
      return data[key] || null;
    },
    async writeObject(key, body, opts) {
      written.push({ key, body, opts });
    },
    async listKeys(prefix) {
      return Object.keys(data).filter((k) => k.startsWith(prefix));
    }
  };
}

test('outputKey builds output/ prefixed path', () => {
  assert.equal(outputKey(['mouse', 'published', 'p1', 'current.json']), 'output/mouse/published/p1/current.json');
  assert.equal(outputKey([]), 'output');
});

test('readJson reads from modern path', async () => {
  const modernData = { 'output/cat/file.json': { source: 'modern' } };
  const storage = makeMockStorage(modernData);
  const result = await readJson(storage, ['cat', 'file.json']);
  assert.deepEqual(result, { source: 'modern' });
});

test('readJson returns null when not found', async () => {
  const storage = makeMockStorage();
  const result = await readJson(storage, ['cat', 'file.json']);
  assert.equal(result, null);
});

test('writeJson writes to modern path only', async () => {
  const storage = makeMockStorage();
  await writeJson(storage, ['cat', 'data.json'], { a: 1 });
  assert.equal(storage.written.length, 1);
  assert.equal(storage.written[0].key, 'output/cat/data.json');
  assert.equal(storage.written[0].opts.contentType, 'application/json');
});

test('writeText writes text to modern path only', async () => {
  const storage = makeMockStorage();
  await writeText(storage, ['cat', 'file.txt'], 'hello');
  assert.equal(storage.written.length, 1);
  assert.equal(storage.written[0].key, 'output/cat/file.txt');
});

test('writeBuffer writes buffer to modern path only', async () => {
  const storage = makeMockStorage();
  const buf = Buffer.from('binary');
  await writeBuffer(storage, ['cat', 'file.bin'], buf);
  assert.equal(storage.written.length, 1);
  assert.equal(storage.written[0].opts.contentType, 'application/octet-stream');
});

test('listOutputKeys deduplicates and sorts across prefixes', async () => {
  const data = {
    'output/cat/a.json': true,
    'output/cat/b.json': true,
    'legacy/output/cat/b.json': true,
    'legacy/output/cat/c.json': true
  };
  const storage = makeMockStorage(data);
  const result = await listOutputKeys(storage, ['cat']);
  // Dedup is by exact key string — different prefixes are distinct keys
  assert.deepEqual(result, [
    'legacy/output/cat/b.json',
    'legacy/output/cat/c.json',
    'output/cat/a.json',
    'output/cat/b.json'
  ]);
});

test('listOutputKeys deduplicates truly duplicate keys', async () => {
  const data = {
    'output/cat/same.json': true
  };
  const storage = {
    resolveOutputKey(...parts) {
      // Legacy prefix resolves to same path as modern
      return parts.join('/');
    },
    async listKeys(prefix) {
      return Object.keys(data).filter((k) => k.startsWith(prefix));
    }
  };
  const result = await listOutputKeys(storage, ['cat']);
  assert.deepEqual(result, ['output/cat/same.json']);
});
