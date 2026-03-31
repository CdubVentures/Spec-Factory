import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  insertCandidateRow,
  linkProductToComponent,
  upsertComponentLane,
  writeComponentReviewItems,
} from './helpers/componentReviewRowHarness.js';

test('component payload aggregates candidates from all linked products for every slot type', async (t) => {
  const { config, tempRoot, specDb } = await createComponentRowHarness(t);
  const componentType = 'sensor';
  const componentName = 'PAW3950';
  const componentMaker = 'PixArt';
  const propertyKeys = ['dpi_max', 'ips', 'acceleration'];
  const productIds = ['mouse-agg-p1', 'mouse-agg-p2', 'mouse-agg-p3'];

  for (const propKey of propertyKeys) {
    upsertComponentLane(specDb, {
      componentType,
      componentName,
      componentMaker,
      propertyKey: propKey,
      value: '1000',
      needsReview: true,
    });
  }

  for (const productId of productIds) {
    linkProductToComponent(specDb, {
      productId,
      fieldKey: 'sensor',
      componentType,
      componentName,
      componentMaker,
      matchType: 'exact',
    });

    insertCandidateRow(specDb, {
      candidate_id: `${productId}::sensor::name_a`,
      category: CATEGORY,
      product_id: productId,
      field_key: 'sensor',
      value: componentName,
      normalized_value: componentName.toLowerCase(),
      score: 0.95,
    });
    insertCandidateRow(specDb, {
      candidate_id: `${productId}::sensor::name_b`,
      category: CATEGORY,
      product_id: productId,
      field_key: 'sensor',
      value: componentName,
      normalized_value: componentName.toLowerCase(),
      score: 0.85,
      rank: 2,
      source_host: 'review.test',
      source_method: 'llm_extract',
      source_tier: 2,
    });
    insertCandidateRow(specDb, {
      candidate_id: `${productId}::sensor_brand::maker_a`,
      category: CATEGORY,
      product_id: productId,
      field_key: 'sensor_brand',
      value: componentMaker,
      normalized_value: componentMaker.toLowerCase(),
    });
    insertCandidateRow(specDb, {
      candidate_id: `${productId}::sensor_brand::maker_b`,
      category: CATEGORY,
      product_id: productId,
      field_key: 'sensor_brand',
      value: componentMaker,
      normalized_value: componentMaker.toLowerCase(),
      score: 0.8,
      rank: 2,
      source_host: 'review.test',
      source_method: 'llm_extract',
      source_tier: 2,
    });

    for (const propKey of propertyKeys) {
      insertCandidateRow(specDb, {
        candidate_id: `${productId}::${propKey}::prop_a`,
        category: CATEGORY,
        product_id: productId,
        field_key: propKey,
        value: '1000',
        normalized_value: '1000',
        score: 0.88,
        is_component_field: true,
        component_type: componentType,
      });
      insertCandidateRow(specDb, {
        candidate_id: `${productId}::${propKey}::prop_b`,
        category: CATEGORY,
        product_id: productId,
        field_key: propKey,
        value: '1000',
        normalized_value: '1000',
        score: 0.75,
        rank: 2,
        source_host: 'review.test',
        source_method: 'llm_extract',
        source_tier: 2,
        is_component_field: true,
        component_type: componentType,
      });
    }
  }

  writeComponentReviewItems(specDb, []);

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType,
    specDb,
  });
  const row = payload.items.find((item) => item.name === componentName && item.maker === componentMaker);

  assert.ok(row, 'expected component row');
  assert.equal((row.linked_products || []).length, 3);
  assert.equal(row.name_tracked.candidates.length, 6);
  assert.equal(row.name_tracked.candidate_count, row.name_tracked.candidates.length);
  assert.equal(row.maker_tracked.candidates.length, 6);
  assert.equal(row.maker_tracked.candidate_count, row.maker_tracked.candidates.length);

  for (const propKey of propertyKeys) {
    const prop = row.properties?.[propKey];
    assert.ok(prop, `property ${propKey} should exist`);
    assert.equal(prop.candidates.length, 6);
    assert.equal(prop.candidate_count, prop.candidates.length);
  }
});
