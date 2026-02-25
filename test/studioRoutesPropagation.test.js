import test from 'node:test';
import assert from 'node:assert/strict';
import { registerStudioRoutes } from '../src/api/routes/studioRoutes.js';

function makeCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    config: {},
    HELPER_ROOT: 'helper_files',
    safeReadJson: async () => null,
    safeStat: async () => null,
    listFiles: async () => [],
    fs: {
      mkdir: async () => {},
      writeFile: async () => {},
      readdir: async () => [],
    },
    path: {
      join: (...parts) => parts.join('/'),
    },
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {},
        mergedFieldOrder: [],
        labels: {},
        compiledAt: null,
        mapSavedAt: null,
        compileStale: false,
      }),
      invalidateSessionCache: () => {},
    },
    loadFieldStudioMap: async () => ({ file_path: '', map: {} }),
    saveFieldStudioMap: async () => ({ ok: true }),
    validateFieldStudioMap: (map) => ({ valid: true, errors: [], warnings: [], normalized: map }),
    invalidateFieldRulesCache: () => {},
    buildFieldLabelsMap: () => ({}),
    storage: {},
    loadCategoryConfig: async () => ({}),
    startProcess: () => ({ running: true }),
    getSpecDbReady: async () => null,
    broadcastWs: () => {},
    reviewLayoutByCategory: new Map(),
    loadProductCatalog: async () => ({ products: {} }),
    cleanVariant: (value) => String(value || '').trim(),
  };
  return { ...ctx, ...overrides };
}

test('studio component-db reads authoritative identities from SpecDb when available', async () => {
  const handler = registerStudioRoutes(makeCtx({
    getSpecDbReady: async () => ({
      getComponentTypeList: () => [
        { component_type: 'sensor', item_count: 2 },
        { component_type: 'switch', item_count: 1 },
      ],
      getAllComponentsForType: (componentType) => {
        if (componentType === 'sensor') {
          return [
            {
              identity: { canonical_name: 'PAW3395', maker: 'PixArt' },
              aliases: [{ alias: '3395' }, { alias: 'PAW-3395' }],
            },
            {
              identity: { canonical_name: 'HERO 25K', maker: 'Logitech' },
              aliases: [{ alias: 'hero' }],
            },
          ];
        }
        if (componentType === 'switch') {
          return [
            {
              identity: { canonical_name: 'Optical', maker: '' },
              aliases: [],
            },
          ];
        }
        return [];
      },
    }),
    listFiles: async () => {
      throw new Error('generated component_db should not be read when SpecDb is ready');
    },
  }));

  const result = await handler(
    ['studio', 'mouse', 'component-db'],
    new URLSearchParams(),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    sensor: [
      { name: 'PAW3395', maker: 'PixArt', aliases: ['3395', 'PAW-3395'] },
      { name: 'HERO 25K', maker: 'Logitech', aliases: ['hero'] },
    ],
    switch: [
      { name: 'Optical', maker: '', aliases: [] },
    ],
  });
});

test('studio component-db returns specdb_not_ready when authoritative SpecDb is unavailable', async () => {
  const handler = registerStudioRoutes(makeCtx({
    getSpecDbReady: async () => null,
    listFiles: async () => {
      throw new Error('generated component_db fallback should be disabled in strict authority mode');
    },
  }));

  const result = await handler(
    ['studio', 'mouse', 'component-db'],
    new URLSearchParams(),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: 'specdb_not_ready',
    message: 'SpecDb not ready for mouse',
  });
});

