import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  makeCategoryAuthorityConfig,
} from '../../tests/helpers/componentReviewHarness.js';

test('component payload inherits constraints from field rules, not DB row', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'TestSensor',
      maker: 'TestMaker',
      links: [],
      source: 'component_db',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'TestSensor',
      componentMaker: 'TestMaker',
      propertyKey: 'sensor_date',
      value: '2024-01',
      confidence: 1,
      variancePolicy: 'authoritative',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: null,
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-constraints',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'TestSensor',
      componentMaker: 'TestMaker',
      matchType: 'exact',
      matchScore: 1,
    });

    const fieldRules = {
      rules: {
        fields: {
          sensor_date: {
            variance_policy: 'authoritative',
            constraints: ['sensor_date <= release_date'],
          },
        },
      },
      knownValues: { enums: {} },
    };

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
      fieldRules,
    });
    const row = payload.items.find((item) => item.name === 'TestSensor' && item.maker === 'TestMaker');

    assert.ok(row);
    assert.deepStrictEqual(row.properties.sensor_date.constraints, ['sensor_date <= release_date']);
    assert.strictEqual(row.properties.sensor_date.variance_policy, 'authoritative');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
