import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanupHarness,
  createHarness,
} from './helpers/componentImpactHarness.js';

test('evaluateConstraintsForLinkedProducts uses maker-specific component values for violations', async () => {
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

    harness.specDb.upsertItemFieldState({
      productId: 'mouse-c',
      fieldKey: 'dpi',
      value: '1500',
      confidence: 0.9,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
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
    harness.specDb.upsertComponentValue({
      componentType: 'sensor',
      componentName: 'focus-pro',
      componentMaker: 'MakerB',
      propertyKey: 'max_dpi',
      value: '3000',
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

    assert.equal(result.violations.includes('mouse-c'), true);

    const dpiState = harness.specDb.getItemFieldState('mouse-c').find((row) => row.field_key === 'dpi');
    assert.equal(Boolean(dpiState?.needs_ai_review), true);
  } finally {
    await cleanupHarness(harness);
  }
});
