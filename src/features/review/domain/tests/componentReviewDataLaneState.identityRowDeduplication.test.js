import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

test('component payload keeps a single row per exact component name+maker identity', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  const componentType = 'switch';
  const componentName = 'Omron D2FC-F-7N';
  const componentMaker = 'Omron';

  upsertComponentLane(specDb, {
    componentType,
    componentName,
    componentMaker,
    propertyKey: 'actuation_force',
    value: '55',
  });
  specDb.upsertComponentIdentity({
    componentType,
    canonicalName: componentName,
    maker: componentMaker,
    links: [],
    source: 'pipeline',
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-dup-row-a',
    fieldKey: 'switch',
    componentType,
    componentName,
    componentMaker,
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-dup-row-b',
    fieldKey: 'switch',
    componentType,
    componentName,
    componentMaker,
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType,
    specDb,
  });
  const rows = (payload.items || []).filter(
    (item) => item.name === componentName && item.maker === componentMaker,
  );

  assert.equal(rows.length, 1);
  assert.equal((rows[0]?.linked_products || []).length, 2);
});
