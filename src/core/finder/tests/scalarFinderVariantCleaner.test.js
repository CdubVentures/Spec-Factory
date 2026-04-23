/**
 * scalarFinderVariantCleaner — per-variant JSON + SQL cleanup dispatcher.
 *
 * Asserts:
 *   - clears the variant's entry from release_date.json / sku.json
 *   - mirrors the new candidates list into the SQL summary
 *   - leaves run records in the JSON untouched (historical runs preserved)
 *   - no-op for non-scalar-finder field keys
 *   - no-op when variantId is empty
 *   - safe when specDb has no getFinderStore (SQL update skipped gracefully)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  clearScalarFinderVariant,
  deleteScalarFinderVariantRuns,
  isScalarFinderField,
} from '../scalarFinderVariantCleaner.js';
import { releaseDateFinderStore } from '../../../features/release-date/releaseDateStore.js';

function makeTempRoot(prefix = 'cleaner-test') {
  const root = path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function seedReleaseDateFinder({ productRoot, productId, candidates, runs = [] }) {
  const dir = path.join(productRoot, productId);
  fs.mkdirSync(dir, { recursive: true });
  const doc = {
    product_id: productId,
    category: 'mouse',
    selected: { candidates },
    runs,
    run_count: runs.length,
    next_run_number: runs.length + 1,
    last_ran_at: runs.length > 0 ? runs[runs.length - 1].ran_at : '',
  };
  releaseDateFinderStore.write({ productId, productRoot, data: doc });
  return doc;
}

function makeSpecDbStub({ hasFinderStore = true } = {}) {
  const upsertCalls = [];
  const summaries = new Map();
  const removeRunCalls = [];
  const sqlStore = {
    get: (pid) => summaries.get(pid) || null,
    upsert: (row) => { upsertCalls.push(row); summaries.set(row.product_id, row); },
    insertRun: () => {},
    removeRun: (pid, runNumber) => { removeRunCalls.push({ pid, runNumber }); },
  };
  return {
    category: 'mouse',
    getFinderStore: hasFinderStore ? (id) => (id === 'releaseDateFinder' || id === 'skuFinder' ? sqlStore : null) : undefined,
    _test: { upsertCalls, summaries, removeRunCalls },
  };
}

function makeRun({ runNumber, variantId, variantKey, value, urls = [], queries = [] }) {
  return {
    run_number: runNumber,
    ran_at: `2025-10-${String(runNumber).padStart(2, '0')}T00:00:00Z`,
    model: 'gpt-5',
    fallback_used: false,
    selected: {
      candidates: [{ variant_id: variantId, variant_key: variantKey, variant_label: variantKey, value, confidence: 90 }],
    },
    prompt: {},
    response: {
      variant_id: variantId,
      variant_key: variantKey,
      value,
      discovery_log: { urls_checked: urls, queries_run: queries },
    },
  };
}

describe('isScalarFinderField', () => {
  it('returns true for release_date', () => {
    assert.equal(isScalarFinderField('release_date'), true);
  });
  it('returns true for sku', () => {
    assert.equal(isScalarFinderField('sku'), true);
  });
  it('returns false for non-scalar fields', () => {
    assert.equal(isScalarFinderField('color'), false);
    assert.equal(isScalarFinderField('weight'), false);
    assert.equal(isScalarFinderField(''), false);
    assert.equal(isScalarFinderField(null), false);
  });
});

describe('clearScalarFinderVariant', () => {
  it('clears the matching variant from release_date.json selected.candidates[]', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));

    seedReleaseDateFinder({
      productRoot,
      productId: 'mouse-001',
      candidates: [
        { variant_id: 'v_black', variant_key: 'black', variant_label: 'Black', value: '2025-11-11', confidence: 92 },
        { variant_id: 'v_white', variant_key: 'white', variant_label: 'White', value: '2025-12-01', confidence: 88 },
      ],
    });
    const specDb = makeSpecDbStub();

    const result = clearScalarFinderVariant({
      specDb,
      productId: 'mouse-001',
      productRoot,
      fieldKey: 'release_date',
      variantId: 'v_black',
    });

    assert.equal(result.cleaned, true);
    assert.equal(result.finderId, 'releaseDateFinder');
    assert.equal(result.candidates_after, 1);

    const doc = releaseDateFinderStore.read({ productId: 'mouse-001', productRoot });
    assert.equal(doc.selected.candidates.length, 1, 'v_black candidate filtered out');
    assert.equal(doc.selected.candidates[0].variant_id, 'v_white', 'v_white preserved');
  });

  it('mirrors candidate list into SQL summary via upsert', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));

    seedReleaseDateFinder({
      productRoot,
      productId: 'mouse-001',
      candidates: [
        { variant_id: 'v_black', variant_key: 'black', variant_label: 'Black', value: '2025-11-11', confidence: 92 },
        { variant_id: 'v_white', variant_key: 'white', variant_label: 'White', value: '2025-12-01', confidence: 88 },
      ],
    });
    const specDb = makeSpecDbStub();

    clearScalarFinderVariant({
      specDb, productId: 'mouse-001', productRoot,
      fieldKey: 'release_date', variantId: 'v_black',
    });

    assert.equal(specDb._test.upsertCalls.length, 1);
    const row = specDb._test.upsertCalls[0];
    assert.equal(row.product_id, 'mouse-001');
    assert.equal(row.candidate_count, 1);
    assert.equal(row.candidates.length, 1);
    assert.equal(row.candidates[0].variant_id, 'v_white');
  });

  it('no-op for non-scalar-finder field keys', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));
    const specDb = makeSpecDbStub();

    const result = clearScalarFinderVariant({
      specDb, productId: 'mouse-001', productRoot,
      fieldKey: 'color', variantId: 'v_black',
    });

    assert.equal(result.cleaned, false);
    assert.equal(specDb._test.upsertCalls.length, 0);
  });

  it('no-op when variantId is empty', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));
    const specDb = makeSpecDbStub();

    const result = clearScalarFinderVariant({
      specDb, productId: 'mouse-001', productRoot,
      fieldKey: 'release_date', variantId: '',
    });
    assert.equal(result.cleaned, false);
  });

  it('no-op when the JSON store has no matching candidate', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));

    seedReleaseDateFinder({
      productRoot,
      productId: 'mouse-001',
      candidates: [
        { variant_id: 'v_white', variant_key: 'white', variant_label: 'White', value: '2025-12-01', confidence: 88 },
      ],
    });
    const specDb = makeSpecDbStub();

    const result = clearScalarFinderVariant({
      specDb, productId: 'mouse-001', productRoot,
      fieldKey: 'release_date', variantId: 'v_black', // not present
    });
    assert.equal(result.cleaned, false);
    assert.equal(specDb._test.upsertCalls.length, 0, 'no SQL upsert when nothing changed');
  });

  it('safe when specDb has no getFinderStore (JSON still cleaned)', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));

    seedReleaseDateFinder({
      productRoot,
      productId: 'mouse-001',
      candidates: [
        { variant_id: 'v_black', variant_key: 'black', variant_label: 'Black', value: '2025-11-11', confidence: 92 },
      ],
    });
    const specDb = makeSpecDbStub({ hasFinderStore: false });

    const result = clearScalarFinderVariant({
      specDb, productId: 'mouse-001', productRoot,
      fieldKey: 'release_date', variantId: 'v_black',
    });

    assert.equal(result.cleaned, true, 'JSON cleanup still reports changed');
    const doc = releaseDateFinderStore.read({ productId: 'mouse-001', productRoot });
    assert.equal(doc.selected.candidates.length, 0);
  });

  it('run records in the JSON are NOT touched by clearScalarFinderVariant', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));

    const runEntry = {
      run_number: 1,
      ran_at: '2025-10-01T00:00:00Z',
      model: 'gpt-5',
      fallback_used: false,
      selected: {
        candidates: [
          { variant_id: 'v_black', variant_key: 'black', variant_label: 'Black', value: '2025-11-11', confidence: 92 },
        ],
      },
      prompt: {},
      response: {},
    };
    seedReleaseDateFinder({
      productRoot,
      productId: 'mouse-001',
      candidates: [{ variant_id: 'v_black', variant_key: 'black', variant_label: 'Black', value: '2025-11-11', confidence: 92 }],
      runs: [runEntry],
    });
    const specDb = makeSpecDbStub();

    clearScalarFinderVariant({
      specDb, productId: 'mouse-001', productRoot,
      fieldKey: 'release_date', variantId: 'v_black',
    });

    const doc = releaseDateFinderStore.read({ productId: 'mouse-001', productRoot });
    assert.equal(doc.runs.length, 1, 'run preserved');
    assert.equal(doc.runs[0].selected.candidates.length, 1, 'run.selected.candidates not scrubbed');
    assert.equal(doc.runs[0].selected.candidates[0].variant_id, 'v_black', 'historical run data intact');
  });
});

describe('deleteScalarFinderVariantRuns', () => {
  it('deletes runs matching variant_id from JSON + SQL, re-upserts summary', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));

    const productId = 'mouse-001';
    // Seed 3 runs: 2 for v_black (the one we'll wipe), 1 for v_white (untouched)
    releaseDateFinderStore.merge({
      productId, productRoot,
      newDiscovery: { category: 'mouse', last_ran_at: '2025-10-01T00:00:00Z' },
      run: makeRun({ runNumber: 1, variantId: 'v_black', variantKey: 'black', value: '2025-11-11',
        urls: ['https://razer.com/black-1', 'https://support.razer.com/black'], queries: ['black release date'] }),
    });
    releaseDateFinderStore.merge({
      productId, productRoot,
      newDiscovery: { category: 'mouse', last_ran_at: '2025-10-02T00:00:00Z' },
      run: makeRun({ runNumber: 2, variantId: 'v_white', variantKey: 'white', value: '2025-12-01',
        urls: ['https://razer.com/white'], queries: ['white release date'] }),
    });
    releaseDateFinderStore.merge({
      productId, productRoot,
      newDiscovery: { category: 'mouse', last_ran_at: '2025-10-03T00:00:00Z' },
      run: makeRun({ runNumber: 3, variantId: 'v_black', variantKey: 'black', value: '2025-11-11',
        urls: ['https://razer.com/black-2'], queries: ['black release date confirmed'] }),
    });

    const specDb = makeSpecDbStub();

    const result = deleteScalarFinderVariantRuns({
      specDb, productId, productRoot,
      fieldKey: 'release_date', variantId: 'v_black',
    });

    assert.equal(result.cleaned, true);
    assert.equal(result.finderId, 'releaseDateFinder');
    assert.deepEqual([...result.deletedRuns].sort((a, b) => a - b), [1, 3], 'both v_black runs deleted');
    assert.equal(result.candidates_after, 1, 'only v_white candidate remains');

    // JSON: only v_white's run + candidate remain
    const doc = releaseDateFinderStore.read({ productId, productRoot });
    assert.equal(doc.runs.length, 1);
    assert.equal(doc.runs[0].response.variant_id, 'v_white');
    assert.equal(doc.selected.candidates.length, 1);
    assert.equal(doc.selected.candidates[0].variant_id, 'v_white');

    // SQL: sqlStore.removeRun called for both v_black runs
    const removedRunNumbers = specDb._test.removeRunCalls.map((c) => c.runNumber).sort((a, b) => a - b);
    assert.deepEqual(removedRunNumbers, [1, 3]);

    // SQL: summary upsert with only v_white's candidate
    assert.equal(specDb._test.upsertCalls.length, 1);
    const row = specDb._test.upsertCalls[0];
    assert.equal(row.candidate_count, 1);
    assert.equal(row.candidates[0].variant_id, 'v_white');
  });

  it('no-op when variantId has no matching runs', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));

    releaseDateFinderStore.merge({
      productId: 'mouse-001', productRoot,
      newDiscovery: { category: 'mouse', last_ran_at: '2025-10-01T00:00:00Z' },
      run: makeRun({ runNumber: 1, variantId: 'v_white', variantKey: 'white', value: '2025-12-01' }),
    });
    const specDb = makeSpecDbStub();

    const result = deleteScalarFinderVariantRuns({
      specDb, productId: 'mouse-001', productRoot,
      fieldKey: 'release_date', variantId: 'v_black',
    });

    assert.equal(result.cleaned, false);
    assert.deepEqual(result.deletedRuns, []);
    assert.equal(specDb._test.upsertCalls.length, 0);
    assert.equal(specDb._test.removeRunCalls.length, 0);
  });

  it('no-op for non-scalar-finder field keys', () => {
    const specDb = makeSpecDbStub();
    const result = deleteScalarFinderVariantRuns({
      specDb, productId: 'mouse-001', productRoot: '/fake',
      fieldKey: 'color', variantId: 'v_black',
    });
    assert.equal(result.cleaned, false);
    assert.deepEqual(result.deletedRuns, []);
  });

  it('discovery_log URLs for the deleted variant are gone after wipe', (t) => {
    const productRoot = makeTempRoot();
    t.after(() => fs.rmSync(productRoot, { recursive: true, force: true }));
    const productId = 'mouse-001';

    releaseDateFinderStore.merge({
      productId, productRoot,
      newDiscovery: { category: 'mouse', last_ran_at: '2025-10-01T00:00:00Z' },
      run: makeRun({ runNumber: 1, variantId: 'v_black', variantKey: 'black', value: '2025-11-11',
        urls: ['https://razer.com/black-1', 'https://razer.com/black-2'],
        queries: ['black release date'] }),
    });
    const specDb = makeSpecDbStub();

    deleteScalarFinderVariantRuns({
      specDb, productId, productRoot,
      fieldKey: 'release_date', variantId: 'v_black',
    });

    const doc = releaseDateFinderStore.read({ productId, productRoot });
    assert.equal(doc.runs.length, 0, 'the v_black run with its discovery_log is gone');
    // This is what makes the Hist (Nqu)(Nurl) counter go to zero — the
    // run-level discovery_log was the attribution source.
  });
});
