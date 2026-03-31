import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../storage.js';

const tmpdir = path.join(os.tmpdir(), `storage-guard-test-${Date.now()}`);

function makeStorage() {
  return createStorage({
    localInputRoot: tmpdir,
    localOutputRoot: tmpdir,
  });
}

test('resolveOutputKey strips existing output prefix from parts to prevent double-nesting', () => {
  const storage = makeStorage();
  const single = storage.resolveOutputKey('_runtime', 'traces');
  const nested = storage.resolveOutputKey(single, 'runs', 'run-1', 'llm', 'call.json');

  assert.ok(nested.startsWith('specs/outputs/'), `missing prefix: ${nested}`);
  assert.ok(!nested.includes('specs/outputs/specs/outputs'), `double prefix: ${nested}`);
  assert.equal(nested, 'specs/outputs/_runtime/traces/runs/run-1/llm/call.json');
});

// WHY: resolveInputKey test removed — INPUT_KEY_PREFIX and input paths eliminated.

test('resolveOutputKey passes through parts that do not start with prefix', () => {
  const storage = makeStorage();
  const key = storage.resolveOutputKey('_billing', 'ledger', '2026-03.jsonl');

  assert.equal(key, 'specs/outputs/_billing/ledger/2026-03.jsonl');
});

test('resolveOutputKey handles empty and falsy parts', () => {
  const storage = makeStorage();
  const key = storage.resolveOutputKey('', null, undefined, 'data.json');

  assert.ok(key.startsWith('specs/outputs/'));
  assert.ok(key.endsWith('data.json'));
});

test('resolveLocalPath strips output prefix from key to prevent double-nesting', () => {
  const storage = makeStorage();
  const key = storage.resolveOutputKey('_billing', 'monthly', '2026-03.txt');

  assert.equal(key, 'specs/outputs/_billing/monthly/2026-03.txt');

  const localPath = storage.resolveLocalPath(key);
  const expected = path.join(tmpdir, '_billing', 'monthly', '2026-03.txt');

  assert.equal(localPath, expected, `double-nested: ${localPath}`);
  assert.ok(!localPath.includes('specs'), `path should not contain S3 prefix segments: ${localPath}`);
});

test('resolveLocalPath passes through keys without output prefix unchanged', () => {
  const storage = makeStorage();
  const localPath = storage.resolveLocalPath('_billing/latest.txt');
  const expected = path.join(tmpdir, '_billing', 'latest.txt');

  assert.equal(localPath, expected);
});
