import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../storage.js';

const BASE = path.join(os.tmpdir(), `ls-char-${Date.now()}`);

async function freshStorage() {
  const root = path.join(BASE, `run-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(root, { recursive: true });
  return createStorage({ localInputRoot: root, localOutputRoot: root });
}

// --- writeObject ---

test('writeObject creates parent directories and writes buffer', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/cat/prod/data.json';
  await s.writeObject(key, Buffer.from('{"a":1}'));
  const localPath = s.resolveLocalPath(key);
  const content = await fs.readFile(localPath, 'utf8');
  assert.equal(content, '{"a":1}');
});

test('writeObject overwrites existing file', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/over/write.txt';
  await s.writeObject(key, Buffer.from('first'));
  await s.writeObject(key, Buffer.from('second'));
  const content = await fs.readFile(s.resolveLocalPath(key), 'utf8');
  assert.equal(content, 'second');
});

// --- readText / readJson / readBuffer ---

test('readText returns file contents as utf8 string', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/txt/hello.txt';
  await s.writeObject(key, Buffer.from('hello world'));
  const result = await s.readText(key);
  assert.equal(result, 'hello world');
});

test('readJson parses JSON from file', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/json/data.json';
  await s.writeObject(key, Buffer.from(JSON.stringify({ x: 42 })));
  const result = await s.readJson(key);
  assert.deepEqual(result, { x: 42 });
});

test('readBuffer returns raw Buffer', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/buf/raw.bin';
  const buf = Buffer.from([0x00, 0x01, 0xff]);
  await s.writeObject(key, buf);
  const result = await s.readBuffer(key);
  assert.ok(Buffer.isBuffer(result));
  assert.deepEqual(result, buf);
});

test('readText throws ENOENT for missing file', async () => {
  const s = await freshStorage();
  await assert.rejects(() => s.readText('specs/outputs/missing.txt'), { code: 'ENOENT' });
});

// --- readJsonOrNull ---

test('readJsonOrNull returns null for missing file', async () => {
  const s = await freshStorage();
  const result = await s.readJsonOrNull('specs/outputs/no/such/file.json');
  assert.equal(result, null);
});

test('readJsonOrNull returns null for corrupted JSON', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/bad/corrupt.json';
  await s.writeObject(key, Buffer.from('not valid json {{{'));
  const result = await s.readJsonOrNull(key);
  assert.equal(result, null);
});

test('readJsonOrNull returns parsed object for valid JSON', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/good/valid.json';
  await s.writeObject(key, Buffer.from('{"ok":true}'));
  const result = await s.readJsonOrNull(key);
  assert.deepEqual(result, { ok: true });
});

// --- readTextOrNull ---

test('readTextOrNull returns null for missing file', async () => {
  const s = await freshStorage();
  const result = await s.readTextOrNull('specs/outputs/no/file.txt');
  assert.equal(result, null);
});

test('readTextOrNull returns text for existing file', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/exists/file.txt';
  await s.writeObject(key, Buffer.from('content'));
  const result = await s.readTextOrNull(key);
  assert.equal(result, 'content');
});

// --- objectExists ---

test('objectExists returns false for missing file', async () => {
  const s = await freshStorage();
  const result = await s.objectExists('specs/outputs/ghost.txt');
  assert.equal(result, false);
});

test('objectExists returns true for existing file', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/real/file.txt';
  await s.writeObject(key, Buffer.from('x'));
  const result = await s.objectExists(key);
  assert.equal(result, true);
});

// --- deleteObject ---

test('deleteObject removes existing file', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/del/target.txt';
  await s.writeObject(key, Buffer.from('bye'));
  await s.deleteObject(key);
  const exists = await s.objectExists(key);
  assert.equal(exists, false);
});

test('deleteObject does not throw for missing file', async () => {
  const s = await freshStorage();
  await s.deleteObject('specs/outputs/already/gone.txt');
});

// --- appendText ---

test('appendText creates file if missing and writes text', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/append/new.txt';
  await s.appendText(key, 'first');
  const content = await s.readText(key);
  assert.equal(content, 'first');
});

test('appendText appends to existing file', async () => {
  const s = await freshStorage();
  const key = 'specs/outputs/append/grow.txt';
  await s.appendText(key, 'a');
  await s.appendText(key, 'b');
  const content = await s.readText(key);
  assert.equal(content, 'ab');
});

// --- listKeys ---

test('listKeys returns sorted file keys under prefix', async () => {
  const s = await freshStorage();
  await s.writeObject('specs/outputs/cat/b.txt', Buffer.from('b'));
  await s.writeObject('specs/outputs/cat/a.txt', Buffer.from('a'));
  await s.writeObject('specs/outputs/cat/sub/c.txt', Buffer.from('c'));
  const keys = await s.listKeys('cat');
  assert.deepEqual(keys, ['cat/a.txt', 'cat/b.txt', 'cat/sub/c.txt']);
});

test('listKeys returns empty array for missing directory', async () => {
  const s = await freshStorage();
  const keys = await s.listKeys('nonexistent');
  assert.deepEqual(keys, []);
});

// --- toPosixKey (re-export) ---

test('createStorage returns LocalStorage with expected public API', async () => {
  const s = await freshStorage();
  const methods = [
    'listKeys', 'readJson', 'readText', 'readBuffer',
    'readJsonOrNull', 'readTextOrNull', 'writeObject',
    'appendText', 'objectExists', 'deleteObject',
    'resolveOutputKey', 'resolveLocalPath',
  ];
  for (const m of methods) {
    assert.equal(typeof s[m], 'function', `missing method: ${m}`);
  }
});
