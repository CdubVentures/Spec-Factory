import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readColorEdition,
  writeColorEdition,
  mergeColorEditionDiscovery,
  rebuildColorEditionFinderFromJson,
  recalculateCumulativeFromRuns,
  deleteColorEditionFinderRun,
  deleteColorEditionFinderAll,
} from '../colorEditionStore.js';
import { SpecDb } from '../../../db/specDb.js';

const TMP_ROOT = path.join(os.tmpdir(), `cef-test-${Date.now()}`);

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

// ── JSON read/write ─────────────────────────────────────────────────

describe('colorEditionStore — JSON read/write', () => {
  before(() => fs.mkdirSync(TMP_ROOT, { recursive: true }));
  after(() => cleanup(TMP_ROOT));

  it('write + read roundtrip', () => {
    const data = {
      product_id: 'mouse-001',
      category: 'mouse',
      selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
      last_ran_at: '2026-04-01T12:00:00Z',
      run_count: 1,
      runs: [],
    };
    writeColorEdition({ productId: 'mouse-001', productRoot: TMP_ROOT, data });
    const result = readColorEdition({ productId: 'mouse-001', productRoot: TMP_ROOT });
    assert.deepEqual(result, data);
  });

  it('read returns null for missing file', () => {
    const result = readColorEdition({ productId: 'nonexistent', productRoot: TMP_ROOT });
    assert.equal(result, null);
  });

  it('read returns null for corrupt JSON', () => {
    const dir = path.join(TMP_ROOT, 'corrupt-001');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'color_edition.json'), '{bad json!!!', 'utf8');
    const result = readColorEdition({ productId: 'corrupt-001', productRoot: TMP_ROOT });
    assert.equal(result, null);
  });

  it('directory auto-created on write', () => {
    const data = { product_id: 'auto-dir', category: 'mouse', selected: { colors: [], editions: {}, default_color: '' }, run_count: 0, runs: [] };
    writeColorEdition({ productId: 'auto-dir', productRoot: TMP_ROOT, data });
    const filePath = path.join(TMP_ROOT, 'auto-dir', 'color_edition.json');
    assert.ok(fs.existsSync(filePath));
  });
});

// ── recalculateCumulativeFromRuns ────────────────────────────────────

