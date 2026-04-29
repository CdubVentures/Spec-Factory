import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewLayout,
  buildComponentReviewPayloads,
  createComponentRowHarness,
  insertProductFieldCandidate,
  linkProductToComponent,
  upsertComponentLane,
} from './helpers/componentReviewRowHarness.js';

function buildComponentFieldRules() {
  return {
    component_db_sources: {
      encoder: { roles: { properties: [{ field_key: 'steps' }] } },
      sensor: {
        roles: {
          properties: [
            { field_key: 'ips' },
            { field_key: 'dpi_max' },
            { field_key: 'acceleration' },
          ],
        },
      },
      switch: { roles: { properties: [{ field_key: 'lifespan' }] } },
    },
  };
}

test('component layout follows Mapping Studio component source order', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  for (const componentType of ['sensor', 'switch', 'encoder']) {
    specDb.upsertComponentIdentity({
      componentType,
      canonicalName: `${componentType} row`,
      maker: 'Acme',
      links: [],
      source: 'component_db',
    });
  }
  specDb.upsertFieldStudioMap(JSON.stringify({
    component_sources: [
      { component_type: 'encoder', roles: { properties: [{ field_key: 'steps' }] } },
      { component_type: 'sensor', roles: { properties: [{ field_key: 'ips' }, { field_key: 'dpi_max' }] } },
      { component_type: 'switch', roles: { properties: [{ field_key: 'lifespan' }] } },
    ],
  }), 'component-order-test');

  const layout = await buildComponentReviewLayout({
    config,
    category: CATEGORY,
    specDb,
    fieldRules: buildComponentFieldRules(),
  });

  assert.deepEqual(layout.types.map((row) => row.type), ['encoder', 'sensor', 'switch']);
});

test('component property columns keep component source order', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
    fieldRules: buildComponentFieldRules(),
  });

  assert.deepEqual(payload.property_columns, ['ips', 'dpi_max', 'acceleration']);
});

test('component attribute drawer candidates come only from published linked product values', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
    confidence: 1,
  });
  for (const productId of ['mouse-published-a', 'mouse-published-b']) {
    linkProductToComponent(specDb, {
      productId,
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
    });
  }
  linkProductToComponent(specDb, {
    productId: 'mouse-other-maker',
    fieldKey: 'sensor',
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'Logitech',
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-published-a',
    fieldKey: 'dpi_max',
    value: '35000',
    status: 'resolved',
    confidence: 95,
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-published-a',
    fieldKey: 'dpi_max',
    value: '34000',
    status: 'candidate',
    confidence: 99,
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-published-b',
    fieldKey: 'dpi_max',
    value: '36000',
    status: 'resolved',
    confidence: 90,
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-other-maker',
    fieldKey: 'dpi_max',
    value: '99999',
    status: 'resolved',
    confidence: 99,
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
    fieldRules: buildComponentFieldRules(),
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
  const propertyState = row?.properties?.dpi_max;

  assert.ok(row, 'expected PixArt/Paw3950 component row');
  assert.ok(propertyState, 'expected dpi_max property state');
  assert.equal(propertyState.selected.value, null);
  assert.equal(propertyState.selected.confidence, 0);
  assert.deepEqual(
    propertyState.candidates.map((candidate) => String(candidate.value)),
    ['35000', '36000'],
  );
  assert.equal(propertyState.candidates.every((candidate) => candidate.status === 'resolved'), true);
  assert.equal(propertyState.candidate_count, 2);
  assert.equal(propertyState.candidates[0].evidence.url, 'https://example.test/mouse-published-a');
  assert.equal(propertyState.candidates[0].evidence.quote, 'dpi_max: 35000');
});

