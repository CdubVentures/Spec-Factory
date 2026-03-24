import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  makeCategoryAuthorityConfig,
  writeComponentReviewItems,
} from '../../tests/helpers/componentReviewHarness.js';

test('confidence boundaries are reflected in component payload slot colors', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const componentType = 'sensor';
    const boundaries = [
      { name: 'ZeroConf', confidence: 0, expected: 'gray' },
      { name: 'LowConf', confidence: 0.5, expected: 'red' },
      { name: 'MidConf', confidence: 0.8, expected: 'yellow' },
      { name: 'HighConf', confidence: 1.0, expected: 'green' },
    ];

    for (const { name, confidence } of boundaries) {
      specDb.upsertComponentIdentity({
        componentType,
        canonicalName: name,
        maker: 'TestMaker',
        links: null,
        source: 'test',
      });
      specDb.upsertComponentValue({
        componentType,
        componentName: name,
        componentMaker: 'TestMaker',
        propertyKey: 'dpi_max',
        value: '16000',
        confidence,
        variancePolicy: null,
        source: 'pipeline',
        acceptedCandidateId: null,
        needsReview: confidence < 0.85,
        overridden: false,
        constraints: [],
      });
    }

    await writeComponentReviewItems(tempRoot, []);

    const payload = await buildComponentReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      componentType,
      specDb,
    });

    for (const { name, expected } of boundaries) {
      const row = payload.items.find((item) => item.name === name);
      assert.ok(row);
      assert.strictEqual(row.properties?.dpi_max?.selected?.color, expected);
    }
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});

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

test('authoritative properties still flag variance violations in component payloads', async () => {
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
      variancePolicy: 'authoritative',
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });
    specDb.upsertItemComponentLink({
      productId: 'mouse-auth-test',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });
    specDb.upsertItemFieldState({
      productId: 'mouse-auth-test',
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
        rules: { fields: { max_dpi: { variance_policy: 'authoritative', constraints: [] } } },
        knownValues: { enums: {} },
      },
    });
    const prop = payload.items.find((item) => item.name === 'PAW3950')?.properties?.max_dpi;
    assert.ok(prop);
    assert.strictEqual(prop.variance_policy, 'authoritative');
    assert.strictEqual(prop.reason_codes.includes('variance_violation'), true);
    assert.ok(prop.variance_violations);
    assert.strictEqual(prop.variance_violations.count, 1);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
