import test from 'node:test';
import assert from 'node:assert/strict';
import {
  outputModernKey,
  outputLegacyKey,
  readJsonDual,
  writeJsonDual,
  writeTextDual,
  writeBufferDual,
  listOutputKeys
} from '../src/publish/publishStorageAdapter.js';

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

test('outputModernKey builds output/ prefixed path', () => {
  assert.equal(outputModernKey(['mouse', 'published', 'p1', 'current.json']), 'output/mouse/published/p1/current.json');
  assert.equal(outputModernKey([]), 'output');
});

test('outputLegacyKey delegates to storage.resolveOutputKey', () => {
  const storage = makeMockStorage();
  assert.equal(outputLegacyKey(storage, ['mouse', 'file.json']), 'legacy/output/mouse/file.json');
});

test('readJsonDual reads modern first, falls back to legacy', async () => {
  const modernData = { 'output/cat/file.json': { source: 'modern' } };
  const storage = makeMockStorage(modernData);
  const result = await readJsonDual(storage, ['cat', 'file.json']);
  assert.deepEqual(result, { source: 'modern' });
});

test('readJsonDual falls back to legacy when modern is null', async () => {
  const legacyData = { 'legacy/output/cat/file.json': { source: 'legacy' } };
  const storage = makeMockStorage(legacyData);
  const result = await readJsonDual(storage, ['cat', 'file.json']);
  assert.deepEqual(result, { source: 'legacy' });
});

test('readJsonDual returns null when neither exists', async () => {
  const storage = makeMockStorage();
  const result = await readJsonDual(storage, ['cat', 'file.json']);
  assert.equal(result, null);
});

test('writeJsonDual writes to both modern and legacy paths', async () => {
  const storage = makeMockStorage();
  await writeJsonDual(storage, ['cat', 'data.json'], { a: 1 });
  assert.equal(storage.written.length, 2);
  assert.equal(storage.written[0].key, 'output/cat/data.json');
  assert.equal(storage.written[1].key, 'legacy/output/cat/data.json');
  assert.equal(storage.written[0].opts.contentType, 'application/json');
});

test('writeTextDual writes text to both paths', async () => {
  const storage = makeMockStorage();
  await writeTextDual(storage, ['cat', 'file.txt'], 'hello');
  assert.equal(storage.written.length, 2);
  assert.equal(storage.written[0].key, 'output/cat/file.txt');
});

test('writeBufferDual writes buffer to both paths', async () => {
  const storage = makeMockStorage();
  const buf = Buffer.from('binary');
  await writeBufferDual(storage, ['cat', 'file.bin'], buf);
  assert.equal(storage.written.length, 2);
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
