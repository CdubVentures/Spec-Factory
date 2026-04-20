/**
 * createScalarFinderStore — scalar finder JSON store factory tests.
 *
 * Locks the `latestWinsPerVariant` recalc strategy pulled out of RDF:
 * for each variant_id (falling back to variant_key), the newest non-rejected
 * run's candidate replaces any older one. Other variants are preserved.
 *
 * Thin wrapper over createFinderJsonStore — these tests focus on the strategy
 * behavior + factory API + error paths.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createScalarFinderStore } from '../createScalarFinderStore.js';

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'scalar-store-'));
}

function makeCandidate({ variantId, variantKey, value, ranAt, confidence = 85 }) {
  return {
    variant_id: variantId,
    variant_key: variantKey,
    variant_label: (variantKey || '').split(':')[1] || variantKey || '',
    variant_type: (variantKey || '').startsWith('edition:') ? 'edition' : 'color',
    value,
    confidence,
    unknown_reason: '',
    sources: [],
    ran_at: ranAt || new Date().toISOString(),
  };
}

function mergeRun(store, productRoot, productId, candidates, { runStatus, ranAt } = {}) {
  return store.merge({
    productId,
    productRoot,
    newDiscovery: { category: 'mouse', last_ran_at: ranAt || new Date().toISOString() },
    run: {
      model: 'test',
      fallback_used: false,
      selected: { candidates },
      prompt: { system: '', user: '' },
      response: { candidates },
      ...(runStatus ? { status: runStatus } : {}),
    },
  });
}

describe('createScalarFinderStore — factory + file layout', () => {
  it('returns read/write/merge/delete API from createFinderJsonStore', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    for (const fn of ['read', 'write', 'merge', 'deleteRun', 'deleteRuns', 'deleteAll', 'recalculateFromRuns']) {
      assert.equal(typeof store[fn], 'function', `missing ${fn}`);
    }
  });

  it('writes to {productRoot}/{productId}/{filePrefix}.json', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    assert.ok(fs.existsSync(path.join(root, 'p1', 'release_date.json')));
  });

  it('accepts a custom filePrefix', () => {
    const store = createScalarFinderStore({ filePrefix: 'sku_finder' });
    const root = makeTmpRoot();
    mergeRun(store, root, 'p2', [
      makeCandidate({ variantId: 'v_x', variantKey: 'color:x', value: 'ABC-123' }),
    ]);
    assert.ok(fs.existsSync(path.join(root, 'p2', 'sku_finder.json')));
  });
});

describe('createScalarFinderStore — latestWinsPerVariant strategy', () => {
  it('single run persists one candidate', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    const after = mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    assert.equal(after.selected.candidates.length, 1);
    assert.equal(after.selected.candidates[0].value, '2024-03-15');
  });

  it('latest run overrides older candidate on same variant', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    const after = mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-04-01' }),
    ]);
    assert.equal(after.selected.candidates.length, 1);
    assert.equal(after.selected.candidates[0].value, '2024-04-01');
  });

  it('preserves candidates on different variants', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    const after = mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_white', variantKey: 'color:white', value: '2024-03-20' }),
    ]);
    assert.equal(after.selected.candidates.length, 2);
    const values = after.selected.candidates.map((c) => c.value).sort();
    assert.deepEqual(values, ['2024-03-15', '2024-03-20']);
  });

  it('falls back to variant_key when variant_id is missing', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    const after = mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: null, variantKey: 'color:orange', value: '2025-01-01' }),
    ]);
    assert.equal(after.selected.candidates.length, 1);
    assert.equal(after.selected.candidates[0].value, '2025-01-01');
  });

  it('drops candidates with neither variant_id nor variant_key', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    const after = mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: null, variantKey: '', value: 'orphan' }),
    ]);
    assert.equal(after.selected.candidates.length, 0);
  });

  it('rejected run does not overwrite prior selected', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    const after = mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: 'REJECTED' }),
    ], { runStatus: 'rejected' });
    assert.equal(after.selected.candidates[0].value, '2024-03-15', 'rejected run did not overwrite');
    assert.equal(after.runs.length, 2, 'rejected run is still counted');
  });

  it('deleteRun removes a run and recalculates selected', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    const second = mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-04-01' }),
    ]);
    assert.equal(second.selected.candidates[0].value, '2024-04-01');
    const after = store.deleteRun({ productId: 'p1', productRoot: root, runNumber: 2 });
    assert.equal(after.selected.candidates[0].value, '2024-03-15', 'selected rolled back to run #1');
    assert.equal(after.runs.length, 1);
  });

  it('deleteAll preserves file but wipes run history + selected', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    store.deleteAll({ productId: 'p1', productRoot: root });
    const after = store.read({ productId: 'p1', productRoot: root });
    assert.deepEqual(after.selected, { candidates: [] });
    assert.equal(after.runs.length, 0);
  });

  it('read returns null when file does not exist', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    assert.equal(store.read({ productId: 'missing', productRoot: root }), null);
  });

  it('recalculateFromRuns produces same selected as sequential merges', () => {
    const store = createScalarFinderStore({ filePrefix: 'release_date' });
    const root = makeTmpRoot();
    mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ]);
    mergeRun(store, root, 'p1', [
      makeCandidate({ variantId: 'v_white', variantKey: 'color:white', value: '2024-03-20' }),
    ]);
    const existing = store.read({ productId: 'p1', productRoot: root });
    const recalc = store.recalculateFromRuns(existing.runs, 'p1', 'mouse', existing);
    assert.deepEqual(recalc.selected, existing.selected);
  });
});

describe('createScalarFinderStore — error paths', () => {
  it('throws without filePrefix', () => {
    assert.throws(() => createScalarFinderStore({}), /filePrefix required/);
  });

  it('throws on unknown strategy', () => {
    assert.throws(
      () => createScalarFinderStore({ filePrefix: 'x', strategy: 'first-wins' }),
      /unknown strategy/,
    );
  });
});

describe('createScalarFinderStore — parity with RDF hand-written store', () => {
  it('produces the same merge output as mergeReleaseDateDiscovery', async () => {
    const { mergeReleaseDateDiscovery, readReleaseDates } = await import(
      '../../../features/release-date/releaseDateStore.js'
    );
    const store = createScalarFinderStore({ filePrefix: 'release_date' });

    // Run same merge through both
    const rootA = makeTmpRoot();
    const rootB = makeTmpRoot();
    const candidates = [
      makeCandidate({ variantId: 'v_black', variantKey: 'color:black', value: '2024-03-15' }),
    ];

    const factoryResult = mergeRun(store, rootA, 'p1', candidates);
    const rdfResult = mergeReleaseDateDiscovery({
      productId: 'p1',
      productRoot: rootB,
      newDiscovery: { category: 'mouse', last_ran_at: factoryResult.last_ran_at },
      run: {
        model: 'test',
        fallback_used: false,
        selected: { candidates },
        prompt: { system: '', user: '' },
        response: { candidates },
      },
    });

    // selected shapes identical
    assert.deepEqual(factoryResult.selected, rdfResult.selected);
    // run entry shapes identical (ignoring tmproot in file writes)
    assert.deepEqual(factoryResult.runs, rdfResult.runs);
  });
});
