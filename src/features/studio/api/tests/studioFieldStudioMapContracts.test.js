import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { invokeStudioRoute } from './helpers/studioRoutesHarness.js';

function validPatch(overrides = {}) {
  return {
    schema_version: 'field-studio-patch.v1',
    category: 'mouse',
    field_key: 'lift',
    navigator_ordinal: 45,
    verdict: 'minor_revise',
    patch: {
      field_overrides: {
        lift: {
          field_key: 'lift',
          ai_assist: {
            reasoning_note: 'Use published lift-off distance only.',
          },
        },
      },
    },
    audit: {
      sources_checked: ['https://example.test/lift'],
      products_checked: ['Example Mouse'],
      conclusion: 'Lift-off distance needs tighter source handling.',
    },
    ...overrides,
  };
}

function baseMap() {
  return {
    version: 2,
    selected_keys: ['lift'],
    field_overrides: {
      lift: {
        field_key: 'lift',
        ai_assist: {
          reasoning_note: 'old note',
        },
      },
    },
  };
}

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

test('studio field-studio-map PUT returns the server-normalized map entity', async () => {
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      key_list: { sheet: 'Sheet1', source: 'column_range', column: 'A', row_start: 2, row_end: 2 },
      field_mapping: [{ key: 'dpi' }],
    }),
    getSpecDb: () => ({
      getFieldStudioMap: () => null,
      upsertFieldStudioMap: () => {},
    }),
    saveFieldStudioMap: async () => ({ ok: true }),
  }, ['studio', 'mouse', 'field-studio-map'], 'PUT');

  assert.equal(result.status, 200);
  assert.equal(result.body.file_path, 'specDb:mouse');
  assert.equal(typeof result.body.map_hash, 'string');
  assert.ok(result.body.map_hash.length > 0);
  assert.deepEqual(result.body.map.field_mapping, [{ key: 'dpi' }]);
});

test('studio field-studio-patches preview rejects files outside the current category', async () => {
  let writeCalled = false;
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      files: [
        {
          fileName: 'keyboard-45-lift.field-studio-patch.v1.json',
          content: JSON.stringify({
            ...validPatch(),
            category: 'keyboard',
          }),
        },
      ],
    }),
    fs: {
      mkdir: async () => { writeCalled = true; },
      writeFile: async () => { writeCalled = true; },
      readdir: async () => [],
    },
    getSpecDb: () => ({
      getFieldStudioMap: () => ({
        map_json: JSON.stringify(baseMap()),
        map_hash: 'hash',
        updated_at: '2026-04-27T00:00:00.000Z',
      }),
      upsertFieldStudioMap: () => {},
    }),
  }, ['studio', 'mouse', 'field-studio-patches', 'preview'], 'POST');

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'invalid_field_studio_patch_import');
  assert.match(result.body.message, /does not match requested category/i);
  assert.equal(writeCalled, false);
});

test('studio field-studio-patches preview returns the key/component change log without saving', async () => {
  let saveCalled = false;
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      files: [
        {
          fileName: 'mouse-45-lift.field-studio-patch.v1.json',
          content: JSON.stringify(validPatch()),
        },
      ],
    }),
    getSpecDb: () => ({
      getFieldStudioMap: () => ({
        map_json: JSON.stringify(baseMap()),
        map_hash: 'hash',
        updated_at: '2026-04-27T00:00:00.000Z',
      }),
      upsertFieldStudioMap: () => { saveCalled = true; },
    }),
    saveFieldStudioMap: async () => {
      saveCalled = true;
      return { ok: true };
    },
  }, ['studio', 'mouse', 'field-studio-patches', 'preview'], 'POST');

  assert.equal(result.status, 200);
  assert.equal(result.body.valid, true);
  assert.deepEqual(result.body.files.map((file) => file.fieldKey), ['lift']);
  assert.ok(
    result.body.changes.some((change) => (
      change.kind === 'field_override'
      && change.path === 'field_overrides.lift.ai_assist.reasoning_note'
      && change.before === 'old note'
      && change.after === 'Use published lift-off distance only.'
    )),
  );
  assert.equal(Object.hasOwn(result.body, 'fieldStudioMap'), false);
  assert.equal(Object.hasOwn(result.body, 'validation'), false);
  assert.equal(saveCalled, false);
});

test('studio field-studio-patches apply stores auditor responses, saves SQL map, and emits data-change', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-patch-import-'));
  const emitted = [];
  const sqlWrites = [];
  const mapWrites = [];

  try {
    const result = await invokeStudioRoute({
      config: { localInputRoot: tempRoot },
      fs,
      path,
      readJsonBody: async () => ({
        files: [
          {
            fileName: 'mouse-45-lift.field-studio-patch.v1.json',
            content: JSON.stringify(validPatch()),
          },
        ],
      }),
      getSpecDb: () => ({
        getFieldStudioMap: () => ({
          map_json: JSON.stringify(baseMap()),
          map_hash: 'hash',
          updated_at: '2026-04-27T00:00:00.000Z',
        }),
        upsertFieldStudioMap: (json, hash) => {
          sqlWrites.push({ json, hash });
        },
      }),
      saveFieldStudioMap: async () => ({ ok: true }),
      broadcastWs: (channel, payload) => {
        emitted.push({ channel, payload });
      },
    }, ['studio', 'mouse', 'field-studio-patches', 'apply'], 'POST');

    assert.equal(result.status, 200);
    assert.equal(result.body.applied.length, 1);
    assert.equal(result.body.storageDir, path.join(tempRoot, 'reports', 'mouse', 'auditors-responses'));
    assert.equal(sqlWrites.length, 1);
    assert.equal(JSON.parse(sqlWrites[0].json).field_overrides.lift.ai_assist.reasoning_note, 'Use published lift-off distance only.');
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].payload.event, 'field-studio-map-saved');

    const stored = await fs.readFile(
      path.join(tempRoot, 'reports', 'mouse', 'auditors-responses', 'mouse-45-lift.field-studio-patch.v1.json'),
      'utf8',
    );
    assert.equal(JSON.parse(stored).field_key, 'lift');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

