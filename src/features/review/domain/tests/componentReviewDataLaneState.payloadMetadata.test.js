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

test('component payload includes enum_values and enum_policy from field rules', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'encoder',
      canonicalName: 'TestEncoder',
      maker: 'TestMaker',
      links: [],
      source: 'component_db',
    });
    specDb.upsertComponentValue({
      componentType: 'encoder',
      componentName: 'TestEncoder',
      componentMaker: 'TestMaker',
      propertyKey: 'encoder_steps',
      value: '20',
      confidence: 1,
      variancePolicy: 'authoritative',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-enum',
      fieldKey: 'encoder',
      componentType: 'encoder',
      componentName: 'TestEncoder',
      componentMaker: 'TestMaker',
      matchType: 'exact',
      matchScore: 1,
    });

    const fieldRules = {
      rules: {
        fields: {
          encoder_steps: {
            variance_policy: 'authoritative',
            constraints: [],
            enum: { policy: 'closed', source: 'data_lists.encoder_steps' },
          },
        },
      },
      knownValues: {
        enums: {
          encoder_steps: { policy: 'closed', values: ['5', '16', '18', '20', '24'] },
        },
      },
    };

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'encoder',
      specDb,
      fieldRules,
    });
    const row = payload.items.find((item) => item.name === 'TestEncoder');
    assert.ok(row);
    assert.deepStrictEqual(row.properties.encoder_steps.enum_values, ['5', '16', '18', '20', '24']);
    assert.strictEqual(row.properties.encoder_steps.enum_policy, 'closed');
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

test('component payload strips review-disabled constraints and enum metadata from field rules', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'encoder',
      canonicalName: 'TestEncoderGate',
      maker: 'TestMaker',
      links: [],
      source: 'component_db',
    });
    specDb.upsertComponentValue({
      componentType: 'encoder',
      componentName: 'TestEncoderGate',
      componentMaker: 'TestMaker',
      propertyKey: 'encoder_steps',
      value: '20',
      confidence: 1,
      variancePolicy: 'authoritative',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-test-enum-gates',
      fieldKey: 'encoder',
      componentType: 'encoder',
      componentName: 'TestEncoderGate',
      componentMaker: 'TestMaker',
      matchType: 'exact',
      matchScore: 1,
    });

    const fieldRules = {
      rules: {
        fields: {
          encoder_steps: {
            variance_policy: 'authoritative',
            constraints: ['encoder_steps <= 32'],
            enum: { policy: 'closed', source: 'data_lists.encoder_steps' },
            consumers: {
              constraints: { review: false },
              'enum.source': { review: false },
              'enum.policy': { review: false },
            },
          },
        },
      },
      knownValues: {
        enums: {
          encoder_steps: { policy: 'closed', values: ['5', '16', '18', '20', '24'] },
        },
      },
    };

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'encoder',
      specDb,
      fieldRules,
    });
    const row = payload.items.find((item) => item.name === 'TestEncoderGate');
    assert.ok(row);
    assert.deepStrictEqual(row.properties.encoder_steps.constraints, []);
    assert.strictEqual(row.properties.encoder_steps.enum_values, null);
    assert.strictEqual(row.properties.encoder_steps.enum_policy, null);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
