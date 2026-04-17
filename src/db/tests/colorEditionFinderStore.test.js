import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../specDb.js';

describe('colorEditionFinderStore', () => {
  let db;
  let testDir;

  before(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cef-store-'));
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
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
    const kbDb = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'keyboard' });
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

  // --- Color Edition Finder Runs ---

  it('insertRun + listRuns roundtrip with hydrated JSON columns', () => {
    db.insertColorEditionFinderRun({
      category: 'mouse',
      product_id: 'mouse-runs-001',
      run_number: 1,
      ran_at: '2026-04-01T12:00:00Z',
      model: 'claude-sonnet-4-20250514',
      fallback_used: true,
      cooldown_until: '2026-05-01T00:00:00Z',
      selected: { colors: ['black', 'white'], editions: { launch: { colors: ['black'] } }, default_color: 'black' },
      prompt: { system: 'You are a color finder.', user: '{"brand":"Corsair"}' },
      response: { colors: ['black', 'white'], editions: { launch: { colors: ['black'] } }, default_color: 'black' },
    });

    const runs = db.listColorEditionFinderRuns('mouse-runs-001');
    assert.equal(runs.length, 1);
    const run = runs[0];
    assert.equal(run.category, 'mouse');
    assert.equal(run.product_id, 'mouse-runs-001');
    assert.equal(run.run_number, 1);
    assert.equal(run.ran_at, '2026-04-01T12:00:00Z');
    assert.equal(run.model, 'claude-sonnet-4-20250514');
    assert.equal(run.fallback_used, true);
    assert.deepEqual(run.selected.colors, ['black', 'white']);
    assert.deepEqual(run.prompt.system, 'You are a color finder.');
    assert.deepEqual(run.response.default_color, 'black');
  });

  it('listRuns returns runs ordered by run_number ASC', () => {
    // Insert run 3 before run 2 to test ordering
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-order',
      run_number: 3, ran_at: '2026-04-03T00:00:00Z', model: 'model-c',
      fallback_used: false, cooldown_until: '', selected: {}, prompt: {}, response: {},
    });
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-order',
      run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'model-a',
      fallback_used: false, cooldown_until: '', selected: {}, prompt: {}, response: {},
    });
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-order',
      run_number: 2, ran_at: '2026-04-02T00:00:00Z', model: 'model-b',
      fallback_used: false, cooldown_until: '', selected: {}, prompt: {}, response: {},
    });

    const runs = db.listColorEditionFinderRuns('mouse-runs-order');
    assert.equal(runs.length, 3);
    assert.equal(runs[0].run_number, 1);
    assert.equal(runs[1].run_number, 2);
    assert.equal(runs[2].run_number, 3);
  });

  it('getLatestRun returns highest run_number', () => {
    // mouse-runs-order already has 3 runs from previous test
    const latest = db.getLatestColorEditionFinderRun('mouse-runs-order');
    assert.ok(latest);
    assert.equal(latest.run_number, 3);
    assert.equal(latest.model, 'model-c');
  });

  it('getLatestRun returns null for unknown product', () => {
    const latest = db.getLatestColorEditionFinderRun('nonexistent-product');
    assert.equal(latest, null);
  });

  it('removeRun deletes specific run by number', () => {
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-del',
      run_number: 1, ran_at: '', model: 'a',
      fallback_used: false, cooldown_until: '', selected: {}, prompt: {}, response: {},
    });
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-del',
      run_number: 2, ran_at: '', model: 'b',
      fallback_used: false, cooldown_until: '', selected: {}, prompt: {}, response: {},
    });

    db.deleteColorEditionFinderRunByNumber('mouse-runs-del', 1);
    const runs = db.listColorEditionFinderRuns('mouse-runs-del');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].run_number, 2);
  });

  it('removeAllRuns deletes all runs for a product', () => {
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-delall',
      run_number: 1, ran_at: '', model: 'a',
      fallback_used: false, cooldown_until: '', selected: {}, prompt: {}, response: {},
    });
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-delall',
      run_number: 2, ran_at: '', model: 'b',
      fallback_used: false, cooldown_until: '', selected: {}, prompt: {}, response: {},
    });

    db.deleteAllColorEditionFinderRuns('mouse-runs-delall');
    const runs = db.listColorEditionFinderRuns('mouse-runs-delall');
    assert.equal(runs.length, 0);
  });

  it('insertRun UPSERT is idempotent — same run_number updates', () => {
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-idem',
      run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'original',
      fallback_used: false, cooldown_until: '', selected: { colors: ['black'] }, prompt: {}, response: {},
    });
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-idem',
      run_number: 1, ran_at: '2026-04-01T00:00:00Z', model: 'updated',
      fallback_used: true, cooldown_until: '', selected: { colors: ['white'] }, prompt: {}, response: {},
    });

    const runs = db.listColorEditionFinderRuns('mouse-runs-idem');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].model, 'updated');
    assert.equal(runs[0].fallback_used, true);
    assert.deepEqual(runs[0].selected.colors, ['white']);
  });

  it('fallback_used hydrates as boolean', () => {
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-bool',
      run_number: 1, ran_at: '', model: 'test',
      fallback_used: false, cooldown_until: '', selected: {}, prompt: {}, response: {},
    });
    db.insertColorEditionFinderRun({
      category: 'mouse', product_id: 'mouse-runs-bool',
      run_number: 2, ran_at: '', model: 'test',
      fallback_used: true, cooldown_until: '', selected: {}, prompt: {}, response: {},
    });

    const runs = db.listColorEditionFinderRuns('mouse-runs-bool');
    assert.equal(typeof runs[0].fallback_used, 'boolean');
    assert.equal(runs[0].fallback_used, false);
    assert.equal(typeof runs[1].fallback_used, 'boolean');
    assert.equal(runs[1].fallback_used, true);
  });
});
