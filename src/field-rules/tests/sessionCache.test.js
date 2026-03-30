import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const COMPILED_FIELDS = {
  dpi_max: { type: 'number', label: 'DPI Max', ui: { label: 'Max DPI', group: 'sensor' } },
  weight: { type: 'number', label: 'Weight', ui: { label: 'Weight (g)', group: 'physical' } },
};
const COMPILED_ORDER = ['dpi_max', 'weight'];

const MAP_DOC = {
  selected_keys: ['dpi_max', 'polling_rate', 'weight'],
  field_overrides: {
    dpi_max: { ui: { label: 'Maximum DPI' } },
    polling_rate: { type: 'number', label: 'Polling Rate', ui: { label: 'Polling Rate (Hz)', group: 'sensor' } },
  },
};

function makeDeps({
  mapDoc = MAP_DOC,
  compiledFields = COMPILED_FIELDS,
  compiledOrder = COMPILED_ORDER,
  manifest = null,
  mapMtimeIso = '2026-02-20T12:00:00.000Z',
  keyMigrations = null,
  sqlRow = null,
} = {}) {
  let readCount = 0;

  const readJsonIfExists = async (filePath) => {
    readCount += 1;
    if (String(filePath).includes('manifest.json')) {
      return manifest ? JSON.parse(JSON.stringify(manifest)) : null;
    }
    if (String(filePath).includes('key_migrations.json')) {
      return keyMigrations ? JSON.parse(JSON.stringify(keyMigrations)) : null;
    }
    if (String(filePath).includes('field_studio_map.json')) {
      return mapDoc ? JSON.parse(JSON.stringify(mapDoc)) : null;
    }
    return null;
  };

  const loadCategoryConfig = async () => ({
    fieldRules: { fields: JSON.parse(JSON.stringify(compiledFields)) },
    fieldOrder: [...compiledOrder],
  });

  const statFile = async () => ({
    mtime: new Date(mapMtimeIso),
  });

  // WHY: getSpecDb stub returns a minimal specDb mock with field studio map methods.
  const getSpecDb = () => {
    if (sqlRow === null) return null;
    return {
      getFieldStudioMap: () => sqlRow,
      upsertFieldStudioMap: () => {},
    };
  };

  return {
    readJsonIfExists,
    statFile,
    loadCategoryConfig,
    getSpecDb,
    getReadCount: () => readCount,
  };
}

async function createCache(deps) {
  const { createSessionCache } = await import('../sessionCache.js');
  return createSessionCache({
    loadCategoryConfig: deps.loadCategoryConfig,
    getSpecDb: deps.getSpecDb,
    readJsonIfExists: deps.readJsonIfExists,
    statFile: deps.statFile,
    helperRoot: 'category_authority',
  });
}

