import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readJsonDoc, writeJsonDoc } from '../curationPersistence.js';

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'curation-persist-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('readJsonDoc returns parsed JSON when file exists', async () => {
  await withTempDir(async (dir) => {
    const p = path.join(dir, 'doc.json');
    await fs.writeFile(p, JSON.stringify({ version: 1, items: [1, 2] }));
    const result = await readJsonDoc(p, () => ({ fallback: true }));
    assert.equal(result.version, 1);
    assert.deepEqual(result.items, [1, 2]);
  });
});

test('readJsonDoc returns default when file missing (ENOENT)', async () => {
  await withTempDir(async (dir) => {
    const p = path.join(dir, 'missing.json');
    const result = await readJsonDoc(p, () => ({ fallback: true }));
    assert.deepEqual(result, { fallback: true });
  });
});

test('readJsonDoc returns default when file contains non-object JSON', async () => {
  await withTempDir(async (dir) => {
    const p = path.join(dir, 'bad.json');
    await fs.writeFile(p, '"just a string"');
    const result = await readJsonDoc(p, () => ({ fallback: true }));
    assert.deepEqual(result, { fallback: true });
  });
});

test('readJsonDoc throws on invalid JSON (parse error)', async () => {
  await withTempDir(async (dir) => {
    const p = path.join(dir, 'corrupt.json');
    await fs.writeFile(p, '{{{not json');
    await assert.rejects(
      () => readJsonDoc(p, () => ({})),
      { name: 'SyntaxError' }
    );
  });
});

test('writeJsonDoc creates directories and writes formatted JSON', async () => {
  await withTempDir(async (dir) => {
    const p = path.join(dir, 'sub', 'deep', 'doc.json');
    await writeJsonDoc(p, { version: 1, data: 'ok' });
    const raw = await fs.readFile(p, 'utf8');
    assert.equal(raw.endsWith('\n'), true);
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.data, 'ok');
  });
});
