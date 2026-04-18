// WHY: Rebuild contract — suppressions array on each finder's JSON doc must
// survive write/read roundtrips and merges (new runs must not drop the list).

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createFinderJsonStore } from '../finderJsonStore.js';

const emptySelected = () => ({ colors: [] });

function makeStoreWithTmp() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spf-supp-'));
  const store = createFinderJsonStore({ filePrefix: 'test_finder', emptySelected });
  return { tmpRoot, store };
}

describe('finderJsonStore — suppressions EXTRA_FIELDS', () => {
  let tmpRoot, store;
  beforeEach(() => { ({ tmpRoot, store } = makeStoreWithTmp()); });
  afterEach(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

  it('write then read preserves suppressions array', () => {
    store.write({
      productId: 'p1', productRoot: tmpRoot,
      data: {
        product_id: 'p1', category: 'mouse',
        selected: { colors: [] }, runs: [], run_count: 0, last_ran_at: '',
        suppressions: [
          { item: 'https://bad.com', kind: 'url', variant_id: 'v_black', mode: '' },
          { item: 'bad query', kind: 'query', variant_id: '', mode: '' },
        ],
      },
    });
    const read = store.read({ productId: 'p1', productRoot: tmpRoot });
    assert.equal(read.suppressions.length, 2);
    assert.equal(read.suppressions[0].item, 'https://bad.com');
  });

  it('merge (new run append) carries suppressions forward', () => {
    store.write({
      productId: 'p1', productRoot: tmpRoot,
      data: {
        product_id: 'p1', category: 'mouse',
        selected: { colors: [] }, runs: [], run_count: 0, last_ran_at: '',
        suppressions: [{ item: 'x', kind: 'url', variant_id: '', mode: '' }],
      },
    });
    const merged = store.merge({
      productId: 'p1', productRoot: tmpRoot,
      newDiscovery: { category: 'mouse', last_ran_at: '2026-04-18T00:00:00Z' },
      run: { model: 'm', selected: {}, prompt: {}, response: {} },
    });
    assert.equal(merged.suppressions.length, 1, 'suppressions must survive merge');
    assert.equal(merged.suppressions[0].item, 'x');
    assert.equal(merged.runs.length, 1, 'run was appended');
  });

  it('empty suppressions field defaults gracefully', () => {
    store.write({
      productId: 'p2', productRoot: tmpRoot,
      data: {
        product_id: 'p2', category: 'mouse',
        selected: { colors: [] }, runs: [], run_count: 0, last_ran_at: '',
      },
    });
    const read = store.read({ productId: 'p2', productRoot: tmpRoot });
    // When suppressions was never set, read returns no key — also fine.
    // Important is no throw.
    assert.ok(read);
  });
});
