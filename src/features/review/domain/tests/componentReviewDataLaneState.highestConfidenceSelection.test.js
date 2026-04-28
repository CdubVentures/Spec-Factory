import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

test('component payload leaves attribute value blank when no product value is published', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '32000',
    confidence: 0.42,
    needsReview: true,
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-test-top-candidate',
    fieldKey: 'sensor',
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
  const prop = row?.properties?.dpi_max;

  assert.ok(row, 'expected PAW3950/PixArt row');
  assert.ok(prop, 'expected dpi_max property');
  assert.equal(prop.selected.value, null);
  assert.deepEqual(prop.candidates, []);
  assert.equal(prop.candidate_count, prop.candidates.length);
});
