// WHY: Verifies purgeStore cascade operations correctly delete child rows
// for category and product-level purges. Phase 1b removed key_review tables.

import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { SpecDb } from '../specDb.js';

function createHarness() {
  const specDb = new SpecDb({ dbPath: ':memory:', category: '_test_purge' });
  return { specDb, db: specDb.db };
}

function count(db, table, where = '', ...params) {
  const sql = where ? `SELECT COUNT(*) as c FROM ${table} WHERE ${where}` : `SELECT COUNT(*) as c FROM ${table}`;
  return db.prepare(sql).get(...params).c;
}

describe('purgeStore — purgeCategoryState', () => {
  it('clears component and enum data for test category', () => {
    const { specDb, db } = createHarness();

    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'TestSensor',
      maker: 'TestMaker',
      source: 'test',
    });

    specDb.purgeCategoryState('_test_purge');

    strictEqual(count(db, 'component_identity'), 0, 'component_identity deleted');
  });

  it('rejects non-test categories gracefully', () => {
    const { specDb } = createHarness();
    const result = specDb.purgeCategoryState('mouse');
    strictEqual(typeof result.clearedComponentData, 'number');
  });

  it('does not throw on source_intel tables without category column', () => {
    const { specDb } = createHarness();
    // Should not throw — broken deletes should be removed or silently handled
    const result = specDb.purgeCategoryState('_test_purge');
    strictEqual(typeof result.clearedArtifacts, 'number');
  });
});

describe('purgeStore — purgeProductReviewState', () => {
  it('clears links for the product', () => {
    const { specDb, db } = createHarness();

    specDb.upsertItemComponentLink({
      productId: 'prod-target',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'TestSensor',
      componentMaker: 'TestMaker',
      matchType: 'exact',
      matchScore: 1,
    });

    specDb.purgeProductReviewState('_test_purge', 'prod-target');

    strictEqual(count(db, 'item_component_links', "product_id = 'prod-target'"), 0, 'links deleted');
  });
});
