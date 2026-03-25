import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cascadeEnumChange,
  cleanupHarness,
  createHarness,
  loadQueueState,
  saveQueueState,
  upsertQueueRow,
} from './helpers/componentImpactHarness.js';

test('cascadeEnumChange honors preAffectedProductIds for rename cascades', async () => {
  const harness = await createHarness();
  try {
    upsertQueueRow(harness.specDb, 'mouse-e', 'complete');
    upsertQueueRow(harness.specDb, 'mouse-f', 'complete');

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
      loadQueueState,
      saveQueueState,
      specDb: harness.specDb,
    });

    assert.equal(result.cascaded, 2);

    const queueE = harness.specDb.getQueueProduct('mouse-e');
    const queueF = harness.specDb.getQueueProduct('mouse-f');
    assert.equal(queueE?.status, 'stale');
    assert.equal(queueF?.status, 'stale');
    assert.equal(queueE?.dirty_flags?.some((flag) => flag.reason === 'enum_renamed'), true);
    assert.equal(queueF?.dirty_flags?.some((flag) => flag.reason === 'enum_renamed'), true);
  } finally {
    await cleanupHarness(harness);
  }
});
