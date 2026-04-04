import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cascadeEnumChange,
  cleanupHarness,
  createHarness,
} from './helpers/componentImpactHarness.js';

test('cascadeEnumChange honors preAffectedProductIds for rename cascades', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-e',
      fieldKey: 'connection',
      value: 'Wireless',
      confidence: 1,
      source: 'known_values',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-f',
      fieldKey: 'connection',
      value: 'Wireless',
      confidence: 1,
      source: 'known_values',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    const result = await cascadeEnumChange({
      storage: harness.storage,
      outputRoot: harness.outputRoot,
      category: harness.category,
      field: 'connection',
      action: 'rename',
      value: '2.4ghz',
      newValue: 'Wireless',
      preAffectedProductIds: ['mouse-e', 'mouse-f'],
      specDb: harness.specDb,
    });

    assert.equal(result.affected.length, 2);
  } finally {
    await cleanupHarness(harness);
  }
});
