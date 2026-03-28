// WHY: Contract test for storage manager route handler.
// Verifies response shapes, guard clauses, and edge cases for /storage/* endpoints.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { createStorageManagerHandler } from '../storageManagerRoutes.js';

function buildMockCtx(overrides = {}) {
  const runs = overrides.runs || [
    {
      run_id: 'run-001', category: 'mouse', product_id: 'mouse-test-product',
      status: 'completed', started_at: '2026-03-01T00:00:00Z', ended_at: '2026-03-01T00:05:00Z',
      counters: { pages_checked: 10, fetched_ok: 8, parse_completed: 7, indexed_docs: 5, fields_filled: 20 },
      storage_metrics: { total_size_bytes: 1024, artifact_breakdown: [], computed_at: '2026-03-01T00:06:00Z' },
    },
    {
      run_id: 'run-002', category: 'keyboard', product_id: 'keyboard-test',
      status: 'completed', started_at: '2026-03-10T00:00:00Z', ended_at: '2026-03-10T00:03:00Z',
      counters: { pages_checked: 5, fetched_ok: 3, parse_completed: 3, indexed_docs: 2, fields_filled: 8 },
    },
  ];

  const deletedRuns = [];

  return {
    jsonRes: (res, status, body) => ({ status, body }),
    readJsonBody: async () => overrides.requestBody || {},
    toInt: (v, fallback) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback; },
    broadcastWs: () => {},
    listIndexLabRuns: async ({ limit, category } = {}) => {
      let result = [...runs];
      if (category) result = result.filter(r => r.category === category);
      return result.slice(0, limit || 50);
    },
    resolveIndexLabRunDirectory: async (runId) => {
      const run = runs.find(r => r.run_id === runId);
      return run ? `/fake/path/${runId}/indexlab` : '';
    },
    runDataStorageState: {
      enabled: true,
      destinationType: 'local',
      localDirectory: '/fake/storage',
    },
    indexLabRoot: '/fake/indexlab',
    outputRoot: '/fake/output',
    storage: null,
    isRunStillActive: (runId) => overrides.activeRunId === runId,
    readRunMeta: async (runId) => runs.find(r => r.run_id === runId) || null,
    deleteArchivedRun: async (runId) => {
      deletedRuns.push(runId);
      return { ok: true, run_id: runId, deleted_from: 'local' };
    },
    _deletedRuns: deletedRuns,
    ...overrides,
  };
}

