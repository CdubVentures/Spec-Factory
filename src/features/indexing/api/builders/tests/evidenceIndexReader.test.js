import test from 'node:test';
import assert from 'node:assert/strict';

import { createEvidenceIndexReader } from '../evidenceIndexReader.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReader(overrides = {}) {
  return createEvidenceIndexReader({
    resolveContext: async () => ({
      token: 'run-1',
      runDir: '/fake',
      meta: { run_id: 'run-1', category: 'mouse' },
      category: 'mouse',
      resolvedRunId: 'run-1',
      productId: 'mouse-test',
    }),
    readEvents: async () => [],
    getSpecDbReady: async () => null,
    ...overrides,
  });
}

function makeMockDb({ runCount = 1, summaryRow = {}, documents = [], topFields = [], searchRows = [] } = {}) {
  return {
    db: {
      prepare(sql) {
        return {
          get(_params) {
            if (sql.includes('COUNT(*)')) return { c: runCount };
            return summaryRow;
          },
          all(_params) {
            if (sql.includes('GROUP BY sr.source_id')) return documents;
            if (sql.includes('GROUP BY asr.field_key')) return topFields;
            if (sql.includes('LIKE @query_like')) return searchRows;
            return [];
          },
        };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Group 1: Null / empty input guards
// ---------------------------------------------------------------------------

test('readIndexLabRunEvidenceIndex: null runId → null', async () => {
  const reader = makeReader({
    resolveContext: async () => null,
  });
  const result = await reader.readIndexLabRunEvidenceIndex(null);
  assert.equal(result, null);
});

test('readIndexLabRunEvidenceIndex: resolveContext returns null → null', async () => {
  const reader = makeReader({
    resolveContext: async () => null,
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-missing');
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Group 2: DB not ready → skeleton
// ---------------------------------------------------------------------------

test('readIndexLabRunEvidenceIndex: specDb null → skeleton with db_ready:false', async () => {
  const reader = makeReader({
    getSpecDbReady: async () => null,
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-1');
  assert.equal(result.db_ready, false);
  assert.equal(result.run_id, 'run-1');
  assert.equal(result.category, 'mouse');
  assert.equal(result.product_id, 'mouse-test');
  assert.equal(result.scope.mode, 'none');
  assert.equal(result.summary.documents, 0);
  assert.deepStrictEqual(result.documents, []);
  assert.deepStrictEqual(result.top_fields, []);
  assert.equal(result.search.note, 'spec_db_not_ready');
});

test('readIndexLabRunEvidenceIndex: specDb.db null → skeleton with db_ready:false', async () => {
  const reader = makeReader({
    getSpecDbReady: async () => ({ db: null }),
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-1');
  assert.equal(result.db_ready, false);
  assert.equal(result.scope.mode, 'none');
});

test('readIndexLabRunEvidenceIndex: skeleton preserves query and limit from input', async () => {
  const reader = makeReader({
    getSpecDbReady: async () => null,
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-1', { query: 'weight', limit: 20 });
  assert.equal(result.search.query, 'weight');
  assert.equal(result.search.limit, 20);
  assert.equal(result.search.count, 0);
  assert.deepStrictEqual(result.search.rows, []);
});

// ---------------------------------------------------------------------------
// Group 3: Scope / SQL path
// ---------------------------------------------------------------------------

test('readIndexLabRunEvidenceIndex: run_id match → scope.mode = "run"', async () => {
  const reader = makeReader({
    getSpecDbReady: async () => makeMockDb({ runCount: 1 }),
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-1');
  assert.equal(result.db_ready, true);
  assert.equal(result.scope.mode, 'run');
  assert.equal(result.scope.run_match, true);
});

test('readIndexLabRunEvidenceIndex: no run_id match → scope.mode = "product_fallback"', async () => {
  const reader = makeReader({
    getSpecDbReady: async () => makeMockDb({ runCount: 0 }),
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-1');
  assert.equal(result.scope.mode, 'product_fallback');
  assert.equal(result.scope.run_match, false);
});

test('readIndexLabRunEvidenceIndex: summary, documents, top_fields correctly shaped', async () => {
  const reader = makeReader({
    getSpecDbReady: async () => makeMockDb({
      runCount: 1,
      summaryRow: { documents: 3, artifacts: 5, artifacts_with_hash: 4, unique_hashes: 2, assertions: 10, evidence_refs: 8, fields_covered: 6 },
      documents: [
        { source_id: 's1', source_url: 'https://example.com', source_host: 'example.com', source_tier: 1, crawl_status: 'ok', http_status: 200, fetched_at: '2026-01-01', run_id: 'run-1', artifact_count: 2, hash_count: 1, unique_hashes: 1, assertion_count: 3, evidence_ref_count: 2 },
      ],
      topFields: [
        { field_key: 'weight', assertions: 5, evidence_refs: 3, distinct_sources: 2 },
      ],
    }),
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-1');
  assert.equal(result.summary.documents, 3);
  assert.equal(result.summary.artifacts, 5);
  assert.equal(result.summary.fields_covered, 6);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].source_id, 's1');
  assert.equal(result.documents[0].source_tier, 1);
  assert.equal(result.top_fields.length, 1);
  assert.equal(result.top_fields[0].field_key, 'weight');
  assert.equal(result.top_fields[0].assertions, 5);
});

// ---------------------------------------------------------------------------
// Group 4: Search
// ---------------------------------------------------------------------------

test('readIndexLabRunEvidenceIndex: empty query → search.rows is empty array', async () => {
  const reader = makeReader({
    getSpecDbReady: async () => makeMockDb({ runCount: 1 }),
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-1', { query: '' });
  assert.deepStrictEqual(result.search.rows, []);
  assert.equal(result.search.count, 0);
});

test('readIndexLabRunEvidenceIndex: with query → search returns mapped rows', async () => {
  const reader = makeReader({
    getSpecDbReady: async () => makeMockDb({
      runCount: 1,
      searchRows: [
        {
          source_id: 's1', source_url: 'https://example.com', source_host: 'example.com',
          source_tier: 2, run_id: 'run-1', assertion_id: 'a1', field_key: 'weight',
          context_kind: 'spec_table', value_raw: '59g', value_normalized: '59',
          snippet_id: 'sn1', evidence_url: 'https://example.com#ev', quote: 'weighs 59g',
          snippet_text: 'spec: 59g',
        },
      ],
    }),
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-1', { query: 'weight' });
  assert.equal(result.search.count, 1);
  assert.equal(result.search.rows[0].field_key, 'weight');
  assert.equal(result.search.rows[0].source_id, 's1');
  assert.equal(result.search.rows[0].value_preview, '59g');
});

// ---------------------------------------------------------------------------
// Group 5: Dedupe stream
// ---------------------------------------------------------------------------

test('readIndexLabRunEvidenceIndex: dedupe_stream calls readEvents and buildEvidenceSearchPayload', async () => {
  let eventsCalled = false;
  const reader = makeReader({
    getSpecDbReady: async () => makeMockDb({ runCount: 1 }),
    readEvents: async (runId, limit) => {
      eventsCalled = true;
      assert.equal(runId, 'run-1');
      assert.equal(limit, 8000);
      return [
        { event: 'indexed_new', payload: { dedupe_outcome: 'new', chunks_indexed: 2 } },
        { event: 'dedupe_hit', payload: { dedupe_outcome: 'reused', chunks_indexed: 0 } },
      ];
    },
  });
  const result = await reader.readIndexLabRunEvidenceIndex('run-1');
  assert.equal(eventsCalled, true);
  assert.equal(typeof result.dedupe_stream, 'object');
  assert.equal(typeof result.dedupe_stream.total, 'number');
});
