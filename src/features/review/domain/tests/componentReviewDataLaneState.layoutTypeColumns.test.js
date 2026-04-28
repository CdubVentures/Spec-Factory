import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewLayout,
  createComponentRowHarness,
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
  specDb.upsertComponentIdentity({
    componentType: 'sensor',
    canonicalName: 'PAW3950',
    maker: 'PixArt',
    links: ['https://pixart.example/paw3950'],
    source: 'component_db',
  });
  specDb.upsertComponentValue({
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'dpi_max',
    value: '35000',
    variancePolicy: 'upper_bound',
  });
  specDb.upsertComponentValue({
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    propertyKey: 'legacy_observed_only',
    value: 'stale',
    variancePolicy: 'authoritative',
  });
}

test('component layout keeps contract-declared property columns when component values are blank', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  seedBlankPropertyLane(specDb);

  const layout = await buildComponentReviewLayout({
    config,
    category: CATEGORY,
    specDb,
    fieldRules: buildSensorFieldRules(),
  });
  const sensorType = (layout.types || []).find((type) => type.type === 'sensor');

  assert.ok(sensorType, 'expected sensor component type in layout');
  assert.deepEqual(sensorType.property_columns || [], ['dpi_max', 'ips']);
});
