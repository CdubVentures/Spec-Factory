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
        draftSavedAt: null,
        compileStale: false,
      }),
      invalidateSessionCache: () => {},
    },
    loadWorkbookMap: async () => ({ file_path: '', map: {} }),
    saveWorkbookMap: async () => ({ ok: true }),
    validateWorkbookMap: (map) => ({ valid: true, errors: [], warnings: [], normalized: map }),
    invalidateFieldRulesCache: () => {},
    buildFieldLabelsMap: () => ({}),
    storage: {},
    loadCategoryConfig: async () => ({}),
    startProcess: () => ({ running: true }),
    broadcastWs: () => {},
    reviewLayoutByCategory: new Map(),
    loadProductCatalog: async () => ({ products: {} }),
    cleanVariant: (value) => String(value || '').trim(),
  };
  return { ...ctx, ...overrides };
}

test('studio workbook-map PUT emits data-change event for live propagation', async () => {
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
    saveWorkbookMap: async ({ category, workbookMap }) => ({
      ok: true,
      category,
      workbookMap,
    }),
    broadcastWs: (channel, payload) => {
      emitted.push({ channel, payload });
    },
  }));

  const result = await handler(
    ['studio', 'mouse', 'workbook-map'],
    new URLSearchParams(),
    'PUT',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'workbook-map-saved');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.categories, ['mouse']);
  assert.deepEqual(emitted[0].payload.domains, ['studio', 'mapping', 'review-layout']);
  assert.ok(typeof emitted[0].payload.ts === 'string' && emitted[0].payload.ts.length > 0);
});
