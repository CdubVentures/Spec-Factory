import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildEnumReviewPayloads,
  cleanupTempSpecDb,
  createTempSpecDb,
  getEnumSlot,
  makeCategoryAuthorityConfig,
} from '../../tests/helpers/componentReviewHarness.js';

test('enum payload keeps pending when AI shared lane is pending even if user accepted', async () => {
  const { tempRoot, specDb } = await createTempSpecDb();
  try {
    const productId = 'mouse-test-enum-pending';
    specDb.upsertListValue({
      fieldKey: 'connection',
      value: 'Bluetooth',
      normalizedValue: 'bluetooth',
      source: 'pipeline',
      enumPolicy: 'closed',
      acceptedCandidateId: 'cand_bt',
      needsReview: true,
      overridden: false,
      sourceTimestamp: '2026-02-18T00:00:00.000Z',
    });
    specDb.upsertKeyReviewState({
      category: CATEGORY,
      targetKind: 'enum_key',
      fieldKey: 'connection',
      enumValueNorm: 'bluetooth',
      ...getEnumSlot(specDb, 'connection', 'Bluetooth'),
      selectedValue: 'Bluetooth',
      selectedCandidateId: 'cand_bt',
      confidenceScore: 0.6,
      aiConfirmSharedStatus: 'pending',
      userAcceptSharedStatus: 'accepted',
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
    assert.equal(Boolean(value?.needs_review), true);
  } finally {
    await cleanupTempSpecDb(tempRoot, specDb);
  }
});
