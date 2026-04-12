import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanupHarness,
  createHarness,
} from './helpers/componentImpactHarness.js';

test('evaluateConstraintsForLinkedProducts returns empty violations and compliant (item_field_state retired)', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-c',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'focus-pro',
      componentMaker: 'MakerA',
      matchType: 'exact',
      matchScore: 1,
    });

    harness.specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'focus-pro',
      componentMaker: 'MakerA',
      propertyKey: 'max_dpi',
      value: '1000',
      confidence: 1,
      variancePolicy: null,
      source: 'component_db',
      acceptedCandidateId: null,
      needsReview: false,
      overridden: false,
      constraints: [],
    });

    const result = harness.specDb.evaluateConstraintsForLinkedProducts(
      'sensor',
      'focus-pro',
      'MakerA',
      'dpi',
      ['dpi <= max_dpi'],
    );

    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.compliant, []);
  } finally {
    await cleanupHarness(harness);
  }
});
