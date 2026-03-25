import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  makeCategoryAuthorityConfig,
} from '../../tests/helpers/componentReviewHarness.js';

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
