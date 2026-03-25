import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

test('component layout item_count matches visible payload rows', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  const componentType = 'sensor';

  upsertComponentLane(specDb, {
    componentType,
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-layout-visible',
    fieldKey: 'sensor',
    componentType,
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    matchType: 'exact',
  });

  upsertComponentLane(specDb, {
    componentType,
    componentName: 'PAW3950 Hidden',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: null,
    confidence: 0,
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType,
    specDb,
  });
  const layout = await buildComponentReviewLayout({
    config,
    category: CATEGORY,
    specDb,
  });
  const typeRow = (layout.types || []).find((row) => row.type === componentType);

  assert.ok(typeRow, 'expected sensor type in layout');
  assert.equal(Number(typeRow.item_count || 0), (payload.items || []).length);
});
