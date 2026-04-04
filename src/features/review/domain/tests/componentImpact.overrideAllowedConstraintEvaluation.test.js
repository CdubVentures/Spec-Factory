import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cascadeComponentChange,
  cleanupHarness,
  createHarness,
} from './helpers/componentImpactHarness.js';

test('cascadeComponentChange override_allowed still evaluates constraints', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-oc',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });

    harness.specDb.upsertComponentValue({
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

    harness.specDb.upsertItemFieldState({
      productId: 'mouse-oc',
      fieldKey: 'dpi',
      value: '40000',
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
      constraints: ['dpi <= max_dpi'],
      specDb: harness.specDb,
    });

    assert.equal(result.propagation?.action, 'stale_only');
    assert.equal(Array.isArray(result.propagation?.constraint_violations), true);
  } finally {
    await cleanupHarness(harness);
  }
});