test('component link lane is blank and candidates come only from published linked product link values', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
    confidence: 1,
  });
  for (const productId of ['mouse-link-a', 'mouse-link-b']) {
    linkProductToComponent(specDb, {
      productId,
      fieldKey: 'sensor',
      componentType: 'sensor',
      componentName: 'PAW3950',
      componentMaker: 'PixArt',
    });
  }
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-link-a',
    fieldKey: 'sensor_link',
    value: 'https://pixart.example/paw3950',
    status: 'resolved',
    confidence: 95,
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-link-b',
    fieldKey: 'sensor_link',
    value: 'https://datasheet.example/paw3950.pdf',
    status: 'resolved',
    confidence: 90,
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-link-b',
    fieldKey: 'sensor_link',
    value: 'https://candidate.example/not-published',
    status: 'candidate',
    confidence: 99,
  });

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
    fieldRules: buildComponentFieldRules(),
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');

  assert.ok(row, 'expected PixArt/Paw3950 component row');
  assert.equal(row.links_state.selected.value, null);
  assert.equal(row.links_state.selected.confidence, 0);
  assert.deepEqual(
    row.links_state.candidates.map((candidate) => String(candidate.value)),
    ['https://pixart.example/paw3950', 'https://datasheet.example/paw3950.pdf'],
  );
  assert.equal(row.links_state.candidates.every((candidate) => candidate.status === 'resolved'), true);
  assert.equal(row.links_state.candidate_count, 2);
  assert.equal(row.links_state.candidates[0].evidence.url, 'https://example.test/mouse-link-a');
  assert.equal(row.links_state.candidates[0].evidence.quote, 'sensor_link: https://pixart.example/paw3950');
});

test('linked product rows expose published candidate evidence counts by field', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
    confidence: 1,
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-support-a',
    fieldKey: 'sensor',
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-support-a',
    fieldKey: 'sensor',
    value: 'PAW3950',
    status: 'resolved',
    confidence: 95,
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-support-a',
    fieldKey: 'sensor',
    value: 'PMW3395',
    status: 'candidate',
    confidence: 90,
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-support-a',
    fieldKey: 'sensor_brand',
    value: 'PixArt',
    status: 'resolved',
    confidence: 95,
  });

  const sensorResolved = specDb.getFieldCandidate('mouse-support-a', 'sensor', 'PAW3950');
  const sensorCandidate = specDb.getFieldCandidate('mouse-support-a', 'sensor', 'PMW3395');
  const brandResolved = specDb.getFieldCandidate('mouse-support-a', 'sensor_brand', 'PixArt');
  specDb.insertFieldCandidateEvidenceMany(sensorResolved.id, [
    { url: 'https://evidence.example/sensor-a', tier: 'tier1', confidence: 95 },
    { url: 'https://evidence.example/sensor-b', tier: 'tier1', confidence: 90 },
  ]);
  specDb.insertFieldCandidateEvidenceMany(sensorCandidate.id, [
    { url: 'https://evidence.example/sensor-candidate', tier: 'tier2', confidence: 80 },
  ]);
  specDb.insertFieldCandidateEvidenceMany(brandResolved.id, [
    { url: 'https://evidence.example/brand-a', tier: 'tier1', confidence: 95 },
  ]);

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
    fieldRules: buildComponentFieldRules(),
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
  const linkedProduct = row?.linked_products?.find((product) => product.product_id === 'mouse-support-a');

  assert.ok(row, 'expected PixArt/Paw3950 component row');
  assert.ok(linkedProduct, 'expected linked product row');
  assert.deepEqual(linkedProduct.field_counts.sensor, {
    published_count: 1,
    candidate_count: 1,
    evidence_count: 3,
  });
  assert.deepEqual(linkedProduct.field_counts.sensor_brand, {
    published_count: 1,
    candidate_count: 0,
    evidence_count: 1,
  });
});

test('component_only attributes stay as component review columns without published product candidates', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'sensor_family',
    value: null,
    confidence: 0,
  });
  linkProductToComponent(specDb, {
    productId: 'mouse-component-only',
    fieldKey: 'sensor',
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
  });
  insertProductFieldCandidate(specDb, {
    productId: 'mouse-component-only',
    fieldKey: 'sensor_family',
    value: 'PAW39xx',
    status: 'resolved',
    confidence: 95,
  });

  const fieldRules = {
    component_db_sources: {
      sensor: {
        roles: {
          properties: [
            { field_key: 'dpi_max' },
            { field_key: 'sensor_family', component_only: true },
          ],
        },
      },
    },
  };

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
    fieldRules,
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');
  const propertyState = row?.properties?.sensor_family;

  assert.deepEqual(payload.property_columns, ['dpi_max', 'sensor_family']);
  assert.ok(row, 'expected PixArt/Paw3950 component row');
  assert.ok(propertyState, 'expected component_only property state');
  assert.equal(propertyState.component_only, true);
  assert.equal(propertyState.selected.value, null);
  assert.equal(propertyState.selected.confidence, 0);
  assert.deepEqual(propertyState.candidates, []);
  assert.equal(propertyState.candidate_count, 0);
});
