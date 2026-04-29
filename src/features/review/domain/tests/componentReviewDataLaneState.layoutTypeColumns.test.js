import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

test('component layout keeps declared component tab after all component rows are deleted', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);

  const layout = await buildComponentReviewLayout({
    config,
    category: CATEGORY,
    specDb,
    fieldRules: buildSensorFieldRules(),
  });
  const sensorType = (layout.types || []).find((type) => type.type === 'sensor');

  assert.ok(sensorType, 'expected declared sensor component tab with zero rows');
  assert.deepEqual((layout.types || []).map((type) => type.type), ['sensor']);
  assert.equal(sensorType.item_count, 0);
  assert.deepEqual(sensorType.property_columns || [], ['dpi_max', 'ips']);
});

test('component layout reads declared component tabs from Mapping Studio file when SQL rows are empty', async (t) => {
  const { config, specDb } = await createComponentRowHarness(t);
  const mapPath = path.join(config.categoryAuthorityRoot, CATEGORY, '_control_plane', 'field_studio_map.json');
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(
    mapPath,
    JSON.stringify({
      component_sources: [
        {
          component_type: 'sensor',
          roles: {
            properties: [
              { field_key: 'dpi_max' },
              { field_key: 'ips' },
            ],
          },
        },
      ],
    }, null, 2),
  );

  const layout = await buildComponentReviewLayout({
    config,
    category: CATEGORY,
    specDb,
    fieldRules: {},
  });
  const sensorType = (layout.types || []).find((type) => type.type === 'sensor');

  assert.ok(sensorType, 'expected Mapping Studio-declared sensor component tab with zero rows');
  assert.equal(sensorType.item_count, 0);
  assert.deepEqual(sensorType.property_columns || [], []);
});
