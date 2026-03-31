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

test('component payload does not hydrate queue-only property candidates when linked product candidates drive the slot', async (t) => {
  const { config, tempRoot, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-test-paw3950',
    fieldKey: 'sensor',
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
  });

  writeComponentReviewItems(specDb, [
    {
      review_id: 'rv_1',
      category: CATEGORY,
      component_type: 'sensor',
      field_key: 'sensor',
      raw_query: 'PAW3950',
      matched_component: 'PAW3950',
      match_type: 'fuzzy_flagged',
      status: 'pending_ai',
      product_id: 'mouse-test-paw3950',
      created_at: '2026-02-18T00:00:00.000Z',
      product_attributes: {
        dpi_max: '26000, 30000',
      },
    },
  ]);

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
  const values = (row?.properties?.dpi_max?.candidates || []).map((candidate) => String(candidate.value));

  assert.ok(row, 'expected PAW3950/PixArt row');
  assert.equal(values.includes('26000'), false);
  assert.equal(values.includes('30000'), false);
});
