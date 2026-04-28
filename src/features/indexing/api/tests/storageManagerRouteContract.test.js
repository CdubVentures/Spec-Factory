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
  const emitted = [];

  return {
    jsonRes: (res, status, body) => ({ status, body }),
    readJsonBody: async () => overrides.requestBody || {},
    toInt: (v, fallback) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback; },
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
    listIndexLabRuns: async ({ limit, category } = {}) => {
      let result = [...runs];
      if (category) result = result.filter(r => r.category === category);
      return result.slice(0, limit || 50);
    },
    resolveIndexLabRunDirectory: async (runId) => {
      const run = runs.find(r => r.run_id === runId);
      return run ? `/fake/path/${runId}/indexlab` : '';
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
    _emitted: emitted,
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

    it('returns SQL-projected sources without reading run.json', async () => {
      const ctx = buildMockCtx({
        resolveIndexLabRunDirectory: async () => {
          throw new Error('run.json should not be read when SQL detail exists');
        },
        readRunDetailState: async ({ runId, meta }) => ({
          identity: {
            product_id: meta.product_id,
            category: meta.category,
            identity_fingerprint: 'fp-sql',
          },
          sources: [
            {
              url: 'https://example.com/sql-source',
              content_hash: 'hash-sql',
              html_size: 100,
              screenshot_size: 25,
              video_size: 50,
              total_size: 175,
            },
          ],
        }),
      });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs', 'run-001'], new URLSearchParams(), 'GET', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.identity.identity_fingerprint, 'fp-sql');
      deepStrictEqual(result.body.sources.map((source) => source.url), ['https://example.com/sql-source']);
      strictEqual(result.body.sources[0].total_size, 175);
    });

    it('passes source pagination to the SQL detail reader and returns page metadata', async () => {
      let receivedArgs = null;
      const ctx = buildMockCtx({
        readRunDetailState: async (args) => {
          receivedArgs = args;
          return {
            identity: {
              product_id: args.meta.product_id,
              category: args.meta.category,
            },
            sources: [
              { url: 'https://example.com/page-3' },
              { url: 'https://example.com/page-4' },
            ],
            sources_page: {
              limit: 2,
              offset: 2,
              total: 5,
              has_more: true,
            },
          };
        },
      });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(
        ['storage', 'runs', 'run-001'],
        new URLSearchParams('sourcesLimit=2&sourcesOffset=2'),
        'GET',
        {},
        {},
      );

      strictEqual(result.status, 200);
      deepStrictEqual(receivedArgs.sourcesPage, { limit: 2, offset: 2 });
      deepStrictEqual(result.body.sources.map((source) => source.url), [
        'https://example.com/page-3',
        'https://example.com/page-4',
      ]);
      deepStrictEqual(result.body.sources_page, {
        limit: 2,
        offset: 2,
        total: 5,
        has_more: true,
      });
    });

    it('does not fall back to run.json when SQL detail projection is unavailable', async () => {
      let resolvedRunDirectory = false;
      const ctx = buildMockCtx({
        resolveIndexLabRunDirectory: async () => {
          resolvedRunDirectory = true;
          return '/fake/path/run-001/indexlab';
        },
        readRunDetailState: async () => null,
      });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs', 'run-001'], new URLSearchParams(), 'GET', {}, {});

      strictEqual(result.status, 200);
      strictEqual(resolvedRunDirectory, false);
      deepStrictEqual(result.body.sources, []);
      deepStrictEqual(result.body.identity, {});
    });

    it('returns 404 for unknown run', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'runs', 'nonexistent'], new URLSearchParams(), 'GET', {}, {});

      strictEqual(result.status, 404);
      strictEqual(result.body.error, 'run_not_found');
    });

    it('serves a source HTML artifact for a known run and content hash', async () => {
      const htmlBytes = Buffer.from('compressed-html');
      const ctx = buildMockCtx({
        readRunSourceHtmlArtifact: async ({ runId, contentHash }) => ({
          run_id: runId,
          content_hash: contentHash,
          filename: 'abc123abc123.html.gz',
          content: htmlBytes,
        }),
      });
      const handler = createStorageManagerHandler(ctx);
      const res = {
        statusCode: 0,
        headers: {},
        writeHead(code, headers) {
          this.statusCode = code;
          this.headers = headers;
        },
        end(body) {
          this.body = body;
        },
      };

      const handled = await handler(
        ['storage', 'runs', 'run-001', 'sources', 'abc123', 'html'],
        new URLSearchParams(),
        'GET',
        {},
        res,
      );

      strictEqual(handled, true);
      strictEqual(res.statusCode, 200);
      strictEqual(res.headers['Content-Type'], 'text/html; charset=utf-8');
      strictEqual(res.headers['Content-Encoding'], 'gzip');
      strictEqual(res.body, htmlBytes);
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
      strictEqual(result.body.category, 'mouse');
      strictEqual(result.body.product_id, 'mouse-test-product');
    });

    it('emits data-change after deleting an inactive run', async () => {
      const ctx = buildMockCtx();
      const handler = createStorageManagerHandler(ctx);
      await handler(['storage', 'runs', 'run-001'], new URLSearchParams(), 'DELETE', {}, {});

      const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
      strictEqual(emitted?.payload?.event, 'storage-runs-deleted');
      strictEqual(emitted?.payload?.category, 'mouse');
      deepStrictEqual(emitted?.payload?.entities?.productIds, ['mouse-test-product']);
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
      deepStrictEqual(result.body.categories, ['mouse', 'keyboard']);
      deepStrictEqual(result.body.product_ids, ['mouse-test-product', 'keyboard-test']);
    });

    it('emits data-change after bulk deleting runs', async () => {
      const ctx = buildMockCtx({ requestBody: { runIds: ['run-001', 'run-002'] } });
      const handler = createStorageManagerHandler(ctx);
      await handler(['storage', 'runs', 'bulk-delete'], new URLSearchParams(), 'POST', {}, {});

      const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
      strictEqual(emitted?.payload?.event, 'storage-runs-bulk-deleted');
      deepStrictEqual(emitted?.payload?.categories, ['mouse', 'keyboard']);
      deepStrictEqual(emitted?.payload?.entities?.productIds, ['mouse-test-product', 'keyboard-test']);
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
      deepStrictEqual(result.body.categories, ['mouse', 'keyboard']);
      deepStrictEqual(result.body.product_ids, ['mouse-test-product', 'keyboard-test']);
    });

    it('emits data-change after purging runs', async () => {
      const ctx = buildMockCtx({ requestBody: { confirmToken: 'DELETE' } });
      const handler = createStorageManagerHandler(ctx);
      await handler(['storage', 'purge'], new URLSearchParams(), 'POST', {}, {});

      const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
      strictEqual(emitted?.payload?.event, 'storage-purged');
      deepStrictEqual(emitted?.payload?.categories, ['mouse', 'keyboard']);
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
      deepStrictEqual(result.body.categories, ['mouse']);
      deepStrictEqual(result.body.product_ids, ['mouse-test']);
    });

    it('emits data-change after pruning runs', async () => {
      const runs = [
        {
          run_id: 'run-old-failed', category: 'mouse', product_id: 'mouse-test',
          status: 'failed', started_at: '2025-01-01T00:00:00Z', ended_at: '2025-01-01T00:05:00Z',
          counters: { pages_checked: 0, fetched_ok: 0, parse_completed: 0, indexed_docs: 0, fields_filled: 0 },
        },
      ];
      const ctx = buildMockCtx({ runs, requestBody: { olderThanDays: 0, failedOnly: true } });
      const handler = createStorageManagerHandler(ctx);
      await handler(['storage', 'prune'], new URLSearchParams(), 'POST', {}, {});

      const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
      strictEqual(emitted?.payload?.event, 'storage-pruned');
      strictEqual(emitted?.payload?.category, 'mouse');
    });
  });

  describe('POST /storage/urls/delete', () => {
    it('emits data-change after deleting URL artifacts', async () => {
      const deletionCalls = [];
      const ctx = buildMockCtx({
        requestBody: { url: 'https://example.test/a', productId: 'mouse-test-product', category: 'mouse' },
        fsRoots: { indexLabRoot: '/fake/indexlab' },
        resolveDeletionStore: () => ({
          deleteUrl: (args) => {
            deletionCalls.push(args);
            return { ok: true, deleted: 1 };
          },
        }),
      });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(['storage', 'urls', 'delete'], new URLSearchParams(), 'POST', {}, {});

      strictEqual(result.status, 200);
      strictEqual(result.body.category, 'mouse');
      strictEqual(result.body.product_id, 'mouse-test-product');
      strictEqual(deletionCalls.length, 1);
      const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
      strictEqual(emitted?.payload?.event, 'storage-urls-deleted');
      strictEqual(emitted?.payload?.category, 'mouse');
      deepStrictEqual(emitted?.payload?.entities?.productIds, ['mouse-test-product']);
    });
  });

  describe('POST /storage/products/:pid/purge-history', () => {
    it('emits data-change after purging product history', async () => {
      const deletionCalls = [];
      const ctx = buildMockCtx({
        requestBody: { category: 'mouse' },
        fsRoots: { indexLabRoot: '/fake/indexlab' },
        resolveDeletionStore: () => ({
          deleteProductHistory: (args) => {
            deletionCalls.push(args);
            return { ok: true, deleted: 1 };
          },
        }),
      });
      const handler = createStorageManagerHandler(ctx);
      const result = await handler(
        ['storage', 'products', 'mouse-test-product', 'purge-history'],
        new URLSearchParams(),
        'POST',
        {},
        {},
      );

      strictEqual(result.status, 200);
      strictEqual(result.body.category, 'mouse');
      strictEqual(result.body.product_id, 'mouse-test-product');
      strictEqual(deletionCalls.length, 1);
      const emitted = ctx._emitted.find((entry) => entry.channel === 'data-change');
      strictEqual(emitted?.payload?.event, 'storage-history-purged');
      strictEqual(emitted?.payload?.category, 'mouse');
      deepStrictEqual(emitted?.payload?.entities?.productIds, ['mouse-test-product']);
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
