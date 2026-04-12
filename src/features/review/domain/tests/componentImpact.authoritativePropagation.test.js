import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cascadeComponentChange,
  cleanupHarness,
  createHarness,
} from './helpers/componentImpactHarness.js';

test('cascadeComponentChange authoritative returns value_pushed with empty updated list (item_field_state retired)', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-a',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-b',
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
      variancePolicy: 'authoritative',
      constraints: [],
      specDb: harness.specDb,
    });

    assert.equal(result.propagation?.action, 'value_pushed');
    assert.deepEqual(result.propagation?.updated, []);
  } finally {
    await cleanupHarness(harness);
  }
});
