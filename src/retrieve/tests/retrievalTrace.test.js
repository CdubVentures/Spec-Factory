import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeEvidenceHit,
  makeEvidencePool,
  runRetrieval,
} from './helpers/retrievalContractHarness.js';

test('retrieval trace reports how many evidence rows were scanned, scored, accepted, and rejected', () => {
  const pool = makeEvidencePool({ fieldKey: 'weight', count: 10 });

  const result = runRetrieval({
    evidencePool: pool,
    traceEnabled: true,
  });

  assert.ok(result.trace, 'trace should be present when traceEnabled=true');
  assert.ok(Number.isFinite(result.trace.pool_size));
  assert.ok(result.trace.pool_size > 0);
  assert.ok(Number.isFinite(result.trace.scored_count));
  assert.ok(Number.isFinite(result.trace.accepted_count));
  assert.ok(Number.isFinite(result.trace.rejected_count));
  assert.ok(result.trace.accepted_count > 0);
});

test('retrieval trace records why non-winning evidence rows were rejected', () => {
  const pool = [
    ...makeEvidencePool({ fieldKey: 'weight', count: 3 }),
    makeEvidenceHit({
      fieldKey: 'unrelated_field',
      host: 'unrelated.com',
      method: 'text',
      quote: 'Some unrelated content without anchor terms',
      snippetId: 'sn_unrelated',
    }),
    makeEvidenceHit({
      host: 'wrong-product.com',
      quote: 'Weight: 80 grams',
      snippetId: 'sn_wrong',
      identityMatch: false,
    }),
  ];

  const result = runRetrieval({
    needRow: { field_key: 'weight', need_score: 10, required_level: 'critical', min_refs: 1 },
    evidencePool: pool,
    traceEnabled: true,
    identityFilterEnabled: true,
  });

  assert.ok(result.trace);
  assert.ok(Array.isArray(result.trace.rejected_hits));
  const reasons = result.trace.rejected_hits.map((h) => h.rejection_reason);
  assert.ok(reasons.some((r) => r === 'no_anchor' || r === 'identity_mismatch'));
});

test('retrieval omits trace payloads unless tracing was explicitly requested', () => {
  const pool = makeEvidencePool({ fieldKey: 'weight', count: 3 });

  const result = runRetrieval({
    evidencePool: pool,
  });

  assert.equal(result.trace, undefined);
});

test('retrieval trace caps rejected-hit details so miss reports stay bounded', () => {
  const pool = Array.from({ length: 50 }, (_, i) => ({
    ...makeEvidenceHit({
      fieldKey: 'other_field',
      host: `unrelated-${i}.com`,
      method: 'text',
      quote: `Completely unrelated content number ${i}`,
      snippetId: `sn_unrelated_${i}`,
    }),
  }));

  const result = runRetrieval({
    fieldRule: { search_hints: { query_terms: ['weight'] }, unit: 'g' },
    evidencePool: pool,
    traceEnabled: true,
  });

  assert.ok(result.trace);
  assert.ok(result.trace.rejected_hits.length <= 20);
});
