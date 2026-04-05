import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SpecDb } from '../specDb.js';
import { reconcileComponentOverrideRows } from '../seed.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function makeOverrideFile({ componentType, name, maker = '', reviewStatus, aliases, properties }) {
  const ovr = { componentType, name, identity: { maker } };
  if (reviewStatus) ovr.review_status = reviewStatus;
  if (aliases) ovr.identity.aliases = aliases;
  if (properties) ovr.properties = properties;
  return ovr;
}

function seedOverrideRow(db, { componentType, componentName, maker = '', propertyKey, value = 'test' }) {
  db.upsertComponentValue({
    componentType,
    componentName,
    componentMaker: maker,
    propertyKey,
    value,
    confidence: 1.0,
    source: 'user',
    overridden: true,
  });
}

function seedComponentIdentity(db, { componentType, name, maker = '', reviewStatus = null }) {
  db.db.prepare(`
    INSERT OR IGNORE INTO component_identity (category, component_type, canonical_name, maker, review_status)
    VALUES (?, ?, ?, ?, ?)
  `).run(db.category, componentType, name, maker, reviewStatus);
  if (reviewStatus) {
    db.db.prepare(`
      UPDATE component_identity SET review_status = ? WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?
    `).run(reviewStatus, db.category, componentType, name, maker);
  }
}

