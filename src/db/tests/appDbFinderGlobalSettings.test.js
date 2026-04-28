// WHY: Boundary contract — the finder_global_settings table is the shared
// backing store for all settingsScope='global' finders. These tests lock in
// the upsert/get/list/delete + rebuild-from-JSON contract that the module-
// settings route handler and the finder store factory both rely on.

import { describe, it, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AppDb } from '../appDb.js';

function createTestDb() {
  return new AppDb({ dbPath: ':memory:' });
}

describe('AppDb — finder_global_settings CRUD', () => {
  let db;
  beforeEach(() => { db = createTestDb(); });
  afterEach(() => { db.close(); });

  it('upsert + get roundtrip keyed by (module_id, key)', () => {
    db.upsertFinderGlobalSetting('colorEditionFinder', 'urlHistoryEnabled', 'true');
    assert.equal(db.getFinderGlobalSetting('colorEditionFinder', 'urlHistoryEnabled'), 'true');
  });

  it('upsert updates existing value on conflict', () => {
    db.upsertFinderGlobalSetting('releaseDateFinder', 'perVariantAttemptBudget', '3');
    db.upsertFinderGlobalSetting('releaseDateFinder', 'perVariantAttemptBudget', '5');
    assert.equal(db.getFinderGlobalSetting('releaseDateFinder', 'perVariantAttemptBudget'), '5');
  });

  it('get returns null for missing row', () => {
    assert.equal(db.getFinderGlobalSetting('skuFinder', 'missing'), null);
  });

  it('list returns { key: value } map scoped to a single module', () => {
    db.upsertFinderGlobalSetting('keyFinder', 'bundlingEnabled', 'true');
    db.upsertFinderGlobalSetting('keyFinder', 'budgetFloor', '3');
    db.upsertFinderGlobalSetting('skuFinder', 'reRunBudget', '1');

    const keys = db.listFinderGlobalSettings('keyFinder');
    assert.deepEqual(keys, { bundlingEnabled: 'true', budgetFloor: '3' });

    const skus = db.listFinderGlobalSettings('skuFinder');
    assert.deepEqual(skus, { reRunBudget: '1' });
  });

  it('delete removes a single (module_id, key) row', () => {
    db.upsertFinderGlobalSetting('colorEditionFinder', 'a', '1');
    db.upsertFinderGlobalSetting('colorEditionFinder', 'b', '2');
    db.deleteFinderGlobalSetting('colorEditionFinder', 'a');
    assert.deepEqual(db.listFinderGlobalSettings('colorEditionFinder'), { b: '2' });
  });
});

// WHY: Rebuild contract — when app.sqlite is deleted and re-opened, the
// finder_global_settings table must be re-seeded from the durable JSON
// mirrors at category_authority/_global/<filePrefix>_settings.json.
describe('AppDb — reseedFinderGlobalSettingsFromJson', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-factory-appdb-'));
    fs.mkdirSync(path.join(tmpDir, '_global'), { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('seeds from matching _global/<filePrefix>_settings.json for every global finder', () => {
    // CEF (filePrefix: color_edition) and keyFinder (filePrefix: key_finder)
    fs.writeFileSync(
      path.join(tmpDir, '_global', 'color_edition_settings.json'),
      JSON.stringify({ urlHistoryEnabled: 'true', queryHistoryEnabled: 'true' }),
    );
    fs.writeFileSync(
      path.join(tmpDir, '_global', 'key_finder_settings.json'),
      JSON.stringify({ budgetFloor: '4', bundlingEnabled: 'true' }),
    );

    const db = createTestDb();
    try {
      const { seeded } = db.reseedFinderGlobalSettingsFromJson({ helperRoot: tmpDir });
      assert.equal(seeded, 4);
      assert.deepEqual(
        db.listFinderGlobalSettings('colorEditionFinder'),
        { urlHistoryEnabled: 'true', queryHistoryEnabled: 'true' },
      );
      assert.deepEqual(
        db.listFinderGlobalSettings('keyFinder'),
        { budgetFloor: '4', bundlingEnabled: 'true' },
      );
    } finally {
      db.close();
    }
  });

  it('skips missing JSON files without throwing', () => {
    const db = createTestDb();
    try {
      const { seeded } = db.reseedFinderGlobalSettingsFromJson({ helperRoot: tmpDir });
      assert.equal(seeded, 0);
    } finally {
      db.close();
    }
  });

  it('seeds mixed-scope PIF global entries and ignores PIF category entries', () => {
    fs.writeFileSync(
      path.join(tmpDir, '_global', 'product_images_settings.json'),
      JSON.stringify({ heroCount: '1', evalThumbSize: '1024', viewBudget: '["top"]' }),
    );

    const db = createTestDb();
    try {
      const { seeded } = db.reseedFinderGlobalSettingsFromJson({ helperRoot: tmpDir });
      assert.equal(seeded, 2);
      assert.deepEqual(db.listFinderGlobalSettings('productImageFinder'), {
        heroCount: '1',
        evalThumbSize: '1024',
      });
      assert.equal(db.getFinderGlobalSetting('productImageFinder', 'viewBudget'), null);
    } finally {
      db.close();
    }
  });

  it('does not fail on malformed JSON', () => {
    fs.writeFileSync(
      path.join(tmpDir, '_global', 'color_edition_settings.json'),
      'not valid json',
    );
    const db = createTestDb();
    try {
      const { seeded } = db.reseedFinderGlobalSettingsFromJson({ helperRoot: tmpDir });
      assert.equal(seeded, 0);
    } finally {
      db.close();
    }
  });
});