describe('recalculateCumulativeFromRuns', () => {
  it('returns empty state for empty runs array', () => {
    const result = recalculateCumulativeFromRuns([], 'pid', 'mouse');
    assert.deepEqual(result.selected, { colors: [], editions: {}, default_color: '' });
    assert.equal(result.run_count, 0);
    assert.equal(result.next_run_number, 1);
    assert.equal(result.last_ran_at, '');
  });

  it('single run: selected = that run', () => {
    const runs = [{
      run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
      fallback_used: false,
      selected: {
        colors: ['black', 'white'],
        editions: { 'launch-edition': { colors: ['black'] } },
        default_color: 'black',
      },
      prompt: { system: 's', user: 'u' },
      response: { colors: ['black', 'white'], editions: { 'launch-edition': { colors: ['black'] } }, default_color: 'black' },
    }];
    const result = recalculateCumulativeFromRuns(runs, 'pid', 'mouse');
    assert.deepEqual(result.selected.colors, ['black', 'white']);
    assert.deepEqual(result.selected.editions, { 'launch-edition': { colors: ['black'] } });
    assert.equal(result.selected.default_color, 'black');
    assert.equal(result.run_count, 1);
    assert.equal(result.next_run_number, 2);
    assert.equal(result.last_ran_at, '2026-04-01T00:00:00Z');
  });

  it('multiple runs: selected = latest run (highest run_number)', () => {
    const runs = [
      {
        run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
        fallback_used: false,
        selected: { colors: ['black'], editions: {}, default_color: 'black' },
        prompt: { system: 's', user: 'u' }, response: { colors: ['black'], editions: {}, default_color: 'black' },
      },
      {
        run_number: 2, ran_at: '2026-06-01T00:00:00Z', model: 'gpt-6',
        fallback_used: false,
        selected: { colors: ['black', 'white', 'red'], editions: { 'launch': { colors: ['black'] } }, default_color: 'black' },
        prompt: { system: 's', user: 'u' }, response: { colors: ['black', 'white', 'red'], editions: { 'launch': { colors: ['black'] } }, default_color: 'black' },
      },
    ];
    const result = recalculateCumulativeFromRuns(runs, 'pid', 'mouse');
    assert.deepEqual(result.selected.colors, ['black', 'white', 'red']);
    assert.deepEqual(result.selected.editions, { 'launch': { colors: ['black'] } });
    assert.equal(result.run_count, 2);
    assert.equal(result.next_run_number, 3);
    assert.equal(result.last_ran_at, '2026-06-01T00:00:00Z');
  });

  it('non-sequential run_numbers: next_run_number = MAX + 1', () => {
    const runs = [
      { run_number: 1, ran_at: '2026-04-01', selected: { colors: ['black'], editions: {}, default_color: 'black' } },
      { run_number: 3, ran_at: '2026-04-02', selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' } },
      { run_number: 5, ran_at: '2026-04-03', selected: { colors: ['red'], editions: {}, default_color: 'red' } },
    ];
    const result = recalculateCumulativeFromRuns(runs, 'pid', 'mouse');
    assert.equal(result.run_count, 3);
    assert.equal(result.next_run_number, 6);
    assert.deepEqual(result.selected.colors, ['red']);
  });

  it('rejected runs: selected derived from latest valid run', () => {
    const runs = [
      { run_number: 1, ran_at: '2026-04-01',
        selected: { colors: ['black'], editions: {}, default_color: 'black' } },
      { run_number: 2, ran_at: '2026-04-02', status: 'rejected',
        selected: {} },
    ];
    const result = recalculateCumulativeFromRuns(runs, 'pid', 'mouse');
    assert.deepEqual(result.selected.colors, ['black'], 'selected from valid run 1, not rejected run 2');
    assert.equal(result.last_ran_at, '2026-04-02', 'last_ran_at from overall latest (rejected)');
    assert.equal(result.run_count, 2);
    assert.equal(result.next_run_number, 3);
  });

  it('rejected runs interleaved: selected from latest valid', () => {
    const runs = [
      { run_number: 1, ran_at: '2026-04-01', status: 'rejected', selected: {} },
      { run_number: 2, ran_at: '2026-04-02',
        selected: { colors: ['white'], editions: {}, default_color: 'white' } },
      { run_number: 3, ran_at: '2026-04-03', status: 'rejected', selected: {} },
    ];
    const result = recalculateCumulativeFromRuns(runs, 'pid', 'mouse');
    assert.deepEqual(result.selected.colors, ['white'], 'selected from valid run 2');
    assert.equal(result.last_ran_at, '2026-04-03', 'last_ran_at from overall latest');
    assert.equal(result.run_count, 3);
    assert.equal(result.next_run_number, 4);
  });

  it('all rejected runs: selected is empty, counts still correct', () => {
    const runs = [
      { run_number: 1, ran_at: '2026-04-01', status: 'rejected', selected: {} },
      { run_number: 2, ran_at: '2026-04-02', status: 'rejected', selected: {} },
    ];
    const result = recalculateCumulativeFromRuns(runs, 'pid', 'mouse');
    assert.deepEqual(result.selected, { colors: [], editions: {}, default_color: '' });
    assert.equal(result.last_ran_at, '2026-04-02');
    assert.equal(result.run_count, 2);
    assert.equal(result.next_run_number, 3);
  });
});

// ── merge with runs ─────────────────────────────────────────────────

describe('colorEditionStore — merge with runs', () => {
  const MERGE_ROOT = path.join(TMP_ROOT, '_merge_v2');
  before(() => fs.mkdirSync(MERGE_ROOT, { recursive: true }));

  it('first merge creates runs array with one entry', () => {
    const merged = mergeColorEditionDiscovery({
      productId: 'merge-new',
      productRoot: MERGE_ROOT,
      newDiscovery: {
        category: 'mouse',
        last_ran_at: '2026-04-01T00:00:00Z',
      },
      run: {
        model: 'gpt-5.4', fallback_used: false,
        selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
        prompt: { system: 'sys prompt', user: '{"brand":"Corsair"}' },
        response: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
      },
    });

    assert.equal(merged.runs.length, 1);
    assert.equal(merged.runs[0].run_number, 1);
    assert.equal(merged.runs[0].model, 'gpt-5.4');
    assert.deepEqual(merged.runs[0].selected.colors, ['black', 'white']);
    assert.deepEqual(merged.selected.colors, ['black', 'white']);
    assert.equal(merged.selected.default_color, 'black');
    assert.equal(merged.run_count, 1);
    assert.equal(merged.next_run_number, 2);
  });

  it('second merge appends run and updates selected (latest-wins)', () => {
    const merged = mergeColorEditionDiscovery({
      productId: 'merge-new',
      productRoot: MERGE_ROOT,
      newDiscovery: {
        category: 'mouse',
        last_ran_at: '2026-05-01T00:00:00Z',
      },
      run: {
        model: 'gpt-6', fallback_used: false,
        selected: { colors: ['black', 'white', 'red'], editions: { 'launch': { colors: ['black'] } }, default_color: 'black' },
        prompt: { system: 'sys v2', user: '{"brand":"Corsair"}' },
        response: { colors: ['black', 'white', 'red'], editions: { 'launch': { colors: ['black'] } }, default_color: 'black' },
      },
    });

    assert.equal(merged.runs.length, 2);
    assert.equal(merged.runs[1].run_number, 2);
    assert.equal(merged.runs[1].model, 'gpt-6');
    assert.deepEqual(merged.selected.colors, ['black', 'white', 'red']);
    assert.deepEqual(merged.selected.editions, { 'launch': { colors: ['black'] } });
    assert.equal(merged.run_count, 2);
    assert.equal(merged.next_run_number, 3);
  });

  it('prompt and response are stored in run entry', () => {
    const existing = readColorEdition({ productId: 'merge-new', productRoot: MERGE_ROOT });
    assert.equal(existing.runs[0].prompt.system, 'sys prompt');
    assert.equal(existing.runs[0].prompt.user, '{"brand":"Corsair"}');
    assert.deepEqual(existing.runs[0].response.colors, ['black', 'white']);
  });

  it('merge after deletion uses next_run_number (not run_count + 1)', () => {
    const DEL_MERGE_ROOT = path.join(TMP_ROOT, '_del_merge');
    fs.mkdirSync(DEL_MERGE_ROOT, { recursive: true });

    // Seed 3 runs
    writeColorEdition({
      productId: 'del-merge-001', productRoot: DEL_MERGE_ROOT,
      data: {
        product_id: 'del-merge-001', category: 'mouse',
        selected: { colors: ['red'], editions: {}, default_color: 'red' },
        last_ran_at: '', run_count: 3, next_run_number: 4,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { colors: ['black'], editions: {}, default_color: 'black' } },
          { run_number: 2, ran_at: '2026-04-02', selected: { colors: ['white'], editions: {}, default_color: 'white' } },
          { run_number: 3, ran_at: '2026-04-03', selected: { colors: ['red'], editions: {}, default_color: 'red' } },
        ],
      },
    });

    // Delete run 2
    deleteColorEditionFinderRun({ productId: 'del-merge-001', productRoot: DEL_MERGE_ROOT, runNumber: 2 });

    // Verify after delete: next_run_number preserved as 4, run_count = 2
    const afterDel = readColorEdition({ productId: 'del-merge-001', productRoot: DEL_MERGE_ROOT });
    assert.equal(afterDel.run_count, 2);
    assert.equal(afterDel.next_run_number, 4);

    // Merge a new run — must get run_number 4 (not 3)
    const merged = mergeColorEditionDiscovery({
      productId: 'del-merge-001', productRoot: DEL_MERGE_ROOT,
      newDiscovery: { category: 'mouse', last_ran_at: '2026-04-04' },
      run: { model: 'gpt-7', fallback_used: false, selected: { colors: ['blue'], editions: {}, default_color: 'blue' }, prompt: {}, response: {} },
    });

    assert.equal(merged.runs.length, 3);
    assert.equal(merged.runs[2].run_number, 4, 'new run must use next_run_number, not run_count + 1');
    assert.equal(merged.run_count, 3);
    assert.equal(merged.next_run_number, 5);
  });

  it('backward compat: merge into old JSON without next_run_number falls back to run_count + 1', () => {
    const COMPAT_ROOT = path.join(TMP_ROOT, '_compat');
    fs.mkdirSync(COMPAT_ROOT, { recursive: true });

    // Old-format JSON: no next_run_number field
    writeColorEdition({
      productId: 'compat-001', productRoot: COMPAT_ROOT,
      data: {
        product_id: 'compat-001', category: 'mouse',
        selected: { colors: ['black'], editions: {}, default_color: 'black' },
        last_ran_at: '', run_count: 2,
        runs: [
          { run_number: 1, ran_at: '2026-04-01', selected: { colors: ['black'], editions: {}, default_color: 'black' } },
          { run_number: 2, ran_at: '2026-04-02', selected: { colors: ['black'], editions: {}, default_color: 'black' } },
        ],
      },
    });

    const merged = mergeColorEditionDiscovery({
      productId: 'compat-001', productRoot: COMPAT_ROOT,
      newDiscovery: { category: 'mouse', last_ran_at: '2026-04-03' },
      run: { model: 'gpt-7', selected: { colors: ['white'], editions: {}, default_color: 'white' }, prompt: {}, response: {} },
    });

    assert.equal(merged.runs[2].run_number, 3, 'falls back to run_count + 1 when next_run_number is absent');
    assert.equal(merged.run_count, 3);
    assert.equal(merged.next_run_number, 4);
  });
});

