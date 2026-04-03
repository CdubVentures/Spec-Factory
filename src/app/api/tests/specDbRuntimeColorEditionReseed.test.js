import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import { createSpecDbRuntime } from '../specDbRuntime.js';
import { SpecDb } from '../../../db/specDb.js';

function createSyncResult(overrides = {}) {
  return {
    components_seeded: 0,
    list_values_seeded: 0,
    products_seeded: 0,
    duration_ms: 0,
    specdb_sync_version: 0,
    ...overrides,
  };
}

class MemorySpecDb extends SpecDb {
  constructor({ category }) {
    super({ dbPath: ':memory:', category });
  }

  isSeeded() {
    return false;
  }
}

class SeededMemorySpecDb extends SpecDb {
  constructor({ category }) {
    super({ dbPath: ':memory:', category });
  }

  isSeeded() {
    return true;
  }
}

function sampleColorEditionJson({ category, productId }) {
  return {
    category,
    product_id: productId,
    colors: { black: { hex: '#000' }, white: { hex: '#fff' } },
    editions: { standard: {} },
    default_color: 'black',
    cooldown_until: '',
    last_ran_at: '2026-04-01T00:00:00.000Z',
    run_count: 3,
  };
}

async function createProductFixture(productRoot, { productId, category }) {
  const dir = path.join(productRoot, productId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, 'color_edition.json'),
    JSON.stringify(sampleColorEditionJson({ category, productId })),
  );
  return dir;
}

// WHY: indexLabRoot is required by the runtime constructor for checkpoint reseed.
// We point it at a valid empty dir so checkpoint reseed completes quickly.
async function makeTempRoots() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ce-reseed-'));
  const indexLabRoot = path.join(tempRoot, 'runs');
  const productRoot = path.join(tempRoot, 'products');
  await fs.mkdir(indexLabRoot, { recursive: true });
  await fs.mkdir(productRoot, { recursive: true });
  return { tempRoot, indexLabRoot, productRoot };
}

function createRuntime({ specDbClass, indexLabRoot, productRoot, logger }) {
  return createSpecDbRuntime({
    resolveCategoryAlias: (value) => String(value || '').trim(),
    specDbClass,
    path,
    fsSync: {
      accessSync: () => { throw new Error('missing'); },
      mkdirSync: () => {},
    },
    syncSpecDbForCategory: async () => createSyncResult(),
    config: { localMode: true },
    logger: logger || { log: () => {}, error: () => {} },
    indexLabRoot,
    productRoot,
  });
}

test('color edition reseed populates table from product files after auto-seed', async () => {
  const { tempRoot, indexLabRoot, productRoot } = await makeTempRoots();
  await createProductFixture(productRoot, { productId: 'mouse-abc123', category: 'mouse' });

  const runtime = createRuntime({ specDbClass: MemorySpecDb, indexLabRoot, productRoot });
  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db);

  const row = db.getColorEditionFinder('mouse-abc123');
  assert.ok(row, 'color_edition_finder row should be populated from product file');
  assert.equal(row.product_id, 'mouse-abc123');
  assert.equal(row.category, 'mouse');
  assert.deepStrictEqual(row.colors, ['black', 'white']);
  assert.deepStrictEqual(row.editions, ['standard']);
  assert.equal(row.default_color, 'black');
  assert.equal(row.run_count, 3);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('color edition reseed skips products with non-matching category', async () => {
  const { tempRoot, indexLabRoot, productRoot } = await makeTempRoots();
  await createProductFixture(productRoot, { productId: 'kb-xyz789', category: 'keyboard' });

  const runtime = createRuntime({ specDbClass: MemorySpecDb, indexLabRoot, productRoot });
  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db);

  const row = db.getColorEditionFinder('kb-xyz789');
  assert.equal(row, null, 'keyboard product should not appear in mouse DB');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('color edition reseed safe when no product files exist', async () => {
  const { tempRoot, indexLabRoot, productRoot } = await makeTempRoots();

  const errors = [];
  const runtime = createRuntime({
    specDbClass: MemorySpecDb,
    indexLabRoot,
    productRoot,
    logger: {
      log: () => {},
      error: (...args) => errors.push(args.map(String).join(' ')),
    },
  });
  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db, 'DB should still be available with empty product root');
  assert.equal(errors.filter((e) => e.includes('color-edition')).length, 0, 'no errors expected');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('partial rebuild: color edition reseed fires when isSeeded() is true', async () => {
  const { tempRoot, indexLabRoot, productRoot } = await makeTempRoots();
  await createProductFixture(productRoot, { productId: 'mouse-partial-01', category: 'mouse' });

  const runtime = createRuntime({ specDbClass: SeededMemorySpecDb, indexLabRoot, productRoot });
  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db);

  const row = db.getColorEditionFinder('mouse-partial-01');
  assert.ok(row, 'color_edition_finder should be populated even when isSeeded() is true');
  assert.equal(row.product_id, 'mouse-partial-01');

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('color edition reseed error does not crash the seed chain', async () => {
  const { tempRoot, indexLabRoot } = await makeTempRoots();
  // WHY: Point productRoot at a nonexistent path to force an error inside the rebuild helper
  const badProductRoot = path.join(tempRoot, 'nonexistent-products');

  const errors = [];
  const runtime = createRuntime({
    specDbClass: MemorySpecDb,
    indexLabRoot,
    productRoot: badProductRoot,
    logger: {
      log: () => {},
      error: (...args) => errors.push(args.map(String).join(' ')),
    },
  });
  const db = await runtime.getSpecDbReady('mouse');
  assert.ok(db, 'DB should still be available even if color edition reseed fails');

  await fs.rm(tempRoot, { recursive: true, force: true });
});
