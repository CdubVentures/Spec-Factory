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

test('resolveInputKey strips existing input prefix from parts to prevent double-nesting', () => {
  const storage = makeStorage();
  const single = storage.resolveInputKey('mouse', 'products');
  const nested = storage.resolveInputKey(single, 'product-1.json');

  assert.ok(nested.startsWith('specs/inputs/'), `missing prefix: ${nested}`);
  assert.ok(!nested.includes('specs/inputs/specs/inputs'), `double prefix: ${nested}`);
  assert.equal(nested, 'specs/inputs/mouse/products/product-1.json');
});

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