// ── delete run ──────────────────────────────────────────────────────

describe('colorEditionStore — delete run', () => {
  const DEL_ROOT = path.join(TMP_ROOT, '_delete');
  before(() => fs.mkdirSync(DEL_ROOT, { recursive: true }));

  it('deleting a non-latest run keeps selected from latest', () => {
    writeColorEdition({
      productId: 'del-001', productRoot: DEL_ROOT,
      data: {
        product_id: 'del-001', category: 'mouse',
        selected: { colors: ['black', 'white', 'red'], editions: {}, default_color: 'black' },
        last_ran_at: '2026-06-01T00:00:00Z', run_count: 2,
        runs: [
          {
            run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
            fallback_used: false,
            selected: { colors: ['black'], editions: {}, default_color: 'black' },
            prompt: { system: 's', user: 'u' }, response: { colors: ['black'], editions: {}, default_color: 'black' },
          },
          {
            run_number: 2, ran_at: '2026-06-01T00:00:00Z', model: 'gpt-6',
            fallback_used: false,
            selected: { colors: ['black', 'white', 'red'], editions: {}, default_color: 'black' },
            prompt: { system: 's2', user: 'u2' }, response: { colors: ['black', 'white', 'red'], editions: {}, default_color: 'black' },
          },
        ],
      },
    });

    const result = deleteColorEditionFinderRun({ productId: 'del-001', productRoot: DEL_ROOT, runNumber: 1 });
    assert.equal(result.runs.length, 1);
    assert.equal(result.runs[0].run_number, 2);
    assert.deepEqual(result.selected.colors, ['black', 'white', 'red']);
    assert.equal(result.next_run_number, 3, 'high-water mark: MAX(2) + 1');
    assert.equal(result.run_count, 1);
  });

  it('deleting the latest run recalculates selected from previous', () => {
    writeColorEdition({
      productId: 'del-002', productRoot: DEL_ROOT,
      data: {
        product_id: 'del-002', category: 'mouse',
        selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
        last_ran_at: '2026-06-01T00:00:00Z', run_count: 2,
        runs: [
          {
            run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
            fallback_used: false,
            selected: { colors: ['black'], editions: {}, default_color: 'black' },
            prompt: { system: 's', user: 'u' }, response: { colors: ['black'], editions: {}, default_color: 'black' },
          },
          {
            run_number: 2, ran_at: '2026-06-01T00:00:00Z', model: 'gpt-6',
            fallback_used: false,
            selected: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
            prompt: { system: 's2', user: 'u2' }, response: { colors: ['black', 'white'], editions: {}, default_color: 'black' },
          },
        ],
      },
    });

    const result = deleteColorEditionFinderRun({ productId: 'del-002', productRoot: DEL_ROOT, runNumber: 2 });
    assert.equal(result.runs.length, 1);
    assert.deepEqual(result.selected.colors, ['black']);
  });

  it('deleting the only run returns null and removes file', () => {
    writeColorEdition({
      productId: 'del-003', productRoot: DEL_ROOT,
      data: {
        product_id: 'del-003', category: 'mouse',
        selected: { colors: ['black'], editions: {}, default_color: 'black' },
        last_ran_at: '2026-04-01T00:00:00Z', run_count: 1,
        runs: [{
          run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
          fallback_used: false,
          selected: { colors: ['black'], editions: {}, default_color: 'black' },
          prompt: { system: 's', user: 'u' }, response: { colors: ['black'], editions: {}, default_color: 'black' },
        }],
      },
    });

    const result = deleteColorEditionFinderRun({ productId: 'del-003', productRoot: DEL_ROOT, runNumber: 1 });
    assert.equal(result, null);
    const check = readColorEdition({ productId: 'del-003', productRoot: DEL_ROOT });
    assert.equal(check, null);
  });

  it('deleting non-existent run number returns unchanged doc', () => {
    writeColorEdition({
      productId: 'del-004', productRoot: DEL_ROOT,
      data: {
        product_id: 'del-004', category: 'mouse',
        selected: { colors: ['black'], editions: {}, default_color: 'black' },
        last_ran_at: '', run_count: 1,
        runs: [{
          run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4',
          fallback_used: false,
          selected: { colors: ['black'], editions: {}, default_color: 'black' },
          prompt: { system: 's', user: 'u' }, response: { colors: ['black'], editions: {}, default_color: 'black' },
        }],
      },
    });

    const result = deleteColorEditionFinderRun({ productId: 'del-004', productRoot: DEL_ROOT, runNumber: 99 });
    assert.equal(result.runs.length, 1);
  });
});

