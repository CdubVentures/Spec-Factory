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

function buildSensorFieldRules() {
  return {
    rules: {
      fields: {
        sensor: {
          component: {
            type: 'sensor',
            source: 'component_db.sensor',
            match: {
              property_keys: ['dpi_max', 'ips'],
            },
          },
        },
        dpi_max: {
          variance_policy: 'upper_bound',
          constraints: [],
        },
        ips: {
          variance_policy: 'upper_bound',
          constraints: ['ips <= dpi_max'],
        },
      },
    },
    component_db_sources: {
      sensor: {
        roles: {
          properties: [
            { field_key: 'dpi_max' },
            { field_key: 'ips' },
          ],
        },
      },
    },
  };
}

async function seedBlankPropertyLane(specDb) {
  upsertComponentLane(specDb, {
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
    variancePolicy: 'upper_bound',
  });
}

test('component payload keeps contract-declared property columns when component values are blank', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  await seedBlankPropertyLane(specDb);

  const payload = await buildComponentReviewPayloads({
    config,
    category: CATEGORY,
    componentType: 'sensor',
    specDb,
    fieldRules: buildSensorFieldRules(),
  });
  const row = payload.items.find((item) => item.name === 'PAW3950' && item.maker === 'PixArt');

  assert.ok(payload.property_columns.includes('dpi_max'));
  assert.ok(payload.property_columns.includes('ips'));
  assert.ok(row, 'expected PAW3950/PixArt row');
  assert.ok(Object.prototype.hasOwnProperty.call(row.properties || {}, 'ips'));
  assert.equal(row.properties.ips.selected.value, null);
  assert.deepEqual(row.properties.ips.constraints, ['ips <= dpi_max']);
});

test('component layout keeps contract-declared property columns when component values are blank', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  await seedBlankPropertyLane(specDb);

  const layout = await buildComponentReviewLayout({
    config,
    category: CATEGORY,
    specDb,
    fieldRules: buildSensorFieldRules(),
  });
  const sensorType = (layout.types || []).find((type) => type.type === 'sensor');

  assert.ok(sensorType, 'expected sensor component type in layout');
  assert.ok((sensorType.property_columns || []).includes('ips'));
});

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
