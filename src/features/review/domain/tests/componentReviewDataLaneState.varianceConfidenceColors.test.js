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
