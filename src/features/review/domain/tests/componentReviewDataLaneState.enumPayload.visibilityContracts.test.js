import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildEnumReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  makeCategoryAuthorityConfig,
} from '../../tests/helpers/componentReviewHarness.js';

test('enum payload hides pending pipeline values without linked products', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const linkedProductId = 'mouse-test-enum-linked';
    specDb.upsertListValue({
      fieldKey: 'connection',
      value: 'Bluetooth',
      normalizedValue: 'bluetooth',
      source: 'pipeline',
      enumPolicy: 'closed',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      sourceTimestamp: '2026-02-18T00:00:00.000Z',
    });
    specDb.upsertListValue({
      fieldKey: 'connection',
      value: 'Wireless',
      normalizedValue: 'wireless',
      source: 'pipeline',
      enumPolicy: 'closed',
      acceptedCandidateId: null,
      needsReview: true,
      overridden: false,
      sourceTimestamp: '2026-02-18T00:00:00.000Z',
    });
    specDb.upsertItemFieldState({
      productId: linkedProductId,
      fieldKey: 'connection',
      value: 'Bluetooth',
      confidence: 0.6,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: true,
      aiReviewComplete: false,
    });
    specDb.syncItemListLinkForFieldValue({
      productId: linkedProductId,
      fieldKey: 'connection',
      value: 'Bluetooth',
    });

    const payload = await buildEnumReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      specDb,
    });
    const field = payload.fields.find((entry) => entry.field === 'connection');
    const values = (field?.values || []).map((entry) => String(entry?.value || ''));

    assert.equal(values.includes('Bluetooth'), true);
    assert.equal(values.includes('Wireless'), false);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
