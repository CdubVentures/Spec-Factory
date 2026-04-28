import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  insertProductFieldCandidate,
  linkProductToComponent,
  upsertComponentLane,
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
  }
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-agg-p1',
    fieldKey: 'dpi_max',
    value: '35000',
    status: 'resolved',
    confidence: 95,
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-agg-p2',
    fieldKey: 'dpi_max',
    value: '34000',
    status: 'candidate',
    confidence: 99,
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType,
    specDb,
  });
  const row = payload.items.find((item) => item.name === componentName && item.maker === componentMaker);

  assert.ok(row, 'expected component row');
  assert.equal((row.linked_products || []).length, 3);
  // With candidates table removed, tracked slots contain only the
  // fallback candidate from ensureTrackedStateCandidateInvariant.
  assert.ok(row.name_tracked.candidates.length >= 1, 'name_tracked has fallback candidate');
  assert.equal(row.name_tracked.candidate_count, row.name_tracked.candidates.length);
  assert.ok(row.maker_tracked.candidates.length >= 1, 'maker_tracked has fallback candidate');
  assert.equal(row.maker_tracked.candidate_count, row.maker_tracked.candidates.length);

  for (const propKey of propertyKeys) {
    const prop = row.properties?.[propKey];
    assert.ok(prop, `property ${propKey} should exist`);
    assert.equal(prop.selected.value, null, `${propKey} has no component-level published value`);
    assert.equal(prop.candidate_count, prop.candidates.length);
  }
  assert.deepEqual(
    row.properties.dpi_max.candidates.map((candidate) => String(candidate.value)),
    ['35000'],
  );
  assert.deepEqual(row.properties.ips.candidates, []);
  assert.deepEqual(row.properties.acceleration.candidates, []);
});
