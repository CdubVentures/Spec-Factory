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
  fieldKeyOrderRow = null,
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
    if (sqlRow === null && fieldKeyOrderRow === null) return null;
    return {
      getFieldStudioMap: () => sqlRow,
      upsertFieldStudioMap: () => {},
      getFieldKeyOrder: () => fieldKeyOrderRow,
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

  it('uses field_groups for group order when present in saved map', async () => {
    const deps = makeDeps({
      mapDoc: {
        selected_keys: ['dpi_max', 'polling_rate', 'weight'],
        field_overrides: {
          polling_rate: { type: 'number', label: 'Polling Rate', ui: { label: 'Polling Rate (Hz)', group: 'sensor' } },
        },
        field_groups: ['physical', 'sensor'],
      },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(
      result.mergedFieldOrder,
      ['__grp::physical', 'weight', '__grp::sensor', 'dpi_max', 'polling_rate']
    );
  });

  it('preserves empty groups from field_groups', async () => {
    const deps = makeDeps({
      mapDoc: {
        selected_keys: ['dpi_max', 'weight'],
        field_overrides: {},
        field_groups: ['sensor', 'empty_group', 'physical'],
      },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(
      result.mergedFieldOrder,
      ['__grp::sensor', 'dpi_max', '__grp::empty_group', '__grp::physical', 'weight']
    );
    assert.deepEqual(result.cleanFieldOrder, ['dpi_max', 'weight']);
  });

  it('falls back to derive-from-fields when field_groups is empty', async () => {
    const deps = makeDeps({
      mapDoc: {
        selected_keys: ['dpi_max', 'polling_rate', 'weight'],
        field_overrides: {
          polling_rate: { type: 'number', label: 'Polling Rate', ui: { label: 'Polling Rate (Hz)', group: 'sensor' } },
        },
        field_groups: [],
      },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(
      result.mergedFieldOrder,
      ['__grp::sensor', 'dpi_max', 'polling_rate', '__grp::physical', 'weight']
    );
  });

  it('routes unmatched fields to the first group when using field_groups', async () => {
    const deps = makeDeps({
      mapDoc: {
        selected_keys: ['dpi_max', 'weight'],
        field_overrides: {},
        field_groups: ['sensor'],
      },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(
      result.mergedFieldOrder,
      ['__grp::sensor', 'dpi_max', 'weight']
    );
  });

  it('uses field_key_order table when populated (bypasses buildGroupedFieldOrder)', async () => {
    const storedOrder = ['__grp::Custom', 'weight', '__grp::Sensor', 'dpi_max', 'polling_rate'];
    const deps = makeDeps({
      sqlRow: { map_json: JSON.stringify(MAP_DOC), map_hash: 'h1', updated_at: '2026-01-01' },
      fieldKeyOrderRow: { order_json: JSON.stringify(storedOrder), updated_at: '2026-01-02' },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(result.mergedFieldOrder, storedOrder);
    assert.deepEqual(result.cleanFieldOrder, ['weight', 'dpi_max', 'polling_rate']);
  });

  it('falls back to buildGroupedFieldOrder when field_key_order is empty', async () => {
    const deps = makeDeps({
      sqlRow: { map_json: JSON.stringify(MAP_DOC), map_hash: 'h1', updated_at: '2026-01-01' },
      fieldKeyOrderRow: null,
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(
      result.mergedFieldOrder,
      ['__grp::sensor', 'dpi_max', 'polling_rate', '__grp::physical', 'weight']
    );
  });

  it('falls back to field_key_order.json when SQL is empty and JSON exists', async () => {
    const savedOrder = ['__grp::Custom', 'weight', '__grp::Sensor', 'dpi_max'];
    const baseDeps = makeDeps({
      sqlRow: { map_json: JSON.stringify(MAP_DOC), map_hash: 'h1', updated_at: '2026-01-01' },
      fieldKeyOrderRow: null,
    });
    // Override readJsonIfExists to serve the field_key_order.json fallback
    const readJsonIfExists = async (filePath) => {
      if (String(filePath).includes('field_key_order.json')) {
        return { order: savedOrder };
      }
      return baseDeps.readJsonIfExists(filePath);
    };
    const setFieldKeyOrderCalls = [];
    const getSpecDb = () => ({
      getFieldStudioMap: () => baseDeps.getSpecDb().getFieldStudioMap(),
      upsertFieldStudioMap: () => {},
      getFieldKeyOrder: () => null,
      setFieldKeyOrder: (cat, json) => setFieldKeyOrderCalls.push({ cat, json }),
    });
    const cache = await createCache({ ...baseDeps, readJsonIfExists, getSpecDb });
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(result.mergedFieldOrder, savedOrder);
    // WHY: sessionCache no longer auto-persists to SQL — the field_key_order reseed
    // surface in seedRegistry.js handles JSON→SQL migration. sessionCache is read-only.
    assert.equal(setFieldKeyOrderCalls.length, 0, 'sessionCache should not persist to SQL (reseed surface handles it)');
  });

  it('falls back to computed order when both SQL and JSON are empty', async () => {
    const baseDeps = makeDeps({
      sqlRow: { map_json: JSON.stringify(MAP_DOC), map_hash: 'h1', updated_at: '2026-01-01' },
      fieldKeyOrderRow: null,
    });
    // readJsonIfExists returns null for field_key_order.json (default mock behavior)
    const getSpecDb = () => ({
      getFieldStudioMap: () => baseDeps.getSpecDb().getFieldStudioMap(),
      upsertFieldStudioMap: () => {},
      getFieldKeyOrder: () => null,
    });
    const cache = await createCache({ ...baseDeps, getSpecDb });
    const result = await cache.getSessionRules('mouse');

    assert.deepEqual(
      result.mergedFieldOrder,
      ['__grp::sensor', 'dpi_max', 'polling_rate', '__grp::physical', 'weight']
    );
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

  it('compileStale is true when map was saved after compile', async () => {
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

  it('compileStale is false when compile is newer than map save', async () => {
    const deps = makeDeps({
      manifest: { generated_at: '2026-02-21T12:00:00.000Z' },
      mapMtimeIso: '2026-02-20T12:00:00.000Z',
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');
    assert.equal(result.compileStale, false);
  });

  it('compileStale is false when SQL updated_at is bare UTC before compiled ISO string', async () => {
    // WHY: SQLite datetime('now') returns UTC without Z suffix.
    // JavaScript new Date() parses bare datetimes as local time, shifting
    // by the host's UTC offset. On UTC-7 this made 18:22 look like 01:22
    // next day — always after the compile timestamp.
    const deps = makeDeps({
      manifest: { generated_at: '2026-03-31T18:31:23.683Z' },
      sqlRow: {
        map_json: JSON.stringify(MAP_DOC),
        map_hash: 'hash1',
        updated_at: '2026-03-31 18:22:56',
      },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');
    assert.equal(result.compileStale, false,
      'bare SQLite datetime must be treated as UTC, not local time');
  });

  it('compileStale is true when SQL updated_at is bare UTC after compiled ISO string', async () => {
    const deps = makeDeps({
      manifest: { generated_at: '2026-03-31T18:00:00.000Z' },
      sqlRow: {
        map_json: JSON.stringify(MAP_DOC),
        map_hash: 'hash1',
        updated_at: '2026-03-31 18:22:56',
      },
    });
    const cache = await createCache(deps);
    const result = await cache.getSessionRules('mouse');
    assert.equal(result.compileStale, true);
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