// ── delete all ──────────────────────────────────────────────────────

describe('colorEditionStore — delete all', () => {
  const DELALL_ROOT = path.join(TMP_ROOT, '_delall');
  before(() => fs.mkdirSync(DELALL_ROOT, { recursive: true }));

  it('removes JSON file', () => {
    writeColorEdition({
      productId: 'delall-001', productRoot: DELALL_ROOT,
      data: { product_id: 'delall-001', category: 'mouse', selected: { colors: [], editions: {}, default_color: '' }, run_count: 0, runs: [] },
    });

    const result = deleteColorEditionFinderAll({ productId: 'delall-001', productRoot: DELALL_ROOT });
    assert.equal(result.deleted, true);
    const check = readColorEdition({ productId: 'delall-001', productRoot: DELALL_ROOT });
    assert.equal(check, null);
  });

  it('returns deleted:true even if file does not exist', () => {
    const result = deleteColorEditionFinderAll({ productId: 'nonexistent-999', productRoot: DELALL_ROOT });
    assert.equal(result.deleted, true);
  });
});

// ── rebuild JSON → SQL ──────────────────────────────────────────────

describe('colorEditionStore — rebuild JSON → SQL', () => {
  const REBUILD_ROOT = path.join(TMP_ROOT, '_rebuild');
  const REBUILD_DB_DIR = path.join(TMP_ROOT, '_rebuild_db');
  const REBUILD_DB_PATH = path.join(REBUILD_DB_DIR, 'spec.sqlite');
  let specDb;

  before(() => {
    fs.mkdirSync(REBUILD_ROOT, { recursive: true });
    fs.mkdirSync(REBUILD_DB_DIR, { recursive: true });
    specDb = new SpecDb({ dbPath: REBUILD_DB_PATH, category: 'mouse' });
  });

  after(() => { specDb.close(); });

  it('rebuild new-format product JSON → SQL row', () => {
    writeColorEdition({
      productId: 'rebuild-001', productRoot: REBUILD_ROOT,
      data: {
        product_id: 'rebuild-001', category: 'mouse',
        selected: {
          colors: ['black', 'white'],
          editions: { 'launch-edition': { colors: ['black'] } },
          default_color: 'black',
        },
        last_ran_at: '2026-04-15T00:00:00Z', run_count: 3,
        runs: [],
      },
    });

    const stats = rebuildColorEditionFinderFromJson({ specDb, productRoot: REBUILD_ROOT });
    assert.ok(stats.seeded >= 1);

    const row = specDb.getColorEditionFinder('rebuild-001');
    assert.ok(row);
    assert.deepEqual(row.colors, ['black', 'white']);
    assert.equal(row.default_color, 'black');
    assert.equal(row.run_count, 3);
  });

  it('rebuild legacy-format product JSON → SQL row (backward compat)', () => {
    writeColorEdition({
      productId: 'rebuild-legacy', productRoot: REBUILD_ROOT,
      data: {
        product_id: 'rebuild-legacy', category: 'mouse',
        default_color: 'red', run_count: 1, last_ran_at: '',
        colors: { red: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' } },
        editions: { 'wilderness': { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' } },
      },
    });

    const stats = rebuildColorEditionFinderFromJson({ specDb, productRoot: REBUILD_ROOT });
    assert.ok(stats.seeded >= 1);

    const row = specDb.getColorEditionFinder('rebuild-legacy');
    assert.ok(row);
    assert.deepEqual(row.colors, ['red']);
    assert.deepEqual(row.editions, ['wilderness']);
  });

  it('category filter — only seeds rows matching specDb.category', () => {
    writeColorEdition({
      productId: 'rebuild-wrong-cat', productRoot: REBUILD_ROOT,
      data: {
        product_id: 'rebuild-wrong-cat', category: 'keyboard',
        selected: { colors: ['black'], editions: {}, default_color: 'black' },
        last_ran_at: '', run_count: 1, runs: [],
      },
    });

    rebuildColorEditionFinderFromJson({ specDb, productRoot: REBUILD_ROOT });
    const row = specDb.getColorEditionFinder('rebuild-wrong-cat');
    assert.equal(row, null);
  });

  it('rebuild seeds runs table from JSON runs array', () => {
    writeColorEdition({
      productId: 'rebuild-runs', productRoot: REBUILD_ROOT,
      data: {
        product_id: 'rebuild-runs', category: 'mouse',
        selected: { colors: ['black', 'red'], editions: {}, default_color: 'black' },
        last_ran_at: '2026-04-02T00:00:00Z', run_count: 2,
        runs: [
          {
            run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'model-a',
            fallback_used: false,
            selected: { colors: ['black'], editions: {}, default_color: 'black' },
            prompt: { system: 'sys1', user: 'usr1' },
            response: { colors: ['black'], editions: {}, default_color: 'black' },
          },
          {
            run_number: 2, ran_at: '2026-04-02T00:00:00Z', model: 'model-b',
            fallback_used: true,
            selected: { colors: ['black', 'red'], editions: {}, default_color: 'black' },
            prompt: { system: 'sys2', user: 'usr2' },
            response: { colors: ['black', 'red'], editions: {}, default_color: 'black' },
          },
        ],
      },
    });

    const stats = rebuildColorEditionFinderFromJson({ specDb, productRoot: REBUILD_ROOT });
    assert.equal(stats.runs_seeded >= 2, true);

    const runs = specDb.listColorEditionFinderRuns('rebuild-runs');
    assert.equal(runs.length, 2);
    assert.equal(runs[0].run_number, 1);
    assert.equal(runs[0].model, 'model-a');
    assert.equal(runs[0].fallback_used, false);
    assert.deepEqual(runs[0].prompt.system, 'sys1');
    assert.equal(runs[1].run_number, 2);
    assert.equal(runs[1].model, 'model-b');
    assert.equal(runs[1].fallback_used, true);
    assert.deepEqual(runs[1].selected.colors, ['black', 'red']);
  });
});
