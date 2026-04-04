import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cascadeComponentChange,
  cleanupHarness,
  createHarness,
} from './helpers/componentImpactHarness.js';

test('cascadeComponentChange override_allowed marks products stale without pushing values and keeps lowest priority', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-override-a',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-override-b',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });

    harness.specDb.upsertItemFieldState({
      productId: 'mouse-override-a',
      fieldKey: 'max_dpi',
      value: '26000',
      confidence: 0.8,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });
    harness.specDb.upsertItemFieldState({
      productId: 'mouse-override-b',
      fieldKey: 'max_dpi',
      value: '30000',
      confidence: 0.8,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    const result = await cascadeComponentChange({
      storage: harness.storage,
      outputRoot: harness.outputRoot,
      category: harness.category,
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      changedProperty: 'max_dpi',
      newValue: '35000',
      variancePolicy: 'override_allowed',
      constraints: [],
      specDb: harness.specDb,
    });

    assert.equal(result.propagation?.action, 'stale_only');
    assert.deepEqual(result.propagation?.updated, []);
    assert.deepEqual(result.propagation?.violations, []);

    const stateA = harness.specDb.getItemFieldState('mouse-override-a').find((row) => row.field_key === 'max_dpi');
    const stateB = harness.specDb.getItemFieldState('mouse-override-b').find((row) => row.field_key === 'max_dpi');
    assert.equal(stateA?.value, '26000');
    assert.equal(stateB?.value, '30000');
  } finally {
    await cleanupHarness(harness);
  }
});
