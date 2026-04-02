import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SpecDb } from '../specDb.js';

const TEST_DIR = path.join('.workspace', 'db', '_test_cef_store');
const DB_PATH = path.join(TEST_DIR, 'spec.sqlite');

describe('colorEditionFinderStore', () => {
  let db;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    db = new SpecDb({ dbPath: DB_PATH, category: 'mouse' });
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(DB_PATH); } catch { /* */ }
    try { fs.rmdirSync(TEST_DIR); } catch { /* */ }
  });

  it('upsert + get roundtrip', () => {
    db.upsertColorEditionFinder({
      category: 'mouse',
      product_id: 'mouse-001',
      colors: ['black', 'white', 'black+red'],
      editions: ['cyberpunk-2077-edition'],
      default_color: 'black',
      cooldown_until: '2026-05-01T00:00:00Z',
      latest_ran_at: '2026-04-01T12:00:00Z',
      run_count: 2,
    });

    const row = db.getColorEditionFinder('mouse-001');
    assert.ok(row);
    assert.equal(row.category, 'mouse');
    assert.equal(row.product_id, 'mouse-001');
    assert.deepEqual(row.colors, ['black', 'white', 'black+red']);
    assert.deepEqual(row.editions, ['cyberpunk-2077-edition']);
    assert.equal(row.default_color, 'black');
    assert.equal(row.cooldown_until, '2026-05-01T00:00:00Z');
    assert.equal(row.latest_ran_at, '2026-04-01T12:00:00Z');
    assert.equal(row.run_count, 2);
  });

  it('JSON arrays survive roundtrip', () => {
    db.upsertColorEditionFinder({
      category: 'mouse',
      product_id: 'mouse-json-rt',
      colors: ['light-blue', 'dark-green+white'],
      editions: ['sf6-chun-li', 'wilderness'],
      default_color: 'light-blue',
      cooldown_until: '',
      latest_ran_at: '',
      run_count: 1,
    });

    const row = db.getColorEditionFinder('mouse-json-rt');
    assert.ok(Array.isArray(row.colors));
    assert.ok(Array.isArray(row.editions));
    assert.equal(row.colors.length, 2);
    assert.equal(row.editions.length, 2);
    assert.equal(row.colors[0], 'light-blue');
    assert.equal(row.editions[1], 'wilderness');
  });

  it('upsert conflict path updates existing row', () => {
    db.upsertColorEditionFinder({
      category: 'mouse',
      product_id: 'mouse-conflict',
      colors: ['black'],
      editions: [],
      default_color: 'black',
      cooldown_until: '2026-05-01T00:00:00Z',
      latest_ran_at: '2026-04-01T00:00:00Z',
      run_count: 1,
    });

    db.upsertColorEditionFinder({
      category: 'mouse',
      product_id: 'mouse-conflict',
      colors: ['black', 'white'],
      editions: ['special-edition'],
      default_color: 'black',
      cooldown_until: '2026-06-01T00:00:00Z',
      latest_ran_at: '2026-05-01T00:00:00Z',
      run_count: 2,
    });

    const row = db.getColorEditionFinder('mouse-conflict');
    assert.deepEqual(row.colors, ['black', 'white']);
    assert.deepEqual(row.editions, ['special-edition']);
    assert.equal(row.run_count, 2);
    assert.equal(row.cooldown_until, '2026-06-01T00:00:00Z');

    // Verify single row (not two)
    const all = db.listColorEditionFinderByCategory('mouse');
    const matches = all.filter(r => r.product_id === 'mouse-conflict');
    assert.equal(matches.length, 1);
  });

  it('get returns null for unknown product', () => {
    const row = db.getColorEditionFinder('nonexistent-999');
    assert.equal(row, null);
  });

  it('listByCategory returns correct subset', () => {
    // mouse-001, mouse-json-rt, mouse-conflict already inserted above
    const mouseRows = db.listColorEditionFinderByCategory('mouse');
    assert.ok(mouseRows.length >= 3);
    assert.ok(mouseRows.every(r => r.category === 'mouse'));

    // Insert one for a different category (keyboard)
    const kbDb = new SpecDb({ dbPath: DB_PATH, category: 'keyboard' });
    kbDb.upsertColorEditionFinder({
      category: 'keyboard',
      product_id: 'kb-001',
      colors: ['black'],
      editions: [],
      default_color: 'black',
      cooldown_until: '',
      latest_ran_at: '',
      run_count: 1,
    });

    const kbRows = kbDb.listColorEditionFinderByCategory('keyboard');
    assert.equal(kbRows.length, 1);
    assert.equal(kbRows[0].product_id, 'kb-001');
  });

  it('listByCategory returns empty array for unknown category', () => {
    const rows = db.listColorEditionFinderByCategory('nonexistent');
    assert.ok(Array.isArray(rows));
    assert.equal(rows.length, 0);
  });

  it('cooldown gating — active cooldown returns row', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    db.upsertColorEditionFinder({
      category: 'mouse',
      product_id: 'mouse-cooldown-active',
      colors: ['black'],
      editions: [],
      default_color: 'black',
      cooldown_until: futureDate,
      latest_ran_at: new Date().toISOString(),
      run_count: 1,
    });

    const row = db.getColorEditionFinderIfOnCooldown('mouse-cooldown-active');
    assert.ok(row);
    assert.equal(row.product_id, 'mouse-cooldown-active');
  });

  it('cooldown gating — expired cooldown returns null', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    db.upsertColorEditionFinder({
      category: 'mouse',
      product_id: 'mouse-cooldown-expired',
      colors: ['white'],
      editions: [],
      default_color: 'white',
      cooldown_until: pastDate,
      latest_ran_at: pastDate,
      run_count: 1,
    });

    const row = db.getColorEditionFinderIfOnCooldown('mouse-cooldown-expired');
    assert.equal(row, null);
  });

  it('default values on minimal upsert', () => {
    db.upsertColorEditionFinder({
      category: 'mouse',
      product_id: 'mouse-defaults',
    });

    const row = db.getColorEditionFinder('mouse-defaults');
    assert.ok(row);
    assert.deepEqual(row.colors, []);
    assert.deepEqual(row.editions, []);
    assert.equal(row.default_color, '');
    assert.equal(row.run_count, 0);
  });
});
