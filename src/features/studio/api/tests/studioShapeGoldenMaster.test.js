import test from 'node:test';
import assert from 'node:assert/strict';

import { invokeStudioRoute } from './helpers/studioRoutesHarness.js';
import {
  StudioPayloadSchema,
  StudioConfigSchema,
  FieldStudioMapResponseSchema,
  TooltipBankResponseSchema,
  ArtifactEntrySchema,
  KnownValuesResponseSchema,
  ComponentDbResponseSchema,
  STUDIO_PAYLOAD_KEYS,
  FIELD_STUDIO_MAP_RESPONSE_KEYS,
  TOOLTIP_BANK_RESPONSE_KEYS,
  ARTIFACT_ENTRY_KEYS,
  KNOWN_VALUES_RESPONSE_KEYS,
  COMPONENT_DB_ITEM_KEYS,
} from '../../contracts/studioSchemas.js';

// Shape 1: StudioPayload (GET /studio/:category/payload)
test('studio payload response has exact StudioPayload shape', async () => {
  const result = await invokeStudioRoute({
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: { dpi: { label: 'DPI' } },
        mergedFieldOrder: ['dpi'],
        labels: { dpi: 'DPI' },
        compiledAt: '2026-03-29T00:00:00Z',
        mapSavedAt: '2026-03-28T00:00:00Z',
        compileStale: false,
      }),
      invalidateSessionCache: () => {},
    },
    loadCategoryConfig: async () => ({
      uiFieldCatalog: { dpi: { group: 'performance' } },
      guardrails: { maxFields: 50 },
    }),
  }, ['studio', 'mouse', 'payload'], 'GET');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    category: 'mouse',
    fieldRules: { dpi: { label: 'DPI' } },
    fieldOrder: ['dpi'],
    uiFieldCatalog: { dpi: { group: 'performance' } },
    guardrails: { maxFields: 50 },
    compiledAt: '2026-03-29T00:00:00Z',
    mapSavedAt: '2026-03-28T00:00:00Z',
    compileStale: false,
  });
  StudioPayloadSchema.parse(result.body);
});

// Shape 2: FieldStudioMapResponse (GET /studio/:category/field-studio-map)
test('studio field-studio-map GET response has file_path and map', async () => {
  const result = await invokeStudioRoute({
    loadFieldStudioMap: async () => ({
      file_path: 'category_authority/mouse/_control_plane/field_studio_map.json',
      map: { version: 2, component_sources: [{ component_type: 'sensor' }] },
    }),
    validateFieldStudioMap: (map) => ({ valid: true, errors: [], warnings: [], normalized: map }),
  }, ['studio', 'mouse', 'field-studio-map'], 'GET');

  assert.equal(result.status, 200);
  assert.equal(typeof result.body.file_path, 'string');
  assert.equal(typeof result.body.map, 'object');
  assert.ok(result.body.map !== null);
  assert.equal(result.body.map.version, 2);
  assert.ok(Array.isArray(result.body.map.component_sources));
  FieldStudioMapResponseSchema.parse(result.body);
});

// Shape 3: TooltipBankResponse (GET /studio/:category/tooltip-bank)
test('studio tooltip-bank response has exact TooltipBankResponse shape', async () => {
  const result = await invokeStudioRoute({
    safeReadJson: async (p) => {
      if (String(p).includes('field_studio_map.json')) {
        return { tooltip_source: { path: '/tooltips' } };
      }
      return null;
    },
    fs: {
      mkdir: async () => {},
      writeFile: async () => {},
      readdir: async () => [
        { name: 'hbs_tooltips_main.json', isFile: () => true },
        { name: 'readme.txt', isFile: () => true },
      ],
      readFile: async () => JSON.stringify({ dpi: 'Dots per inch' }),
    },
  }, ['studio', 'mouse', 'tooltip-bank'], 'GET');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    entries: { dpi: 'Dots per inch' },
    files: ['hbs_tooltips_main.json'],
    configuredPath: '/tooltips',
  });
  TooltipBankResponseSchema.parse(result.body);
});

