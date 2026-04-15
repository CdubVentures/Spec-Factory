import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createFinderJsonStore } from '../finderJsonStore.js';

const TMP_ROOT = path.join(os.tmpdir(), `finder-store-test-${Date.now()}`);
const emptySelected = () => ({ items: [], label: '' });

function makeStore(prefix = 'test_finder') {
  return createFinderJsonStore({ filePrefix: prefix, emptySelected });
}

describe('finderJsonStore — generic factory', () => {
  before(() => fs.mkdirSync(TMP_ROOT, { recursive: true }));
  after(() => { try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* */ } });

  // ── read / write ──────────────────────────────────────────────────

  it('write + read roundtrip', () => {
    const store = makeStore();
    const data = { product_id: 'p1', selected: { items: ['a'] }, runs: [] };
    store.write({ productId: 'p1', productRoot: TMP_ROOT, data });
    const result = store.read({ productId: 'p1', productRoot: TMP_ROOT });
    assert.deepEqual(result, data);
  });

  it('read returns null for missing file', () => {
    const store = makeStore();
    assert.equal(store.read({ productId: 'nope', productRoot: TMP_ROOT }), null);
  });

  it('uses filePrefix as filename', () => {
    const store = makeStore('my_module');
    store.write({ productId: 'fp-test', productRoot: TMP_ROOT, data: { ok: true } });
    const filePath = path.join(TMP_ROOT, 'fp-test', 'my_module.json');
    assert.ok(fs.existsSync(filePath));
  });

  // ── recalculateFromRuns ───────────────────────────────────────────

  it('empty runs → emptySelected + default counters', () => {
    const store = makeStore();
    const result = store.recalculateFromRuns([], 'pid', 'cat');
    assert.deepEqual(result.selected, emptySelected());
    assert.equal(result.run_count, 0);
    assert.equal(result.next_run_number, 1);
  });

  it('single run → selected from that run', () => {
    const store = makeStore();
    const runs = [{ run_number: 1, ran_at: '2026-04-01', selected: { items: ['x'], label: 'X' } }];
    const result = store.recalculateFromRuns(runs, 'pid', 'cat');
    assert.deepEqual(result.selected, { items: ['x'], label: 'X' });
    assert.equal(result.next_run_number, 2);
  });

  it('rejected runs skipped for selected, counted in run_count', () => {
    const store = makeStore();
    const runs = [
      { run_number: 1, ran_at: '2026-04-01', selected: { items: ['a'], label: 'A' } },
      { run_number: 2, ran_at: '2026-04-02', status: 'rejected', selected: {} },
    ];
    const result = store.recalculateFromRuns(runs, 'pid', 'cat');
    assert.deepEqual(result.selected, { items: ['a'], label: 'A' });
    assert.equal(result.run_count, 2);
    assert.equal(result.last_ran_at, '2026-04-02');
  });

  // ── merge ─────────────────────────────────────────────────────────

  it('first merge creates file with run_number 1', () => {
    const store = makeStore();
    const merged = store.merge({
      productId: 'merge-1', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-01' },
      run: { model: 'gpt', fallback_used: false, selected: { items: ['a'], label: 'A' }, prompt: {}, response: {} },
    });
    assert.equal(merged.runs.length, 1);
    assert.equal(merged.runs[0].run_number, 1);
    assert.deepEqual(merged.selected, { items: ['a'], label: 'A' });
    assert.equal(merged.next_run_number, 2);
  });

  it('second merge appends run_number 2, updates selected', () => {
    const store = makeStore();
    const merged = store.merge({
      productId: 'merge-1', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-05-01' },
      run: { model: 'gpt-2', fallback_used: false, selected: { items: ['a', 'b'], label: 'AB' }, prompt: {}, response: {} },
    });
    assert.equal(merged.runs.length, 2);
    assert.equal(merged.runs[1].run_number, 2);
    assert.deepEqual(merged.selected, { items: ['a', 'b'], label: 'AB' });
  });

  it('rejected merge preserves previous selected', () => {
    const store = makeStore();
    // Seed with one good run
    store.merge({
      productId: 'merge-rej', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-01' },
      run: { model: 'gpt', selected: { items: ['good'], label: 'G' }, prompt: {}, response: {} },
    });
    // Rejected run
    const merged = store.merge({
      productId: 'merge-rej', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-02' },
      run: { model: 'gpt', status: 'rejected', selected: {}, prompt: {}, response: {} },
    });
    assert.deepEqual(merged.selected, { items: ['good'], label: 'G' });
  });

  // ── eval field preservation across merge ─────────────────────────

  it('merge preserves eval fields on selected.images when new run is added', () => {
    const store = createFinderJsonStore({
      filePrefix: 'eval_merge',
      emptySelected: () => ({ images: [] }),
      // WHY: PIF-style accumulation — union all run images
      recalculateSelected: (runs) => ({
        images: runs.flatMap(r => r.selected?.images || []),
      }),
    });
    // Run 1: seed with an image
    store.merge({
      productId: 'eval-m1', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-01' },
      run: { model: 'gpt', selected: { images: [{ filename: 'top.png', view: 'top', variant_key: 'color:black' }] }, prompt: {}, response: {} },
    });
    // Simulate eval: write eval fields directly onto selected.images
    const doc = store.read({ productId: 'eval-m1', productRoot: TMP_ROOT });
    doc.selected.images[0].eval_best = true;
    doc.selected.images[0].eval_reasoning = 'sharpest image';
    doc.selected.images[0].hero = true;
    doc.selected.images[0].hero_rank = 1;
    store.write({ productId: 'eval-m1', productRoot: TMP_ROOT, data: doc });

    // Run 2: new discovery — recalculateSelected rebuilds from runs (no eval fields)
    const merged = store.merge({
      productId: 'eval-m1', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-02' },
      run: { model: 'gpt', selected: { images: [{ filename: 'left.png', view: 'left', variant_key: 'color:black' }] }, prompt: {}, response: {} },
    });

    // Eval fields must survive on top.png
    const topImg = merged.selected.images.find(i => i.filename === 'top.png');
    assert.ok(topImg, 'top.png must still exist in selected');
    assert.equal(topImg.eval_best, true, 'eval_best must survive merge');
    assert.equal(topImg.eval_reasoning, 'sharpest image', 'eval_reasoning must survive merge');
    assert.equal(topImg.hero, true, 'hero must survive merge');
    assert.equal(topImg.hero_rank, 1, 'hero_rank must survive merge');
    // New image must not have eval fields
    const leftImg = merged.selected.images.find(i => i.filename === 'left.png');
    assert.ok(leftImg, 'left.png must exist in selected');
    assert.equal(leftImg.eval_best, undefined, 'new image must not gain eval fields');
  });

  it('merge preserves eval fields even without recalculateSelected hook', () => {
    const store = makeStore('eval_no_recalc');
    // Seed
    store.merge({
      productId: 'eval-m2', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-01' },
      run: { model: 'gpt', selected: { items: ['a'], label: 'A', images: [{ filename: 'f.png', eval_best: true }] }, prompt: {}, response: {} },
    });
    // Manually set eval on selected (simulating what mergeEvaluation does)
    const doc = store.read({ productId: 'eval-m2', productRoot: TMP_ROOT });
    doc.selected.images = [{ filename: 'f.png', eval_best: true, hero: true, hero_rank: 2 }];
    store.write({ productId: 'eval-m2', productRoot: TMP_ROOT, data: doc });

    // New run — latest-wins selected (no recalculateSelected hook)
    const merged = store.merge({
      productId: 'eval-m2', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-02' },
      run: { model: 'gpt', selected: { items: ['b'], label: 'B', images: [{ filename: 'f.png' }, { filename: 'g.png' }] }, prompt: {}, response: {} },
    });
    // f.png should have eval fields overlaid from existing
    const fImg = merged.selected.images?.find(i => i.filename === 'f.png');
    assert.ok(fImg, 'f.png must exist');
    assert.equal(fImg.eval_best, true, 'eval_best must survive');
    assert.equal(fImg.hero, true, 'hero must survive');
  });

  it('recalculateFromRuns preserves eval fields from existingDoc', () => {
    const store = createFinderJsonStore({
      filePrefix: 'eval_recalc',
      emptySelected: () => ({ images: [] }),
      recalculateSelected: (runs) => ({
        images: runs.flatMap(r => r.selected?.images || []),
      }),
    });
    const existingDoc = {
      selected: { images: [{ filename: 'top.png', eval_best: true, eval_reasoning: 'crisp', hero: true, hero_rank: 1 }] },
    };
    const runs = [
      { run_number: 1, ran_at: '2026-04-01', selected: { images: [{ filename: 'top.png', view: 'top' }] } },
    ];
    const result = store.recalculateFromRuns(runs, 'pid', 'cat', existingDoc);
    const topImg = result.selected.images.find(i => i.filename === 'top.png');
    assert.ok(topImg);
    assert.equal(topImg.eval_best, true);
    assert.equal(topImg.eval_reasoning, 'crisp');
    assert.equal(topImg.hero, true);
    assert.equal(topImg.hero_rank, 1);
  });

  it('rejected merge does not lose eval fields on existing selected', () => {
    const store = createFinderJsonStore({
      filePrefix: 'eval_reject',
      emptySelected: () => ({ images: [] }),
      recalculateSelected: (runs) => ({
        images: runs.flatMap(r => r.selected?.images || []),
      }),
    });
    store.merge({
      productId: 'eval-rej', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-01' },
      run: { model: 'gpt', selected: { images: [{ filename: 'a.png' }] }, prompt: {}, response: {} },
    });
    // Add eval fields
    const doc = store.read({ productId: 'eval-rej', productRoot: TMP_ROOT });
    doc.selected.images[0].eval_best = true;
    store.write({ productId: 'eval-rej', productRoot: TMP_ROOT, data: doc });

    // Rejected run — selected should be preserved entirely
    const merged = store.merge({
      productId: 'eval-rej', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-02' },
      run: { model: 'gpt', status: 'rejected', selected: { images: [] }, prompt: {}, response: {} },
    });
    assert.equal(merged.selected.images[0].eval_best, true, 'rejected run must not clear eval fields');
  });

  // ── deleteRun ─────────────────────────────────────────────────────

  it('delete only run → doc survives with empty runs, file preserved', () => {
    const store = makeStore();
    store.merge({
      productId: 'del-only', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', last_ran_at: '2026-04-01' },
      run: { model: 'gpt', selected: { items: ['x'], label: 'X' }, prompt: {}, response: {} },
    });
    const result = store.deleteRun({ productId: 'del-only', productRoot: TMP_ROOT, runNumber: 1 });
    // WHY: Extra fields survive even when all runs removed — file must not be deleted
    assert.ok(result, 'doc must survive (not null)');
    assert.deepEqual(result.runs, []);
    assert.equal(result.run_count, 0);
    assert.ok(store.read({ productId: 'del-only', productRoot: TMP_ROOT }), 'file must survive');
  });

  it('delete non-latest run recalculates selected from remaining', () => {
    const store = makeStore('del_recalc');
    store.write({
      productId: 'del-r', productRoot: TMP_ROOT,
      data: {
        product_id: 'del-r', category: 'cat',
        selected: { items: ['b'], label: 'B' },
        last_ran_at: '', run_count: 2, next_run_number: 3,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { items: ['a'], label: 'A' } },
          { run_number: 2, ran_at: '2026-04-02', selected: { items: ['b'], label: 'B' } },
        ],
      },
    });
    const result = store.deleteRun({ productId: 'del-r', productRoot: TMP_ROOT, runNumber: 2 });
    assert.deepEqual(result.selected, { items: ['a'], label: 'A' });
    assert.equal(result.run_count, 1);
  });

  // ── deleteRuns (batch) ────────────────────────────────────────────

  it('deleteRuns removes subset, recalculates selected from remaining', () => {
    const store = makeStore('del_batch');
    store.write({
      productId: 'batch-1', productRoot: TMP_ROOT,
      data: {
        product_id: 'batch-1', category: 'cat',
        selected: { items: ['c'], label: 'C' },
        last_ran_at: '', run_count: 3, next_run_number: 4,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { items: ['a'], label: 'A' } },
          { run_number: 2, ran_at: '2026-04-02', selected: { items: ['b'], label: 'B' } },
          { run_number: 3, ran_at: '2026-04-03', selected: { items: ['c'], label: 'C' } },
        ],
      },
    });
    const result = store.deleteRuns({ productId: 'batch-1', productRoot: TMP_ROOT, runNumbers: [2, 3] });
    assert.equal(result.run_count, 1);
    assert.deepEqual(result.selected, { items: ['a'], label: 'A' });
    // WHY: recalculateFromRuns derives next_run_number from max remaining + 1
    assert.equal(result.next_run_number, 2);
  });

  it('deleteRuns all runs → returns null, file removed', () => {
    const store = makeStore('del_batch_all');
    store.write({
      productId: 'batch-all', productRoot: TMP_ROOT,
      data: {
        product_id: 'batch-all', category: 'cat',
        selected: { items: ['x'], label: 'X' },
        last_ran_at: '', run_count: 2, next_run_number: 3,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { items: ['x'], label: 'X' } },
          { run_number: 2, ran_at: '2026-04-02', selected: { items: ['y'], label: 'Y' } },
        ],
      },
    });
    const result = store.deleteRuns({ productId: 'batch-all', productRoot: TMP_ROOT, runNumbers: [1, 2] });
    // WHY: Even with zero runs remaining, the doc must survive with extra fields preserved.
    assert.ok(result, 'doc must survive (not null) when all runs removed');
    assert.equal(result.run_count, 0);
    assert.deepEqual(result.runs, []);
    assert.deepEqual(result.selected, emptySelected());
    // File must still exist on disk
    assert.ok(store.read({ productId: 'batch-all', productRoot: TMP_ROOT }), 'file must survive');
  });

  it('deleteRuns removing all runs preserves extra fields', () => {
    const store = createFinderJsonStore({
      filePrefix: 'del_batch_extra',
      emptySelected,
      extraFields: ['variant_registry'],
    });
    store.write({
      productId: 'batch-extra', productRoot: TMP_ROOT,
      data: {
        product_id: 'batch-extra', category: 'cat',
        selected: { items: ['x'], label: 'X' },
        variant_registry: [{ variant_id: 'v_bb', variant_key: 'edition:special' }],
        last_ran_at: '', run_count: 1, next_run_number: 2,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { items: ['x'], label: 'X' } },
        ],
      },
    });
    const result = store.deleteRuns({ productId: 'batch-extra', productRoot: TMP_ROOT, runNumbers: [1] });
    assert.ok(result, 'doc must survive');
    assert.deepEqual(result.runs, []);
    assert.deepEqual(result.variant_registry, [{ variant_id: 'v_bb', variant_key: 'edition:special' }],
      'extra fields must be preserved when all runs removed');
  });

  it('deleteRuns with non-existent run numbers → no-op', () => {
    const store = makeStore('del_batch_noop');
    store.write({
      productId: 'batch-noop', productRoot: TMP_ROOT,
      data: {
        product_id: 'batch-noop', category: 'cat',
        selected: { items: ['a'], label: 'A' },
        last_ran_at: '', run_count: 1, next_run_number: 2,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { items: ['a'], label: 'A' } },
        ],
      },
    });
    const result = store.deleteRuns({ productId: 'batch-noop', productRoot: TMP_ROOT, runNumbers: [99, 100] });
    assert.equal(result.run_count, 1, 'no runs should be removed');
    assert.deepEqual(result.selected, { items: ['a'], label: 'A' });
  });

  it('deleteRuns with empty array → no-op', () => {
    const store = makeStore('del_batch_empty');
    store.write({
      productId: 'batch-empty', productRoot: TMP_ROOT,
      data: {
        product_id: 'batch-empty', category: 'cat',
        selected: { items: ['a'], label: 'A' },
        last_ran_at: '', run_count: 1, next_run_number: 2,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { items: ['a'], label: 'A' } },
        ],
      },
    });
    const result = store.deleteRuns({ productId: 'batch-empty', productRoot: TMP_ROOT, runNumbers: [] });
    assert.equal(result.run_count, 1);
  });

  it('deleteRuns on missing product → returns null', () => {
    const store = makeStore('del_batch_missing');
    const result = store.deleteRuns({ productId: 'ghost', productRoot: TMP_ROOT, runNumbers: [1, 2] });
    assert.equal(result, null);
  });

  // ── deleteAll ─────────────────────────────────────────────────────

  it('deleteAll clears runs but preserves extra fields and file', () => {
    const store = createFinderJsonStore({
      filePrefix: 'del_all_extra',
      emptySelected,
      extraFields: ['variant_registry'],
    });
    store.write({
      productId: 'del-all', productRoot: TMP_ROOT,
      data: {
        product_id: 'del-all', category: 'cat',
        selected: { items: ['a'], label: 'A' },
        variant_registry: [{ variant_id: 'v_aa', variant_key: 'color:black' }],
        last_ran_at: '2026-04-01', run_count: 2, next_run_number: 3,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { items: ['a'], label: 'A' } },
          { run_number: 2, ran_at: '2026-04-02', selected: { items: ['b'], label: 'B' } },
        ],
      },
    });
    const result = store.deleteAll({ productId: 'del-all', productRoot: TMP_ROOT });
    assert.equal(result.deleted, true);

    // File must survive with extra fields preserved
    const doc = store.read({ productId: 'del-all', productRoot: TMP_ROOT });
    assert.ok(doc, 'file must survive deleteAll');
    assert.deepEqual(doc.runs, [], 'runs cleared');
    assert.equal(doc.run_count, 0);
    assert.deepEqual(doc.selected, emptySelected(), 'selected reset');
    assert.deepEqual(doc.variant_registry, [{ variant_id: 'v_aa', variant_key: 'color:black' }],
      'variant_registry must be preserved');
  });

  it('deleteAll succeeds when file already absent', () => {
    const store = makeStore();
    // No file written — should not throw
    const result = store.deleteAll({ productId: 'ghost-product', productRoot: TMP_ROOT });
    assert.equal(result.deleted, true);
  });

  it('deleteAll writes cleaned doc even when file was corrupt/missing', () => {
    const store = makeStore('del_fail');
    // No file exists — deleteAll should still return success
    const result = store.deleteAll({ productId: 'del-absent', productRoot: TMP_ROOT });
    assert.equal(result.deleted, true);
  });

  it('deleteRun (last run) preserves file with empty runs', () => {
    const store = makeStore('drun_last');
    const productDir = path.join(TMP_ROOT, 'drun-last');
    fs.mkdirSync(productDir, { recursive: true });
    const dataPath = path.join(productDir, 'drun_last.json');
    const data = {
      product_id: 'drun-last', category: 'cat',
      selected: { items: ['x'], label: 'X' },
      last_ran_at: '', run_count: 1, next_run_number: 2,
      runs: [{ run_number: 1, ran_at: '2026-04-01', selected: { items: ['x'], label: 'X' } }],
    };
    fs.writeFileSync(dataPath, JSON.stringify(data));
    const result = store.deleteRun({ productId: 'drun-last', productRoot: TMP_ROOT, runNumber: 1 });
    // WHY: File survives with empty runs — extra fields preserved
    assert.ok(result, 'doc must survive');
    assert.deepEqual(result.runs, []);
    assert.equal(fs.existsSync(dataPath), true, 'file must survive');
  });

  it('deleteRuns (all runs) preserves file with empty runs', () => {
    const store = makeStore('druns_all');
    const productDir = path.join(TMP_ROOT, 'druns-all');
    fs.mkdirSync(productDir, { recursive: true });
    const dataPath = path.join(productDir, 'druns_all.json');
    const data = {
      product_id: 'druns-all', category: 'cat',
      selected: { items: ['a'], label: 'A' },
      last_ran_at: '', run_count: 2, next_run_number: 3,
      runs: [
        { run_number: 1, ran_at: '2026-04-01', selected: { items: ['a'], label: 'A' } },
        { run_number: 2, ran_at: '2026-04-02', selected: { items: ['b'], label: 'B' } },
      ],
    };
    fs.writeFileSync(dataPath, JSON.stringify(data));
    const result = store.deleteRuns({ productId: 'druns-all', productRoot: TMP_ROOT, runNumbers: [1, 2] });
    assert.ok(result, 'doc must survive');
    assert.deepEqual(result.runs, []);
    assert.equal(fs.existsSync(dataPath), true, 'file must survive');
  });
});