describe('sessionCache', () => {
  it('returns merged compiled + saved map field overrides', async () => {
    const deps = makeDeps();
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.ok(result.mergedFields.dpi_max, 'dpi_max should exist');
    assert.ok(result.mergedFields.polling_rate, 'polling_rate should exist from saved docs');
    assert.ok(result.mergedFields.weight, 'weight should exist from compiled rules');
    assert.equal(result.mergedFields.dpi_max.ui.label, 'Maximum DPI', 'saved docs override label');
    assert.equal(result.mergedFields.dpi_max.type, 'number', 'compiled type should be preserved');
  });

  it('builds grouped field order from selected_keys + ui.group', async () => {
    const deps = makeDeps();
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(
      result.mergedFieldOrder,
      ['__grp::sensor', 'dpi_max', 'polling_rate', '__grp::physical', 'weight']
    );
    assert.deepEqual(result.cleanFieldOrder, ['dpi_max', 'polling_rate', 'weight']);
  });

  it('collapses repeated group transitions when selected_keys are interleaved', async () => {
    const deps = makeDeps({
      mapDoc: {
        selected_keys: ['dpi_max', 'weight', 'polling_rate'],
        field_overrides: {
          polling_rate: { type: 'number', label: 'Polling Rate', ui: { label: 'Polling Rate (Hz)', group: 'sensor' } },
        },
      },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(
      result.mergedFieldOrder,
      ['__grp::sensor', 'dpi_max', 'polling_rate', '__grp::physical', 'weight']
    );
    assert.deepEqual(result.cleanFieldOrder, ['dpi_max', 'polling_rate', 'weight']);
  });

  it('remaps stale selected_keys using generated key migrations', async () => {
    const deps = makeDeps({
      mapDoc: {
        selected_keys: ['dpi_max', 'switch_link'],
        field_overrides: {},
      },
      compiledFields: {
        dpi_max: { type: 'number', label: 'DPI Max', ui: { label: 'Max DPI', group: 'sensor' } },
        switches_link: { type: 'string', label: 'Switches Link', ui: { label: 'Switches Link', group: 'switches' } },
      },
      compiledOrder: ['dpi_max', 'switches_link'],
      keyMigrations: {
        key_map: {
          switch_link: 'switches_link',
        },
      },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');
    assert.deepEqual(result.cleanFieldOrder, ['dpi_max', 'switches_link']);
  });

  it('labels are derived from merged fields', async () => {
    const deps = makeDeps();
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.equal(result.labels.dpi_max, 'Maximum DPI');
    assert.equal(result.labels.polling_rate, 'Polling Rate (Hz)');
    assert.equal(result.labels.weight, 'Weight (g)');
  });

  it('second call returns cache hit until invalidated', async () => {
    const deps = makeDeps();
    const cache = await createCache(deps);

    await cache.getSessionRules('mouse');
    const readsBefore = deps.getReadCount();
    await cache.getSessionRules('mouse');
    assert.equal(deps.getReadCount(), readsBefore);

    cache.invalidateSessionCache('mouse');
    await cache.getSessionRules('mouse');
    assert.ok(deps.getReadCount() > readsBefore);
  });

  it('reads from SQL when specDb has data', async () => {
    const deps = makeDeps({
      mapDoc: null,
      sqlRow: {
        map_json: JSON.stringify(MAP_DOC),
        map_hash: 'sqlhash',
        updated_at: '2026-02-20T12:00:00',
      },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.equal(result.mergedFields.dpi_max.ui.label, 'Maximum DPI');
    assert.deepEqual(result.cleanFieldOrder, ['dpi_max', 'polling_rate', 'weight']);
  });

  it('falls back to JSON file when SQL is empty (seed migration)', async () => {
    const deps = makeDeps({
      sqlRow: null,
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.equal(result.mergedFields.dpi_max.ui.label, 'Maximum DPI');
    assert.deepEqual(result.cleanFieldOrder, ['dpi_max', 'polling_rate', 'weight']);
  });

  it('compileStale is true when map docs are newer than compiled manifest', async () => {
    const deps = makeDeps({
      manifest: { generated_at: '2026-02-19T12:00:00.000Z' },
      mapMtimeIso: '2026-02-20T12:00:00.000Z',
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.equal(result.compileStale, true);
    assert.equal(result.compiledAt, '2026-02-19T12:00:00.000Z');
    assert.equal(result.mapSavedAt, '2026-02-20T12:00:00.000Z');
  });

  it('compileStale is false when compiled manifest is newer than map docs', async () => {
    const deps = makeDeps({
      manifest: { generated_at: '2026-02-21T12:00:00.000Z' },
      mapMtimeIso: '2026-02-20T12:00:00.000Z',
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');
    assert.equal(result.compileStale, false);
  });

  it('compileStale is false when no map docs exist', async () => {
    const deps = makeDeps({
      mapDoc: null,
      manifest: { generated_at: '2026-02-21T12:00:00.000Z' },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.equal(result.compileStale, false);
    assert.equal(result.mapSavedAt, null);
    assert.deepEqual(result.cleanFieldOrder, COMPILED_ORDER);
  });
});