function validKeyOrderPatch(overrides = {}) {
  return {
    schema_version: 'key-order-patch.v1',
    category: 'mouse',
    verdict: 'reorganize',
    groups: [
      {
        group_key: 'product_variants',
        display_name: 'Product & Variants',
        rationale: 'Identity keys first.',
        keys: ['sku'],
      },
      {
        group_key: 'sensor_performance',
        display_name: 'Sensor Performance',
        rationale: 'Sensor metrics together.',
        keys: ['dpi', 'ips', 'lod_sync'],
      },
    ],
    add_keys: [
      {
        field_key: 'lod_sync',
        display_name: 'LOD Sync',
        group_key: 'sensor_performance',
        rationale: 'Expose LOD sync when vendors publish it.',
      },
    ],
    audit: {
      categories_compared: ['mouse'],
      products_checked: ['Example Mouse'],
      sources_checked: ['https://example.test/specs'],
      missing_key_rationale: 'Mouse needs LOD sync depth.',
      organization_rationale: 'Keep sensor performance in one section.',
      open_questions: [],
    },
    ...overrides,
  };
}

test('studio key-order-patches preview rejects proposals that delete current keys', async () => {
  let saveCalled = false;
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      files: [
        {
          fileName: 'mouse-keys-order.key-order-patch.v1.json',
          content: JSON.stringify(validKeyOrderPatch({
            groups: [
              {
                group_key: 'sensor_performance',
                display_name: 'Sensor Performance',
                rationale: 'bad',
                keys: ['dpi'],
              },
            ],
            add_keys: [],
          })),
        },
      ],
    }),
    getSpecDb: () => ({
      getFieldKeyOrder: () => ({ order_json: JSON.stringify(['__grp::Product', 'sku', '__grp::Sensor', 'dpi', 'ips']) }),
      getCompiledRules: () => ({ fields: { sku: {}, dpi: {}, ips: {} } }),
      setFieldKeyOrder: () => { saveCalled = true; },
    }),
  }, ['studio', 'mouse', 'key-order-patches', 'preview'], 'POST');

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'invalid_key_order_patch_import');
  assert.match(result.body.message, /missing current key "sku"/i);
  assert.equal(saveCalled, false);
});

test('studio key-order-patches apply stores response and updates SQL and JSON order', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'key-order-patch-import-'));
  const emitted = [];
  const sqlWrites = [];
  const mapWrites = [];

  try {
    const result = await invokeStudioRoute({
      config: {
        localInputRoot: tempRoot,
        categoryAuthorityRoot: path.join(tempRoot, 'category_authority'),
      },
      HELPER_ROOT: path.join(tempRoot, 'category_authority'),
      fs,
      path,
      readJsonBody: async () => ({
        files: [
          {
            fileName: 'mouse-keys-order.key-order-patch.v1.json',
            content: JSON.stringify(validKeyOrderPatch()),
          },
        ],
      }),
      getSpecDb: () => ({
        getFieldKeyOrder: () => ({ order_json: JSON.stringify(['__grp::Product & Variants', 'sku', '__grp::Sensor Performance', 'dpi', 'ips']) }),
        getFieldStudioMap: () => ({ map_json: JSON.stringify({ selected_keys: ['sku', 'dpi', 'ips'], field_overrides: {} }) }),
        getCompiledRules: () => ({ fields: { sku: {}, dpi: {}, ips: {} } }),
        setFieldKeyOrder: (_category, orderJson) => { sqlWrites.push(JSON.parse(orderJson)); },
        upsertFieldStudioMap: (mapJson) => { mapWrites.push(JSON.parse(mapJson)); },
      }),
      broadcastWs: (channel, payload) => {
        emitted.push({ channel, payload });
      },
    }, ['studio', 'mouse', 'key-order-patches', 'apply'], 'POST');

    assert.equal(result.status, 200);
    assert.deepEqual(sqlWrites[0], [
      '__grp::Product & Variants',
      'sku',
      '__grp::Sensor Performance',
      'dpi',
      'ips',
      'lod_sync',
    ]);
    assert.ok(result.body.changes.some((change) => change.kind === 'key_added' && change.key === 'lod_sync'));
    assert.equal(mapWrites[0].field_overrides.lod_sync.ui.label, 'LOD Sync');
    assert.equal(mapWrites[0].field_overrides.lod_sync.ui.group, 'Sensor Performance');
    assert.ok(mapWrites[0].selected_keys.includes('lod_sync'));
    assert.equal(emitted[0].payload.event, 'field-key-order-saved');

    const storedPatch = JSON.parse(await fs.readFile(
      path.join(tempRoot, 'reports', 'mouse', 'auditors-responses', 'mouse-keys-order.key-order-patch.v1.json'),
      'utf8',
    ));
    assert.equal(storedPatch.schema_version, 'key-order-patch.v1');

    const storedOrder = JSON.parse(await fs.readFile(
      path.join(tempRoot, 'category_authority', 'mouse', '_control_plane', 'field_key_order.json'),
      'utf8',
    ));
    assert.deepEqual(storedOrder.order, sqlWrites[0]);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
