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
  assert.deepEqual(emitted[0].payload.domains, ['studio', 'mapping', 'review-layout']);
  assert.ok(typeof emitted[0].payload.ts === 'string' && emitted[0].payload.ts.length > 0);
});

test('studio field-studio-map PUT rejects destructive empty overwrite by default', async () => {
  let saveCalled = false;
  const result = await invokeStudioRoute({
    readJsonBody: async () => ({
      version: 1,
      component_sources: [],
      data_lists: [],
      enum_lists: [],
    }),
    loadFieldStudioMap: async () => ({
      file_path: 'category_authority/mouse/_control_plane/field_studio_map.json',
      map: {
        version: 2,
        component_sources: [{ component_type: 'sensor' }],
        data_lists: [{ field: 'dpi', values: ['3200'] }],
      },
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

test('studio field-studio-map GET prefers valid control-plane payload over user-settings fallbacks', async (t) => {
  const cases = [
    {
      name: 'control-plane payload wins over partial legacy user-settings map',
      userSettingsMap: {
        key_list: {
          sheet: 'Sheet1',
          source: 'column_range',
          column: 'A',
          row_start: 2,
          row_end: 2,
        },
        field_mapping: [{ key: 'dpi' }],
      },
      controlPlaneMap: {
        version: 2,
        component_sources: [{ component_type: 'sensor' }],
        data_lists: [{ field: 'dpi', values: ['3200'] }],
        enum_lists: [],
      },
      expectedComponentType: 'sensor',
    },
    {
      name: 'valid control-plane payload wins over richer invalid user-settings map',
      userSettingsMap: {
        version: 2,
        field_studio_source_path: 'C:/tmp/mouseData.xlsm',
        component_sources: [
          {
            component_type: 'sensor',
            sheet: 'sensors',
            header_row: 1,
            first_data_row: 2,
            roles: {
              primary_identifier: 'A',
              properties: [
                { field_key: 'dpi', column: '' },
                { field_key: 'ips', column: '' },
              ],
            },
          },
          {
            component_type: 'switch',
            sheet: 'switches',
            header_row: 1,
            first_data_row: 2,
            roles: {
              primary_identifier: 'A',
              properties: [{ field_key: 'switch_type', column: '' }],
            },
          },
        ],
      },
      controlPlaneMap: {
        version: 2,
        key_list: {
          sheet: 'dataEntry',
          source: 'column_range',
          column: 'B',
          row_start: 2,
          row_end: 20,
        },
        component_sources: [
          {
            component_type: 'sensor',
            sheet: 'sensors',
            header_row: 1,
            first_data_row: 2,
            roles: {
              primary_identifier: 'A',
              properties: [{ field_key: 'dpi', column: 'F', type: 'number' }],
            },
          },
        ],
      },
      expectedComponentType: 'sensor',
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const result = await invokeStudioRoute({
        validateFieldStudioMap: (map) => {
          const payload = map && typeof map === 'object' ? map : {};
          const errors = [];
          const workbookBacked = Boolean(payload.field_studio_source_path);
          const hasKeyList = Boolean(payload?.key_list?.sheet);
          if (workbookBacked && !hasKeyList) {
            errors.push('key_list: sheet is required');
          }
          const componentSources = Array.isArray(payload.component_sources) ? payload.component_sources : [];
          for (const source of componentSources) {
            const sheet = String(source?.sheet || '').trim();
            if (!sheet) continue;
            const properties = Array.isArray(source?.roles?.properties) ? source.roles.properties : [];
            for (const property of properties) {
              if (!String(property?.column || '').trim()) {
                errors.push(`component_sources: invalid property mapping column '' for sheet '${sheet}'`);
              }
            }
          }
          return {
            valid: errors.length === 0,
            errors,
            warnings: [],
            normalized: payload,
          };
        },
        loadStudioMapFromUserSettings: async () => ({
          file_path: '',
          map: scenario.userSettingsMap,
        }),
        loadFieldStudioMap: async () => ({
          file_path: 'category_authority/mouse/_control_plane/field_studio_map.json',
          map: scenario.controlPlaneMap,
        }),
      }, ['studio', 'mouse', 'field-studio-map'], 'GET');

      assert.equal(result.status, 200);
      assert.equal(result.body.file_path, 'category_authority/mouse/_control_plane/field_studio_map.json');
      assert.equal(Array.isArray(result.body.map.component_sources), true);
      assert.equal(result.body.map.component_sources.length, 1);
      assert.equal(result.body.map.component_sources[0].component_type, scenario.expectedComponentType);
    });
  }
});
