import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupHarness,
  createHarness,
  findProductsReferencingComponent,
} from './helpers/componentImpactHarness.js';

test('findProductsReferencingComponent finds linked products via item_component_links', async () => {
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
  } finally {
    await cleanupHarness(harness);
  }
});
