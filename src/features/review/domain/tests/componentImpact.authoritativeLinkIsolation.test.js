import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cascadeComponentChange,
  cleanupHarness,
  createHarness,
} from './helpers/componentImpactHarness.js';

test('cascadeComponentChange authoritative updates linked items only and ignores unlinked value matches', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-linked-only',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });

    harness.specDb.upsertItemFieldState({
      productId: 'mouse-linked-only',
      fieldKey: 'max_dpi',
      value: '26000',
      confidence: 0.9,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-unlinked-only',
      fieldKey: 'sensor',
      value: 'PAW3950',
      confidence: 0.7,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-unlinked-only',
      fieldKey: 'max_dpi',
      value: '27000',
      confidence: 0.7,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    await cascadeComponentChange({
      storage: harness.storage,
      outputRoot: harness.outputRoot,
      category: harness.category,
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      changedProperty: 'max_dpi',
      newValue: '35000',
      variancePolicy: 'authoritative',
      constraints: [],
      specDb: harness.specDb,
    });

    const linked = harness.specDb.getItemFieldState('mouse-linked-only').find((row) => row.field_key === 'max_dpi');
    const unlinked = harness.specDb.getItemFieldState('mouse-unlinked-only').find((row) => row.field_key === 'max_dpi');
    assert.equal(linked?.value, '35000');
    assert.equal(unlinked?.value, '27000');
  } finally {
    await cleanupHarness(harness);
  }
});
