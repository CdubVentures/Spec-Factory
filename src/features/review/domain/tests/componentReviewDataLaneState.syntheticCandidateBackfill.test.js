import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

test('component payload synthesizes backing candidate for selected non-user value when candidate id is missing', async (t) => {
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
  assert.equal(
    prop.candidates.some((candidate) => candidate.candidate_id === 'missing_component_candidate'),
    true,
  );
  assert.equal(prop.candidate_count >= 1, true);
  assert.equal(prop.selected.value, '26000');
});