test('studio field-studio-map PUT emits data-change event for live propagation', async () => {
  const emitted = [];
  const handler = registerStudioRoutes(makeCtx({
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
  }));

  const result = await handler(
    ['studio', 'mouse', 'field-studio-map'],
    new URLSearchParams(),
    'PUT',
    {},
    {},
  );

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
  const handler = registerStudioRoutes(makeCtx({
    readJsonBody: async () => ({
      version: 1,
      component_sources: [],
      data_lists: [],
      enum_lists: [],
    }),
    loadFieldStudioMap: async () => ({
      file_path: 'helper_files/mouse/_control_plane/field_studio_map.json',
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
  }));

  const result = await handler(
    ['studio', 'mouse', 'field-studio-map'],
    new URLSearchParams(),
    'PUT',
    {},
    {},
  );

  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'empty_map_overwrite_rejected');
  assert.equal(saveCalled, false);
});

test('studio field-studio-map GET prefers control-plane payload over legacy partial user-settings map', async () => {
  const handler = registerStudioRoutes(makeCtx({
    loadStudioMapFromUserSettings: async () => ({
      file_path: '',
      map: {
        key_list: {
          sheet: 'Sheet1',
          source: 'column_range',
          column: 'A',
          row_start: 2,
          row_end: 2,
        },
        field_mapping: [{ key: 'dpi' }],
      },
    }),
    loadFieldStudioMap: async () => ({
      file_path: 'helper_files/mouse/_control_plane/field_studio_map.json',
      map: {
        version: 2,
        component_sources: [{ component_type: 'sensor' }],
        data_lists: [{ field: 'dpi', values: ['3200'] }],
        enum_lists: [],
      },
    }),
  }));

  const result = await handler(
    ['studio', 'mouse', 'field-studio-map'],
    new URLSearchParams(),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.file_path, 'helper_files/mouse/_control_plane/field_studio_map.json');
  assert.equal(Array.isArray(result.body.map.component_sources), true);
  assert.equal(result.body.map.component_sources.length, 1);
  assert.equal(Array.isArray(result.body.map.data_lists), true);
  assert.equal(result.body.map.data_lists.length, 1);
});

test('studio field-studio-map GET prefers valid control-plane map over richer invalid user-settings map', async () => {
  const handler = registerStudioRoutes(makeCtx({
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
      map: {
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
    }),
    loadFieldStudioMap: async () => ({
      file_path: 'helper_files/mouse/_control_plane/field_studio_map.json',
      map: {
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
    }),
  }));

  const result = await handler(
    ['studio', 'mouse', 'field-studio-map'],
    new URLSearchParams(),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.file_path, 'helper_files/mouse/_control_plane/field_studio_map.json');
  assert.equal(Array.isArray(result.body.map.component_sources), true);
  assert.equal(result.body.map.component_sources.length, 1);
  assert.equal(result.body.map.component_sources[0].component_type, 'sensor');
});

test('studio enum consistency skips when review consumer is disabled', async () => {
  const emitted = [];
  const handler = registerStudioRoutes(makeCtx({
    readJsonBody: async () => ({
      field: 'lighting',
      apply: true,
    }),
    safeReadJson: async (targetPath) => {
      const p = String(targetPath || '');
      if (p.includes('_generated/known_values.json')) {
        return { fields: { lighting: ['1 zone (rgb)', '7 zone (led)'] } };
      }
      if (p.includes('_suggestions/enums.json')) {
        return { fields: { lighting: ['1 zone rgb'] } };
      }
      return null;
    },
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {
          lighting: {
            enum: { policy: 'open_prefer_known' },
            consumers: {
              'enum.match.strategy': { review: false },
            },
          },
        },
      }),
      invalidateSessionCache: () => {},
    },
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(
    ['studio', 'mouse', 'enum-consistency'],
    new URLSearchParams(),
    'POST',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.skipped_reason, 'review_consumer_disabled');
  assert.equal(result.body.llm_enabled, false);
  assert.equal(Array.isArray(result.body.decisions), true);
  assert.equal(result.body.decisions.length, 0);
  assert.equal(emitted.length, 0);
});

test('studio enum consistency uses field format hint when request guidance is omitted', async () => {
  const calls = [];
  const handler = registerStudioRoutes(makeCtx({
    readJsonBody: async () => ({
      field: 'lighting',
      apply: false,
    }),
    safeReadJson: async (targetPath) => {
      const p = String(targetPath || '');
      if (p.includes('_generated/known_values.json')) {
        return { fields: { lighting: ['1 zone (rgb)', '7 zone (led)'] } };
      }
      if (p.includes('_suggestions/enums.json')) {
        return { fields: { lighting: ['1 zone rgb'] } };
      }
      return null;
    },
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {
          lighting: {
            enum: {
              policy: 'open_prefer_known',
              match: { format_hint: 'XXXX zone (YYYY)' },
            },
          },
        },
      }),
      invalidateSessionCache: () => {},
    },
    runEnumConsistencyReview: async (payload) => {
      calls.push(payload);
      return {
        enabled: false,
        skipped_reason: 'llm_disabled_or_missing_key',
        decisions: [],
      };
    },
  }));

  const result = await handler(
    ['studio', 'mouse', 'enum-consistency'],
    new URLSearchParams(),
    'POST',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].formatGuidance, 'XXXX zone (YYYY)');
  assert.equal(result.body.format_guidance, 'XXXX zone (YYYY)');
});

test('studio known-values reads authoritative enum values from SpecDb when available', async () => {
  const handler = registerStudioRoutes(makeCtx({
    getSpecDbReady: async () => ({
      isSeeded: () => true,
      getAllEnumFields: () => ['connection', 'lighting'],
      getListValues: (fieldKey) => {
        if (fieldKey === 'connection') {
          return [
            { value: '2.4GHz', needs_review: 0 },
            { value: 'Wireless', needs_review: 1 },
            { value: '2.4GHz', needs_review: 0 },
            { value: 'unk', needs_review: 1 },
          ];
        }
        if (fieldKey === 'lighting') {
          return [
            { value: '1 zone (RGB)', needs_review: 0 },
            { value: '7 zone (LED)', needs_review: 0 },
          ];
        }
        return [];
      },
    }),
    safeReadJson: async () => {
      throw new Error('known_values.json fallback should not be used when SpecDb authority is available');
    },
  }));

  const result = await handler(
    ['studio', 'mouse', 'known-values'],
    new URLSearchParams(),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.category, 'mouse');
  assert.equal(result.body.source, 'specdb');
  assert.deepEqual(result.body.fields, {
    connection: ['2.4GHz', 'Wireless'],
    lighting: ['1 zone (RGB)', '7 zone (LED)'],
  });
  assert.deepEqual(result.body.enum_lists, [
    { field: 'connection', normalize: 'lower_trim', values: ['2.4GHz', 'Wireless'] },
    { field: 'lighting', normalize: 'lower_trim', values: ['1 zone (RGB)', '7 zone (LED)'] },
  ]);
});

test('studio known-values returns specdb_not_ready when authoritative SpecDb is unavailable', async () => {
  const handler = registerStudioRoutes(makeCtx({
    getSpecDbReady: async () => null,
    safeReadJson: async () => {
      throw new Error('known_values.json fallback should be disabled in strict authority mode');
    },
  }));

  const result = await handler(
    ['studio', 'mouse', 'known-values'],
    new URLSearchParams(),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 503);
  assert.deepEqual(result.body, {
    error: 'specdb_not_ready',
    message: 'SpecDb not ready for mouse',
  });
});
