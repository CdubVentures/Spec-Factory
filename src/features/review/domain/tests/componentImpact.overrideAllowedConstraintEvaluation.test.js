import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cascadeComponentChange,
  cleanupHarness,
  createHarness,
} from './helpers/componentImpactHarness.js';

test('cascadeComponentChange override_allowed evaluates constraints returning empty results (item_field_state retired)', async () => {
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
    assert.deepEqual(result.propagation?.constraint_violations, []);
    assert.deepEqual(result.propagation?.constraint_compliant, []);
  } finally {
    await cleanupHarness(harness);
  }
});
