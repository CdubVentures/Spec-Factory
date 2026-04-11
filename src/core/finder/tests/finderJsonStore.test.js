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
    const runs = [{ run_number: 1, ran_at: '2026-04-01', cooldown_until: '2026-05-01', selected: { items: ['x'], label: 'X' } }];
    const result = store.recalculateFromRuns(runs, 'pid', 'cat');
    assert.deepEqual(result.selected, { items: ['x'], label: 'X' });
    assert.equal(result.next_run_number, 2);
    assert.equal(result.cooldown_until, '2026-05-01');
  });

  it('rejected runs skipped for selected, counted in run_count', () => {
    const store = makeStore();
    const runs = [
      { run_number: 1, ran_at: '2026-04-01', cooldown_until: '2026-05-01', selected: { items: ['a'], label: 'A' } },
      { run_number: 2, ran_at: '2026-04-02', cooldown_until: '', status: 'rejected', selected: {} },
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
      newDiscovery: { category: 'cat', cooldown_until: '2026-05-01', last_ran_at: '2026-04-01' },
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
      newDiscovery: { category: 'cat', cooldown_until: '2026-06-01', last_ran_at: '2026-05-01' },
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
      newDiscovery: { category: 'cat', cooldown_until: '2026-05-01', last_ran_at: '2026-04-01' },
      run: { model: 'gpt', selected: { items: ['good'], label: 'G' }, prompt: {}, response: {} },
    });
    // Rejected run
    const merged = store.merge({
      productId: 'merge-rej', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', cooldown_until: '', last_ran_at: '2026-04-02' },
      run: { model: 'gpt', status: 'rejected', selected: {}, prompt: {}, response: {} },
    });
    assert.deepEqual(merged.selected, { items: ['good'], label: 'G' });
    assert.equal(merged.cooldown_until, '2026-05-01');
  });

  // ── deleteRun ─────────────────────────────────────────────────────

  it('delete only run → returns null, file removed', () => {
    const store = makeStore();
    store.merge({
      productId: 'del-only', productRoot: TMP_ROOT,
      newDiscovery: { category: 'cat', cooldown_until: '', last_ran_at: '2026-04-01' },
      run: { model: 'gpt', selected: { items: ['x'], label: 'X' }, prompt: {}, response: {} },
    });
    const result = store.deleteRun({ productId: 'del-only', productRoot: TMP_ROOT, runNumber: 1 });
    assert.equal(result, null);
    assert.equal(store.read({ productId: 'del-only', productRoot: TMP_ROOT }), null);
  });

  it('delete non-latest run recalculates selected from remaining', () => {
    const store = makeStore('del_recalc');
    store.write({
      productId: 'del-r', productRoot: TMP_ROOT,
      data: {
        product_id: 'del-r', category: 'cat',
        selected: { items: ['b'], label: 'B' },
        cooldown_until: '', last_ran_at: '', run_count: 2, next_run_number: 3,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { items: ['a'], label: 'A' }, cooldown_until: '' },
          { run_number: 2, ran_at: '2026-04-02', selected: { items: ['b'], label: 'B' }, cooldown_until: '' },
        ],
      },
    });
    const result = store.deleteRun({ productId: 'del-r', productRoot: TMP_ROOT, runNumber: 2 });
    assert.deepEqual(result.selected, { items: ['a'], label: 'A' });
    assert.equal(result.run_count, 1);
  });

  // ── deleteAll ─────────────────────────────────────────────────────

  it('deleteAll removes file', () => {
    const store = makeStore();
    store.write({ productId: 'del-all', productRoot: TMP_ROOT, data: { ok: true } });
    const result = store.deleteAll({ productId: 'del-all', productRoot: TMP_ROOT });
    assert.equal(result.deleted, true);
    assert.equal(store.read({ productId: 'del-all', productRoot: TMP_ROOT }), null);
  });
});
