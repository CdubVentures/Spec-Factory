import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

test('component payload does not synthesize attribute candidates without published product evidence', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3395',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '26000',
    confidence: 0.8,
    acceptedCandidateId: 'missing_component_candidate',
    needsReview: true,
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-test-synthetic-candidate',
    fieldKey: 'sensor',
    componentType: 'sensor',
    componentName: 'PAW3395',
    componentMaker: 'PixArt',
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
  });
  const row = payload.items.find((item) => item.name === 'PAW3395' && item.maker === 'PixArt');
  const prop = row?.properties?.dpi_max;

  assert.ok(row, 'expected PAW3395/PixArt row');
  assert.ok(prop, 'expected dpi_max property');
  assert.deepEqual(prop.candidates, []);
  assert.equal(prop.candidate_count, 0);
  assert.equal(prop.selected.value, null);
});
