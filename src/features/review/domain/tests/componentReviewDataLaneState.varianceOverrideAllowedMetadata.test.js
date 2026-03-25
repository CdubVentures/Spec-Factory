import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  makeCategoryAuthorityConfig,
} from '../../tests/helpers/componentReviewHarness.js';

test('override_allowed properties skip variance violations in component payloads', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    specDb.upsertComponentIdentity({
      componentType: 'sensor',
      canonicalName: 'PAW3950',
      maker: 'PixArt',
      links: [],
      source: 'component_db',
    });
    specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      propertyKey: 'max_dpi',
      value: '35000',
      confidence: 1,
      variancePolicy: 'override_allowed',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-override-test',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });
    specDb.upsertItemFieldState({
      productId: 'mouse-override-test',
      fieldKey: 'max_dpi',
      value: '26000',
      confidence: 0.8,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType: 'sensor',
      specDb,
      fieldRules: {
        rules: { fields: { max_dpi: { variance_policy: 'override_allowed', constraints: [] } } },
        knownValues: { enums: {} },
      },
    });
    const prop = payload.items.find((item) => item.name === 'PAW3950')?.properties?.max_dpi;
    assert.ok(prop);
    assert.strictEqual(prop.variance_policy, 'override_allowed');
    assert.strictEqual(prop.reason_codes.includes('variance_violation'), false);
    assert.strictEqual(prop.variance_violations, undefined);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