// Shape 4: ArtifactEntry[] (GET /studio/:category/artifacts)
test('studio artifacts response has exact ArtifactEntry[] shape', async () => {
  const result = await invokeStudioRoute({
    listFiles: async () => ['field_rules.json'],
    safeStat: async () => ({ size: 2048, mtime: new Date('2026-03-15T12:00:00.000Z') }),
  }, ['studio', 'mouse', 'artifacts'], 'GET');

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, [
    { name: 'field_rules.json', size: 2048, updated: '2026-03-15T12:00:00.000Z' },
  ]);
  result.body.forEach(e => ArtifactEntrySchema.parse(e));
});

// Shape 5: KnownValuesResponse (GET /studio/:category/known-values)
// WHY: thin shape-lock only — full deepEqual coverage in studioKnownValuesAuthorityContracts.test.js
test('studio known-values response has KnownValuesResponse keys', async () => {
  const result = await invokeStudioRoute({
    getSpecDbReady: async () => ({
      isSeeded: () => true,
      getAllEnumFields: () => ['connection'],
      getListValues: () => [{ value: 'USB' }, { value: 'Wireless' }],
    }),
  }, ['studio', 'mouse', 'known-values'], 'GET');

  assert.equal(result.status, 200);
  assert.equal(typeof result.body.category, 'string');
  assert.equal(typeof result.body.source, 'string');
  assert.equal(typeof result.body.fields, 'object');
  assert.ok(result.body.fields !== null);
  assert.ok(Array.isArray(result.body.enum_lists));
  assert.ok(result.body.enum_lists.length >= 1);
  const entry = result.body.enum_lists[0];
  assert.equal(typeof entry.field, 'string');
  assert.equal(typeof entry.normalize, 'string');
  assert.ok(Array.isArray(entry.values));
  KnownValuesResponseSchema.parse(result.body);
});

// Shape 6: ComponentDbResponse (GET /studio/:category/component-db)
// WHY: thin shape-lock only — full deepEqual coverage in studioComponentDbAuthorityContracts.test.js
test('studio component-db response has ComponentDbResponse shape', async () => {
  const result = await invokeStudioRoute({
    getSpecDbReady: async () => ({
      getComponentTypeList: () => [{ component_type: 'sensor', item_count: 1 }],
      getAllComponentsForType: () => [{
        identity: { canonical_name: 'PAW3395', maker: 'PixArt' },
        aliases: [{ alias: '3395' }],
      }],
    }),
  }, ['studio', 'mouse', 'component-db'], 'GET');

  assert.equal(result.status, 200);
  assert.equal(typeof result.body, 'object');
  assert.ok(!Array.isArray(result.body));
  assert.ok(Array.isArray(result.body.sensor));
  assert.ok(result.body.sensor.length >= 1);
  const entry = result.body.sensor[0];
  assert.ok('name' in entry);
  assert.ok('maker' in entry);
  assert.ok('aliases' in entry);
  assert.equal(typeof entry.name, 'string');
  assert.equal(typeof entry.maker, 'string');
  assert.ok(Array.isArray(entry.aliases));
  ComponentDbResponseSchema.parse(result.body);
});

// Shape 7: StudioConfigSchema explicitly declares data_lists as a schema key
test('StudioConfigSchema declares data_lists as an explicit schema field', () => {
  const shapeKeys = Object.keys(StudioConfigSchema.shape);
  assert.ok(shapeKeys.includes('data_lists'), 'data_lists must be an explicit key in StudioConfigSchema.shape, not just passthrough');
});

test('derived key arrays match expected shape keys', () => {
  assert.deepEqual([...STUDIO_PAYLOAD_KEYS].sort(), [
    'category', 'compileStale', 'compiledAt', 'fieldOrder',
    'fieldRules', 'guardrails', 'mapSavedAt', 'uiFieldCatalog',
  ]);
  assert.deepEqual([...FIELD_STUDIO_MAP_RESPONSE_KEYS].sort(), ['error', 'file_path', 'map']);
  assert.deepEqual([...TOOLTIP_BANK_RESPONSE_KEYS].sort(), ['configuredPath', 'entries', 'files']);
  assert.deepEqual([...ARTIFACT_ENTRY_KEYS].sort(), ['name', 'size', 'updated']);
  assert.deepEqual([...KNOWN_VALUES_RESPONSE_KEYS].sort(), ['category', 'enum_lists', 'fields', 'source']);
  assert.deepEqual([...COMPONENT_DB_ITEM_KEYS].sort(), ['aliases', 'maker', 'name']);
});
