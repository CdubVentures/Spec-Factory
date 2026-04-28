import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CATEGORY,
  buildComponentReviewPayloads,
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
  const identity = specDb.upsertComponentIdentity({
    componentType: 'sensor',
    canonicalName: 'PAW3950',
    maker: 'PixArt',
    links: ['https://pixart.example/paw3950'],
    source: 'component_db',
  });
  specDb.insertAlias(identity.id, 'PAW 3950', 'component_db');
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

  assert.deepEqual(payload.property_columns, ['dpi_max', 'ips']);
  assert.ok(row, 'expected PAW3950/PixArt row');
  assert.equal(row.maker, 'PixArt');
  assert.deepEqual(row.aliases, ['PAW 3950']);
  assert.deepEqual(row.links, ['https://pixart.example/paw3950']);
  assert.equal(row.maker_tracked.selected.value, 'PixArt');
  assert.equal(row.links_tracked[0].selected.value, 'https://pixart.example/paw3950');
  assert.ok(Object.prototype.hasOwnProperty.call(row.properties || {}, 'ips'));
  assert.equal(row.properties.ips.selected.value, null);
  assert.deepEqual(row.properties.ips.constraints, ['ips <= dpi_max']);
  assert.equal(
    Object.prototype.hasOwnProperty.call(row.properties || {}, 'legacy_observed_only'),
    false,
    'observed SQL component values that are not declared source attributes must stay out of the review grid',
  );
});
