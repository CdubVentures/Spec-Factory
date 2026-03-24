import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupHarness,
  createHarness,
  findProductsReferencingComponent,
} from './helpers/componentImpactHarness.js';

test('findProductsReferencingComponent includes linked and unlinked field-state matches', async () => {
  const harness = await createHarness();
  try {
    harness.specDb.upsertItemComponentLink({
      productId: 'mouse-linked',
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      matchType: 'exact',
      matchScore: 1,
    });

    harness.specDb.upsertItemFieldState({
      productId: 'mouse-unlinked',
      fieldKey: 'sensor',
      value: 'PAW3950',
      confidence: 0.7,
      source: 'pipeline',
      acceptedCandidateId: null,
      overridden: false,
      needsAiReview: false,
      aiReviewComplete: false,
    });

    const affected = await findProductsReferencingComponent({
      outputRoot: harness.outputRoot,
      category: harness.category,
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
      specDb: harness.specDb,
    });

    const productIds = new Set(affected.map((row) => row.productId));
    assert.equal(productIds.has('mouse-linked'), true);
    assert.equal(productIds.has('mouse-unlinked'), true);
  } finally {
    await cleanupHarness(harness);
  }
});
