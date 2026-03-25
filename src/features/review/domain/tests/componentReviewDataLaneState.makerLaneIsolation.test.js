import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  linkProductToComponent,
  upsertComponentLane,
  writeComponentReviewItems,
} from './helpers/componentReviewRowHarness.js';

test('component payload isolates same-name lanes by maker for linked-product candidate attribution', async (t) => {
  const { config, tempRoot, specDb } = await createComponentRowHarness(t);
  const componentType = 'switch';
  const componentName = 'Omron D2FC-F-7N';
  const makerA = 'Omron';
  const makerB = 'Huano';
  const propertyKey = 'actuation_force';
  const productsA = ['mouse-omron-a1', 'mouse-omron-a2'];
  const productsB = ['mouse-huano-b1', 'mouse-huano-b2'];

  const insertFieldCandidate = (productId, fieldKey, value, suffix, score = 0.9) => {
    specDb.insertCandidate({
      candidate_id: `${productId}::${fieldKey}::${suffix}`,
      category: CATEGORY,
      product_id: productId,
      field_key: fieldKey,
      value,
      normalized_value: String(value).toLowerCase(),
      score,
      rank: 1,
      source_host: 'contract.test',
      source_method: 'pipeline_extract',
      source_tier: 1,
    });
  };

  const seedLane = (maker, forceValue) => {
    upsertComponentLane(specDb, {
      componentType,
      componentName,
      componentMaker: maker,
      propertyKey,
      value: String(forceValue),
      needsReview: true,
    });
  };

  const linkAndSeedCandidates = (productId, maker, forceValue) => {
    linkProductToComponent(specDb, {
      productId,
      fieldKey: 'switch',
      componentType,
      componentName,
      componentMaker: maker,
    });
    insertFieldCandidate(productId, 'switch', componentName, 'name', 0.95);
    insertFieldCandidate(productId, 'switch_brand', maker, 'maker');
    insertFieldCandidate(productId, propertyKey, String(forceValue), 'value', 0.88);
  };

  seedLane(makerA, 55);
  seedLane(makerB, 65);
  for (const productId of productsA) {
    linkAndSeedCandidates(productId, makerA, 55);
  }
  for (const productId of productsB) {
    linkAndSeedCandidates(productId, makerB, 65);
  }

  await writeComponentReviewItems(tempRoot, [
    {
      review_id: 'rv_switch_omron',
      category: CATEGORY,
      component_type: componentType,
      field_key: 'switch',
      raw_query: componentName,
      matched_component: componentName,
      match_type: 'exact',
      status: 'pending_ai',
      product_id: productsA[0],
      created_at: '2026-02-20T00:00:00.000Z',
      product_attributes: {
        switch_brand: makerA,
        [propertyKey]: '55',
      },
    },
    {
      review_id: 'rv_switch_huano',
      category: CATEGORY,
      component_type: componentType,
      field_key: 'switch',
      raw_query: componentName,
      matched_component: componentName,
      match_type: 'exact',
      status: 'pending_ai',
      product_id: productsB[0],
      created_at: '2026-02-20T00:00:01.000Z',
      product_attributes: {
        switch_brand: makerB,
        [propertyKey]: '65',
      },
    },
  ]);

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType,
    specDb,
  });
  const rowA = payload.items.find((item) => item.name === componentName && item.maker === makerA);
  const rowB = payload.items.find((item) => item.name === componentName && item.maker === makerB);
  const makerValuesA = new Set(
    (rowA?.maker_tracked?.candidates || []).map((candidate) => String(candidate?.value || '').trim()),
  );
  const makerValuesB = new Set(
    (rowB?.maker_tracked?.candidates || []).map((candidate) => String(candidate?.value || '').trim()),
  );
  const propCandidatesA = rowA?.properties?.[propertyKey]?.candidates || [];
  const propCandidatesB = rowB?.properties?.[propertyKey]?.candidates || [];

  assert.ok(rowA, 'expected maker A row');
  assert.ok(rowB, 'expected maker B row');
  assert.equal((rowA.linked_products || []).length, 2);
  assert.equal((rowB.linked_products || []).length, 2);
  assert.equal(makerValuesA.has(makerA), true);
  assert.equal(makerValuesA.has(makerB), false);
  assert.equal(makerValuesB.has(makerB), true);
  assert.equal(makerValuesB.has(makerA), false);
  assert.equal(propCandidatesA.length, 2);
  assert.equal(propCandidatesB.length, 2);
  assert.equal(propCandidatesA.every((candidate) => String(candidate?.value || '') === '55'), true);
  assert.equal(propCandidatesB.every((candidate) => String(candidate?.value || '') === '65'), true);
});
