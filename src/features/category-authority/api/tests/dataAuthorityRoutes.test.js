import test from 'node:test';
import assert from 'node:assert/strict';
import { registerDataAuthorityRoutes } from '../dataAuthorityRoutes.js';
import { resetDataPropagationCounters } from '../../../../observability/dataPropagationCounters.js';
import { resetSettingsPersistenceCounters } from '../../../../observability/settingsPersistenceCounters.js';
import { emitDataChange } from '../../../../core/events/dataChangeContract.js';

function makeCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    config: {},
    sessionCache: {
      getSessionRules: async () => ({
        compiledAt: '2026-02-23T11:00:00.000Z',
        mapSavedAt: '2026-02-23T12:00:00.000Z',
        compileStale: false,
      }),
    },
    getSpecDb: () => ({
      getSpecDbSyncState: () => ({
        category: 'mouse',
        specdb_sync_version: 4,
        last_sync_status: 'ok',
        last_sync_at: '2026-02-23T12:05:00.000Z',
        last_sync_meta: {
          domains: ['identity', 'catalog'],
        },
      }),
    }),
  };
  return { ...ctx, ...overrides };
}

test('data authority snapshot returns canonical version payload and changed domains', async () => {
  resetDataPropagationCounters();
  resetSettingsPersistenceCounters();
  emitDataChange({
    broadcastWs: () => {},
    event: 'catalog-product-update',
    category: 'mouse',
  });
  const handler = registerDataAuthorityRoutes(makeCtx());

  const result = await handler(
    ['data-authority', 'mouse', 'snapshot'],
    new URLSearchParams(),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.category, 'mouse');
  assert.equal(result.body.version.specdb_sync_version, 4);
  assert.equal(result.body.version.updated_at, '2026-02-23T12:05:00.000Z');
  assert.equal(typeof result.body.authority_version, 'string');
  assert.ok(result.body.authority_version.length > 0);
  assert.deepEqual(
    result.body.changed_domains,
    ['catalog', 'component', 'enum', 'identity', 'labels', 'product', 'review', 'review-layout', 'studio'],
  );
  assert.equal(result.body.observability.data_change.total, 1);
  assert.equal(result.body.observability.data_change.category_count, 1);
  assert.ok(result.body.observability.queue_cleanup);
  assert.ok(result.body.observability.settings_persistence);
  assert.equal(typeof result.body.observability.settings_persistence.writes?.attempt_total, 'number');
});

test('data authority snapshot falls back to unknown sync state when specdb is unavailable', async () => {
  const handler = registerDataAuthorityRoutes(makeCtx({
    getSpecDb: () => null,
    sessionCache: {
      getSessionRules: async () => ({
        compiledAt: null,
        mapSavedAt: null,
        compileStale: true,
      }),
    },
  }));

  const result = await handler(
    ['data-authority', 'keyboard', 'snapshot'],
    new URLSearchParams(),
    'GET',
    {},
    {},
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.category, 'keyboard');
  assert.equal(result.body.specdb_sync.status, 'unknown');
  assert.equal(result.body.specdb_sync.version, 0);
  assert.deepEqual(result.body.changed_domains, ['mapping', 'review-layout', 'studio']);
});