describe('reconcileComponentOverrideRows', () => {
  let db;
  let tmpDir;
  let config;

  beforeEach(() => {
    db = createHarness();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'comp-ovr-reconcile-'));
    config = { categoryAuthorityRoot: tmpDir };
    // Create base directory structure
    fs.mkdirSync(path.join(tmpDir, 'mouse', '_overrides', 'components'), { recursive: true });
  });
  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('stale override rows deleted when file removed', async () => {
    // Seed a component identity + override value into SQL
    seedComponentIdentity(db, { componentType: 'sensor', name: 'PAW3950', maker: 'PixArt' });
    seedOverrideRow(db, { componentType: 'sensor', componentName: 'PAW3950', maker: 'PixArt', propertyKey: 'max_dpi' });

    // No override file on disk → stale rows should be pruned
    const result = await reconcileComponentOverrideRows(db, config, 'mouse');
    assert.ok(result.removed_override_value_rows >= 1, 'should remove stale override value row');

    const values = db.db.prepare(
      'SELECT * FROM component_values WHERE category = ? AND overridden = 1'
    ).all('mouse');
    assert.equal(values.length, 0, 'no overridden rows should remain');
  });

  test('surviving override files keep their property rows', async () => {
    seedComponentIdentity(db, { componentType: 'sensor', name: 'PAW3950', maker: 'PixArt' });
    seedOverrideRow(db, { componentType: 'sensor', componentName: 'PAW3950', maker: 'PixArt', propertyKey: 'max_dpi' });

    // Write the override file that matches the seeded data
    const overrideFile = makeOverrideFile({
      componentType: 'sensor', name: 'PAW3950', maker: 'PixArt',
      properties: { max_dpi: '30000' },
    });
    fs.writeFileSync(
      path.join(tmpDir, 'mouse', '_overrides', 'components', 'sensor_paw3950.json'),
      JSON.stringify(overrideFile, null, 2),
    );

    const result = await reconcileComponentOverrideRows(db, config, 'mouse');
    assert.equal(result.removed_override_value_rows, 0, 'should not remove surviving override rows');

    const values = db.db.prepare(
      'SELECT * FROM component_values WHERE category = ? AND overridden = 1'
    ).all('mouse');
    assert.equal(values.length, 1, 'override row should survive');
  });

  test('property removal within surviving file deletes that property row', async () => {
    seedComponentIdentity(db, { componentType: 'sensor', name: 'PAW3950', maker: 'PixArt' });
    seedOverrideRow(db, { componentType: 'sensor', componentName: 'PAW3950', maker: 'PixArt', propertyKey: 'max_dpi' });
    seedOverrideRow(db, { componentType: 'sensor', componentName: 'PAW3950', maker: 'PixArt', propertyKey: 'max_tracking_speed' });

    // File only has max_dpi, not max_tracking_speed
    const overrideFile = makeOverrideFile({
      componentType: 'sensor', name: 'PAW3950', maker: 'PixArt',
      properties: { max_dpi: '30000' },
    });
    fs.writeFileSync(
      path.join(tmpDir, 'mouse', '_overrides', 'components', 'sensor_paw3950.json'),
      JSON.stringify(overrideFile, null, 2),
    );

    const result = await reconcileComponentOverrideRows(db, config, 'mouse');
    assert.equal(result.removed_override_value_rows, 1, 'should remove the stale property row');

    const values = db.db.prepare(
      'SELECT property_key FROM component_values WHERE category = ? AND overridden = 1'
    ).all('mouse');
    assert.equal(values.length, 1);
    assert.equal(values[0].property_key, 'max_dpi');
  });

  test('missing override directory clears ALL override-backed rows', async () => {
    seedComponentIdentity(db, { componentType: 'sensor', name: 'PAW3950', maker: 'PixArt' });
    seedOverrideRow(db, { componentType: 'sensor', componentName: 'PAW3950', maker: 'PixArt', propertyKey: 'max_dpi' });

    // Delete the override directory entirely
    fs.rmSync(path.join(tmpDir, 'mouse', '_overrides', 'components'), { recursive: true });

    const result = await reconcileComponentOverrideRows(db, config, 'mouse');
    assert.ok(result.removed_override_value_rows >= 1, 'should clear override rows when directory is missing');
  });

  test('review_status reset for stale overrides', async () => {
    seedComponentIdentity(db, { componentType: 'sensor', name: 'PAW3950', maker: 'PixArt', reviewStatus: 'approved' });
    seedOverrideRow(db, { componentType: 'sensor', componentName: 'PAW3950', maker: 'PixArt', propertyKey: 'max_dpi' });

    // No override file → should reset review_status
    const result = await reconcileComponentOverrideRows(db, config, 'mouse');
    assert.ok(result.reset_review_status_rows >= 1);

    const row = db.db.prepare(
      'SELECT review_status FROM component_identity WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?'
    ).get('mouse', 'sensor', 'PAW3950', 'PixArt');
    assert.equal(row.review_status, null, 'review_status should be reset to NULL');
  });

  test('aliases_overridden reset + user aliases deleted for stale overrides', async () => {
    seedComponentIdentity(db, { componentType: 'sensor', name: 'PAW3950', maker: 'PixArt' });
    // Set aliases_overridden flag
    db.updateAliasesOverridden('sensor', 'PAW3950', 'PixArt', true);
    // Insert a user alias
    const idRow = db.db.prepare(
      'SELECT id FROM component_identity WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?'
    ).get('mouse', 'sensor', 'PAW3950', 'PixArt');
    if (idRow) db.insertAlias(idRow.id, 'paw-3950', 'user');
    seedOverrideRow(db, { componentType: 'sensor', componentName: 'PAW3950', maker: 'PixArt', propertyKey: 'max_dpi' });

    // No override file → should clean up
    const result = await reconcileComponentOverrideRows(db, config, 'mouse');
    assert.ok(result.removed_alias_rows >= 1);

    const identity = db.db.prepare(
      'SELECT aliases_overridden FROM component_identity WHERE category = ? AND component_type = ? AND canonical_name = ? AND maker = ?'
    ).get('mouse', 'sensor', 'PAW3950', 'PixArt');
    assert.equal(identity.aliases_overridden, 0, 'aliases_overridden should be reset to 0');

    const aliases = db.db.prepare(
      "SELECT * FROM component_aliases WHERE component_id = ? AND source = 'user'"
    ).all(idRow.id);
    assert.equal(aliases.length, 0, 'user aliases should be deleted');
  });

  test('no existing override rows = no-op (no crash)', async () => {
    const result = await reconcileComponentOverrideRows(db, config, 'mouse');
    assert.equal(result.removed_override_value_rows, 0);
    assert.equal(result.removed_alias_rows, 0);
    assert.equal(result.reset_review_status_rows, 0);
  });
});