describe('storageManagerRoutes', () => {
  describe('GET /storage/overview', () => {
    it('returns expected shape with summary metrics', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'overview'], new URLSearchParams(), 'GET', {}, {});

      strictEqual(result.status, 200);
      const b = result.body;
      ok(typeof b.total_runs === 'number');
      ok(typeof b.total_size_bytes === 'number');
      ok(Array.isArray(b.categories));
      ok(typeof b.storage_backend === 'string');
      ok(typeof b.backend_detail === 'object');
      strictEqual(b.total_runs, 2);
      ok(b.categories.includes('mouse'));
      ok(b.categories.includes('keyboard'));
      ok(typeof b.products_indexed === 'number');
      ok(typeof b.oldest_run === 'string' || b.oldest_run === null);
      ok(typeof b.newest_run === 'string' || b.newest_run === null);
      ok(typeof b.avg_run_size_bytes === 'number');
      strictEqual(b.products_indexed, 2);
    });

    it('returns zeros for empty storage', async () => {
      const ctx = buildMockCtx({ runs: [] });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'overview'], new URLSearchParams(), 'GET', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.total_runs, 0);
      strictEqual(result.body.total_size_bytes, 0);
      deepStrictEqual(result.body.categories, []);
    });
  });

  describe('GET /storage/runs', () => {
    it('returns all runs with enriched fields', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs'], new URLSearchParams(), 'GET', {}, {});

      strictEqual(result.status, 200);
      ok(Array.isArray(result.body.runs));
      strictEqual(result.body.runs.length, 2);
      const first = result.body.runs[0];
      ok(typeof first.run_id === 'string');
      ok(typeof first.category === 'string');
      ok(typeof first.status === 'string');
    });

    it('filters by category', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      const params = new URLSearchParams('category=mouse');
      const result = await handler(['storage', 'runs'], params, 'GET', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.runs.length, 1);
      strictEqual(result.body.runs[0].category, 'mouse');
    });
  });

  describe('GET /storage/runs/:runId', () => {
    it('returns full run detail', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs', 'run-001'], new URLSearchParams(), 'GET', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.run_id, 'run-001');
    });

    it('returns 404 for unknown run', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs', 'nonexistent'], new URLSearchParams(), 'GET', {}, {});

      strictEqual(result.status, 404);
      strictEqual(result.body.error, 'run_not_found');
    });
  });

  describe('DELETE /storage/runs/:runId', () => {
    it('deletes an inactive run', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs', 'run-001'], new URLSearchParams(), 'DELETE', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.ok, true);
      strictEqual(result.body.run_id, 'run-001');
    });

    it('rejects deletion of an active run with 409', async () => {
      const ctx = buildMockCtx({ activeRunId: 'run-001' });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs', 'run-001'], new URLSearchParams(), 'DELETE', {}, {});

      strictEqual(result.status, 409);
      strictEqual(result.body.ok, false);
      strictEqual(result.body.error, 'run_in_progress');
    });
  });

  describe('POST /storage/runs/bulk-delete', () => {
    it('bulk deletes multiple runs', async () => {
      const ctx = buildMockCtx({ requestBody: { runIds: ['run-001', 'run-002'] } });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs', 'bulk-delete'], new URLSearchParams(), 'POST', {}, {});

      strictEqual(result.status, 200);
      ok(Array.isArray(result.body.deleted));
      ok(Array.isArray(result.body.errors));
      strictEqual(result.body.deleted.length, 2);
    });

    it('reports in-progress runs as errors in bulk delete', async () => {
      const ctx = buildMockCtx({ activeRunId: 'run-001', requestBody: { runIds: ['run-001', 'run-002'] } });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs', 'bulk-delete'], new URLSearchParams(), 'POST', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.deleted.length, 1);
      strictEqual(result.body.errors.length, 1);
      strictEqual(result.body.errors[0].run_id, 'run-001');
    });
  });

  describe('POST /storage/purge', () => {
    it('rejects without confirmToken === DELETE', async () => {
      const ctx = buildMockCtx({ requestBody: {} });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'purge'], new URLSearchParams(), 'POST', {}, {});

      strictEqual(result.status, 400);
      strictEqual(result.body.ok, false);
      strictEqual(result.body.error, 'confirm_token_required');
    });

    it('accepts with correct confirmToken', async () => {
      const ctx = buildMockCtx({ requestBody: { confirmToken: 'DELETE' } });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'purge'], new URLSearchParams(), 'POST', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.ok, true);
      ok(typeof result.body.purged === 'number');
    });
  });

  describe('POST /storage/prune', () => {
    it('with olderThanDays: 999999 returns none pruned', async () => {
      const ctx = buildMockCtx({ requestBody: { olderThanDays: 999999 } });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'prune'], new URLSearchParams(), 'POST', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.ok, true);
      strictEqual(result.body.pruned, 0);
    });

    it('with failedOnly: true skips non-failed runs', async () => {
      const runs = [
        {
          run_id: 'run-old-failed', category: 'mouse', product_id: 'mouse-test',
          status: 'failed', started_at: '2025-01-01T00:00:00Z', ended_at: '2025-01-01T00:05:00Z',
          counters: { pages_checked: 0, fetched_ok: 0, parse_completed: 0, indexed_docs: 0, fields_filled: 0 },
        },
        {
          run_id: 'run-old-ok', category: 'mouse', product_id: 'mouse-test',
          status: 'completed', started_at: '2025-01-01T00:00:00Z', ended_at: '2025-01-01T00:05:00Z',
          counters: { pages_checked: 5, fetched_ok: 3, parse_completed: 3, indexed_docs: 2, fields_filled: 8 },
        },
      ];
      const ctx = buildMockCtx({ runs, requestBody: { olderThanDays: 0, failedOnly: true } });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'prune'], new URLSearchParams(), 'POST', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.pruned, 1);
    });
  });

  describe('GET /storage/export', () => {
    it('returns valid JSON with runs array and metadata', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'export'], new URLSearchParams(), 'GET', {}, {});

      strictEqual(result.status, 200);
      ok(typeof result.body.exported_at === 'string');
      ok(typeof result.body.storage_backend === 'string');
      ok(Array.isArray(result.body.runs));
      strictEqual(result.body.runs.length, 2);
    });
  });

  describe('unmatched routes', () => {
    it('returns false for non-storage routes', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['other', 'path'], new URLSearchParams(), 'GET', {}, {});
      strictEqual(result, false);
    });
  });
});
