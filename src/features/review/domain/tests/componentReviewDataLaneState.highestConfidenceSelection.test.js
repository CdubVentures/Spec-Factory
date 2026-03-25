import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  insertCandidateRow,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

test('component payload defaults non-user slot selection to highest-confidence candidate', async (t) => {
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
  insertCandidateRow(specDb, {
    candidate_id: 'cand_low',
    category: CATEGORY,
    product_id: 'mouse-test-top-candidate',
    field_key: 'dpi_max',
    value: '32000',
    normalized_value: '32000',
    score: 0.42,
    source_host: 'low.example',
    source_tier: 2,
  });
  insertCandidateRow(specDb, {
    candidate_id: 'cand_high',
    category: CATEGORY,
    product_id: 'mouse-test-top-candidate',
    field_key: 'dpi_max',
    value: '35000',
    normalized_value: '35000',
    score: 0.93,
    source_host: 'high.example',
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
  assert.equal(prop.selected.value, '35000');
  assert.equal(String(prop.candidates?.[0]?.candidate_id || '').endsWith('cand_high'), true);
  assert.equal(prop.source, 'specdb');
});
