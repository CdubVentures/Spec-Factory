import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildEnumReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  makeCategoryAuthorityConfig,
} from '../../tests/helpers/componentReviewHarness.js';

test('enum payload synthesizes backing candidate when selected non-manual value has no candidate row', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const productId = 'mouse-test-enum-synth';
    specDb.upsertListValue({
      fieldKey: 'connection',
      value: 'Bluetooth',
      normalizedValue: 'bluetooth',
      source: 'pipeline',
      enumPolicy: 'closed',
      acceptedCandidateId: 'enum_missing_candidate',
      needsReview: true,
      overridden: false,
      sourceTimestamp: '2026-02-18T00:00:00.000Z',
    });
    specDb.upsertItemFieldState({
      productId,
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
      productId,
      fieldKey: 'connection',
      value: 'Bluetooth',
    });

    const payload = await buildEnumReviewPayloads({
      config: makeCategoryAuthorityConfig(tempRoot),
      category: CATEGORY,
      specDb,
    });
    const field = payload.fields.find((entry) => entry.field === 'connection');
    const value = field?.values.find((entry) => entry.value === 'Bluetooth');

    assert.ok(value, 'expected connection=Bluetooth entry');
    assert.equal(
      value.candidates.some((candidate) => String(candidate?.value || '').toLowerCase() === 'bluetooth'),
      true,
    );
    assert.equal(value.candidates.length >= 1, true);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
