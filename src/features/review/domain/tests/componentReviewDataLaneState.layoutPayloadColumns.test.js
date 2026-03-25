import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
  createComponentRowHarness,
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

function seedBlankPropertyLane(specDb) {
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
  seedBlankPropertyLane(specDb);

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
