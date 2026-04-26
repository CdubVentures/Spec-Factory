import test from 'node:test';
import assert from 'node:assert/strict';

import { invokeStudioRoute } from './helpers/studioRoutesHarness.js';

test('studio field-studio-map PUT emits data-change event for live propagation', async () => {
  const emitted = [];
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      key_list: {
        sheet: 'Sheet1',
        source: 'column_range',
        column: 'A',
        row_start: 2,
        row_end: 2,
      },
      field_mapping: [{ key: 'dpi' }],
    }),
    saveFieldStudioMap: async ({ category, fieldStudioMap }) => ({
      ok: true,
      category,
      fieldStudioMap,
    }),
    broadcastWs: (channel, payload) => {
      emitted.push({ channel, payload });
    },
  }, ['studio', 'mouse', 'field-studio-map'], 'PUT');

  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'field-studio-map-saved');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.categories, ['mouse']);
  assert.deepEqual(emitted[0].payload.domains, ['studio', 'mapping', 'review-layout', 'labels']);
  assert.ok(typeof emitted[0].payload.ts === 'string' && emitted[0].payload.ts.length > 0);
});

test('studio field-studio-map PUT rejects destructive empty overwrite by default', async () => {
  let saveCalled = false;
  const existingMap = {
    version: 2,
    component_sources: [{ component_type: 'sensor' }],
    data_lists: [{ field: 'dpi', values: ['3200'] }],
  };
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      version: 1,
      component_sources: [],
      data_lists: [],
      enum_lists: [],
    }),
    // WHY: overwrite guard reads existing map from SQL (SSOT).
    getSpecDb: () => ({
      getFieldStudioMap: () => ({
        map_json: JSON.stringify(existingMap),
        map_hash: 'test-hash',
        updated_at: '2026-03-29T00:00:00',
      }),
      upsertFieldStudioMap: () => {},
    }),
    saveFieldStudioMap: async () => {
      saveCalled = true;
      return { ok: true };
    },
  }, ['studio', 'mouse', 'field-studio-map'], 'PUT');

  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'empty_map_overwrite_rejected');
  assert.equal(saveCalled, false);
});

test('studio field-studio-map GET reads from SQL when specDb has data', async () => {
  const mapData = {
    version: 2,
    component_sources: [{ component_type: 'sensor' }],
    data_lists: [{ field: 'dpi', values: ['3200'] }],
  };
  const result = await invokeStudioRoute({
    getSpecDb: () => ({
      getFieldStudioMap: () => ({
        map_json: JSON.stringify(mapData),
        map_hash: 'test-hash',
        updated_at: '2026-03-29T00:00:00',
      }),
    }),
  }, ['studio', 'mouse', 'field-studio-map'], 'GET');

  assert.equal(result.status, 200);
  assert.equal(typeof result.body.file_path, 'string');
  assert.equal(result.body.map.version, 2);
  assert.ok(Array.isArray(result.body.map.component_sources));
  assert.equal(result.body.map.component_sources[0].component_type, 'sensor');
});

test('studio field-studio-map GET returns empty map when SQL has no data', async () => {
  const result = await invokeStudioRoute({
    getSpecDb: () => ({
      getFieldStudioMap: () => null,
    }),
  }, ['studio', 'mouse', 'field-studio-map'], 'GET');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body.map, {});
  assert.equal(result.body.file_path, '');
});

test('studio field-studio-map PUT writes to SQL when specDb is available', async () => {
  const sqlWrites = [];
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      key_list: { sheet: 'Sheet1', source: 'column_range', column: 'A', row_start: 2, row_end: 2 },
      field_mapping: [{ key: 'dpi' }],
    }),
    getSpecDb: () => ({
      getFieldStudioMap: () => null,
      upsertFieldStudioMap: (json, hash) => { sqlWrites.push({ json, hash }); },
    }),
    saveFieldStudioMap: async () => ({ file_path: '', map_hash: '', field_studio_map: {} }),
  }, ['studio', 'mouse', 'field-studio-map'], 'PUT');

  assert.equal(result.status, 200);
  assert.equal(sqlWrites.length, 1);
  const written = JSON.parse(sqlWrites[0].json);
  assert.ok(written.key_list);
  assert.equal(typeof sqlWrites[0].hash, 'string');
  assert.ok(sqlWrites[0].hash.length > 0);
});
