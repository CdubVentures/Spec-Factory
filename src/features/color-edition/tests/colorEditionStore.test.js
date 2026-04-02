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
} from '../colorEditionStore.js';
import { SpecDb } from '../../../db/specDb.js';

const TMP_ROOT = path.join(os.tmpdir(), `cef-test-${Date.now()}`);

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

describe('colorEditionStore — JSON read/write', () => {
  before(() => fs.mkdirSync(TMP_ROOT, { recursive: true }));
  after(() => cleanup(TMP_ROOT));

  it('write + read roundtrip', () => {
    const data = {
      product_id: 'mouse-001',
      category: 'mouse',
      cooldown_until: '2026-05-01T00:00:00Z',
      default_color: 'black',
      run_count: 2,
      last_ran_at: '2026-04-01T12:00:00Z',
      colors: {
        black: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' },
        white: { found_run: 2, found_at: '2026-04-15T00:00:00Z', model: 'gpt-5.4' },
      },
      editions: {
        'cyberpunk-2077-edition': { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' },
      },
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
    const data = { product_id: 'auto-dir', category: 'mouse', colors: {}, editions: {}, run_count: 0 };
    writeColorEdition({ productId: 'auto-dir', productRoot: TMP_ROOT, data });

    const filePath = path.join(TMP_ROOT, 'auto-dir', 'color_edition.json');
    assert.ok(fs.existsSync(filePath));
  });
});

describe('colorEditionStore — merge', () => {
  const MERGE_ROOT = path.join(TMP_ROOT, '_merge');
  before(() => fs.mkdirSync(MERGE_ROOT, { recursive: true }));

  it('merge adds new color, preserves existing', () => {
    writeColorEdition({
      productId: 'merge-001',
      productRoot: MERGE_ROOT,
      data: {
        product_id: 'merge-001',
        category: 'mouse',
        cooldown_until: '',
        default_color: 'black',
        run_count: 1,
        last_ran_at: '2026-04-01T00:00:00Z',
        colors: { black: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' } },
        editions: {},
      },
    });

    const merged = mergeColorEditionDiscovery({
      productId: 'merge-001',
      productRoot: MERGE_ROOT,
      newDiscovery: {
        category: 'mouse',
        colors: { white: { found_run: 2, found_at: '2026-05-01T00:00:00Z', model: 'gpt-5.4' } },
        editions: {},
        cooldown_until: '2026-06-01T00:00:00Z',
        last_ran_at: '2026-05-01T00:00:00Z',
      },
    });

    assert.ok(merged.colors.black, 'existing color preserved');
    assert.ok(merged.colors.white, 'new color added');
    assert.equal(merged.colors.black.found_run, 1);
    assert.equal(merged.colors.white.found_run, 2);
  });

  it('merge does NOT overwrite existing color attribution (first-discovery-wins)', () => {
    writeColorEdition({
      productId: 'merge-no-overwrite',
      productRoot: MERGE_ROOT,
      data: {
        product_id: 'merge-no-overwrite',
        category: 'mouse',
        cooldown_until: '',
        default_color: 'black',
        run_count: 1,
        last_ran_at: '2026-04-01T00:00:00Z',
        colors: { black: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' } },
        editions: {},
      },
    });

    const merged = mergeColorEditionDiscovery({
      productId: 'merge-no-overwrite',
      productRoot: MERGE_ROOT,
      newDiscovery: {
        category: 'mouse',
        colors: { black: { found_run: 3, found_at: '2026-07-01T00:00:00Z', model: 'gpt-6' } },
        editions: {},
        cooldown_until: '2026-08-01T00:00:00Z',
        last_ran_at: '2026-07-01T00:00:00Z',
      },
    });

    assert.equal(merged.colors.black.found_run, 1, 'original attribution preserved');
    assert.equal(merged.colors.black.model, 'gpt-5.4', 'original model preserved');
  });

  it('merge adds new edition, preserves existing', () => {
    writeColorEdition({
      productId: 'merge-editions',
      productRoot: MERGE_ROOT,
      data: {
        product_id: 'merge-editions',
        category: 'mouse',
        cooldown_until: '',
        default_color: '',
        run_count: 1,
        last_ran_at: '2026-04-01T00:00:00Z',
        colors: {},
        editions: { 'sf6-chun-li': { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' } },
      },
    });

    const merged = mergeColorEditionDiscovery({
      productId: 'merge-editions',
      productRoot: MERGE_ROOT,
      newDiscovery: {
        category: 'mouse',
        colors: {},
        editions: { wilderness: { found_run: 2, found_at: '2026-05-01T00:00:00Z', model: 'gpt-5.4' } },
        cooldown_until: '2026-06-01T00:00:00Z',
        last_ran_at: '2026-05-01T00:00:00Z',
      },
    });

    assert.ok(merged.editions['sf6-chun-li'], 'existing edition preserved');
    assert.ok(merged.editions.wilderness, 'new edition added');
  });

  it('merge increments run_count', () => {
    writeColorEdition({
      productId: 'merge-count',
      productRoot: MERGE_ROOT,
      data: {
        product_id: 'merge-count',
        category: 'mouse',
        cooldown_until: '',
        default_color: '',
        run_count: 3,
        last_ran_at: '2026-04-01T00:00:00Z',
        colors: {},
        editions: {},
      },
    });

    const merged = mergeColorEditionDiscovery({
      productId: 'merge-count',
      productRoot: MERGE_ROOT,
      newDiscovery: {
        category: 'mouse',
        colors: {},
        editions: {},
        cooldown_until: '',
        last_ran_at: '2026-05-01T00:00:00Z',
      },
    });

    assert.equal(merged.run_count, 4);
  });

  it('merge updates last_ran_at and cooldown_until', () => {
    writeColorEdition({
      productId: 'merge-dates',
      productRoot: MERGE_ROOT,
      data: {
        product_id: 'merge-dates',
        category: 'mouse',
        cooldown_until: '2026-05-01T00:00:00Z',
        default_color: '',
        run_count: 1,
        last_ran_at: '2026-04-01T00:00:00Z',
        colors: {},
        editions: {},
      },
    });

    const merged = mergeColorEditionDiscovery({
      productId: 'merge-dates',
      productRoot: MERGE_ROOT,
      newDiscovery: {
        category: 'mouse',
        colors: {},
        editions: {},
        cooldown_until: '2026-08-01T00:00:00Z',
        last_ran_at: '2026-07-01T00:00:00Z',
      },
    });

    assert.equal(merged.cooldown_until, '2026-08-01T00:00:00Z');
    assert.equal(merged.last_ran_at, '2026-07-01T00:00:00Z');
  });

  it('default_color preserved if already set and not provided', () => {
    writeColorEdition({
      productId: 'merge-default-keep',
      productRoot: MERGE_ROOT,
      data: {
        product_id: 'merge-default-keep',
        category: 'mouse',
        cooldown_until: '',
        default_color: 'black',
        run_count: 1,
        last_ran_at: '',
        colors: {},
        editions: {},
      },
    });

    const merged = mergeColorEditionDiscovery({
      productId: 'merge-default-keep',
      productRoot: MERGE_ROOT,
      newDiscovery: {
        category: 'mouse',
        colors: {},
        editions: {},
        cooldown_until: '',
        last_ran_at: '2026-05-01T00:00:00Z',
      },
    });

    assert.equal(merged.default_color, 'black');
  });

  it('default_color updated if provided', () => {
    writeColorEdition({
      productId: 'merge-default-update',
      productRoot: MERGE_ROOT,
      data: {
        product_id: 'merge-default-update',
        category: 'mouse',
        cooldown_until: '',
        default_color: 'black',
        run_count: 1,
        last_ran_at: '',
        colors: {},
        editions: {},
      },
    });

    const merged = mergeColorEditionDiscovery({
      productId: 'merge-default-update',
      productRoot: MERGE_ROOT,
      newDiscovery: {
        category: 'mouse',
        colors: {},
        editions: {},
        default_color: 'white',
        cooldown_until: '',
        last_ran_at: '2026-05-01T00:00:00Z',
      },
    });

    assert.equal(merged.default_color, 'white');
  });
});

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

  after(() => {
    specDb.close();
  });

  it('rebuild single product JSON → SQL row', () => {
    writeColorEdition({
      productId: 'rebuild-001',
      productRoot: REBUILD_ROOT,
      data: {
        product_id: 'rebuild-001',
        category: 'mouse',
        cooldown_until: '2026-05-01T00:00:00Z',
        default_color: 'black',
        run_count: 3,
        last_ran_at: '2026-04-15T00:00:00Z',
        colors: {
          black: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' },
          white: { found_run: 2, found_at: '2026-04-10T00:00:00Z', model: 'gpt-5.4' },
        },
        editions: {
          'cyberpunk-2077-edition': { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' },
        },
      },
    });

    const stats = rebuildColorEditionFinderFromJson({ specDb, productRoot: REBUILD_ROOT });
    assert.equal(stats.seeded, 1);

    const row = specDb.getColorEditionFinder('rebuild-001');
    assert.ok(row);
    assert.deepEqual(row.colors, ['black', 'white']);
    assert.deepEqual(row.editions, ['cyberpunk-2077-edition']);
    assert.equal(row.default_color, 'black');
    assert.equal(row.run_count, 3);
    assert.equal(row.cooldown_until, '2026-05-01T00:00:00Z');
  });

  it('rebuild multiple products', () => {
    writeColorEdition({
      productId: 'rebuild-002',
      productRoot: REBUILD_ROOT,
      data: {
        product_id: 'rebuild-002',
        category: 'mouse',
        cooldown_until: '',
        default_color: 'red',
        run_count: 1,
        last_ran_at: '2026-04-01T00:00:00Z',
        colors: { red: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' } },
        editions: {},
      },
    });

    writeColorEdition({
      productId: 'rebuild-003',
      productRoot: REBUILD_ROOT,
      data: {
        product_id: 'rebuild-003',
        category: 'mouse',
        cooldown_until: '',
        default_color: '',
        run_count: 1,
        last_ran_at: '2026-04-01T00:00:00Z',
        colors: {},
        editions: { wilderness: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' } },
      },
    });

    const stats = rebuildColorEditionFinderFromJson({ specDb, productRoot: REBUILD_ROOT });
    assert.ok(stats.seeded >= 2);

    const r2 = specDb.getColorEditionFinder('rebuild-002');
    assert.deepEqual(r2.colors, ['red']);

    const r3 = specDb.getColorEditionFinder('rebuild-003');
    assert.deepEqual(r3.editions, ['wilderness']);
  });

  it('skips missing/corrupt files gracefully', () => {
    // Product dir with no color_edition.json
    fs.mkdirSync(path.join(REBUILD_ROOT, 'rebuild-nofile'), { recursive: true });

    // Product dir with corrupt JSON
    const corruptDir = path.join(REBUILD_ROOT, 'rebuild-corrupt');
    fs.mkdirSync(corruptDir, { recursive: true });
    fs.writeFileSync(path.join(corruptDir, 'color_edition.json'), 'NOT JSON', 'utf8');

    const stats = rebuildColorEditionFinderFromJson({ specDb, productRoot: REBUILD_ROOT });
    assert.equal(stats.skipped, 2);
  });

  it('category filter — only seeds rows matching specDb.category', () => {
    writeColorEdition({
      productId: 'rebuild-wrong-cat',
      productRoot: REBUILD_ROOT,
      data: {
        product_id: 'rebuild-wrong-cat',
        category: 'keyboard',
        cooldown_until: '',
        default_color: '',
        run_count: 1,
        last_ran_at: '',
        colors: { black: { found_run: 1, found_at: '2026-04-01T00:00:00Z', model: 'gpt-5.4' } },
        editions: {},
      },
    });

    const stats = rebuildColorEditionFinderFromJson({ specDb, productRoot: REBUILD_ROOT });
    const row = specDb.getColorEditionFinder('rebuild-wrong-cat');
    assert.equal(row, null, 'keyboard product not seeded into mouse specDb');
    assert.ok(stats.skipped >= 1);
  });
});
