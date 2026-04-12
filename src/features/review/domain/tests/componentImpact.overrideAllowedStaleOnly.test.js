import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cascadeComponentChange,
  cleanupHarness,
  createHarness,
} from './helpers/componentImpactHarness.js';

test('cascadeComponentChange override_allowed returns stale_only with empty results (item_field_state retired)', async () => {
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
  } finally {
    await cleanupHarness(harness);
  }
});
