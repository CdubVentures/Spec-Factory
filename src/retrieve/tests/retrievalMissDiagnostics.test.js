import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeEvidenceHit,
  runRetrieval,
} from './helpers/retrievalContractHarness.js';

test('critical-field retrieval reports a miss when only identity-mismatched evidence is available', () => {
  const pool = [
    makeEvidenceHit({
      host: 'wrong.com',
      quote: 'Weight: 80g',
      snippetId: 'sn_wrong',
      identityMatch: false,
    }),
  ];

  const result = runRetrieval({
    needRow: { field_key: 'weight', need_score: 10, required_level: 'critical', min_refs: 2 },
    fieldRule: { search_hints: { query_terms: ['weight', 'grams'] }, unit: 'g' },
    evidencePool: pool,
    identityFilterEnabled: true,
  });

  assert.ok(result.miss_diagnostics);
  assert.equal(result.miss_diagnostics.status, 'miss');
});

test('retrieval explains that the pool was empty when no evidence rows were available', () => {
  const result = runRetrieval({
    fieldRule: { search_hints: { query_terms: ['weight'] }, unit: 'g' },
  });

  assert.ok(result.miss_diagnostics);
  assert.ok(result.miss_diagnostics.reasons.includes('pool_empty'));
  assert.equal(result.miss_diagnostics.pool_rows_scanned, 0);
  assert.equal(result.miss_diagnostics.status, 'miss');
});

test('retrieval explains that no anchor terms matched when unrelated evidence is present', () => {
  const pool = [
    makeEvidenceHit({
      fieldKey: 'totally_different',
      host: 'random.com',
      path: 'xyz',
      method: 'text',
      quote: 'Screen ratio 16:9 panel type VA',
      snippetId: 'sn_random',
    }),
  ];

  const result = runRetrieval({
    fieldKey: 'click_latency_ms',
    needRow: { field_key: 'click_latency_ms', need_score: 10, required_level: 'required', min_refs: 1 },
    fieldRule: { search_hints: { query_terms: ['click latency'] } },
    evidencePool: pool,
  });

  assert.ok(result.miss_diagnostics);
  assert.ok(result.miss_diagnostics.reasons.includes('no_anchor'));
  assert.ok(result.miss_diagnostics.pool_rows_scanned > 0);
  assert.equal(result.miss_diagnostics.anchor_match_count, 0);
});

test('retrieval reports a tier deficit when evidence only comes from disallowed tiers', () => {
  const pool = [
    makeEvidenceHit({
      host: 'retailer.com',
      tier: 4,
      quote: 'Weight: 54 grams',
      snippetId: 'sn_retail',
    }),
  ];

  const result = runRetrieval({
    needRow: { field_key: 'weight', need_score: 10, required_level: 'required', min_refs: 1, tier_preference: [1, 2] },
    fieldRule: { search_hints: { query_terms: ['weight', 'grams'] }, unit: 'g' },
    evidencePool: pool,
  });

  assert.ok(result.miss_diagnostics);
  assert.ok(result.miss_diagnostics.reasons.includes('tier_deficit'));
  assert.equal(result.miss_diagnostics.preferred_tier_hit_count, 0);
});

test('retrieval reports satisfied once preferred-tier evidence meets the minimum reference count', () => {
  const pool = [
    makeEvidenceHit({
      host: 'mfg.com',
      tier: 1,
      path: 'spec',
      quote: 'Weight: 54 grams',
      snippetId: 'sn_mfg',
    }),
    makeEvidenceHit({
      host: 'rtings.com',
      tier: 2,
      path: 'review',
      quote: 'Weight: 54 g measured',
      snippetId: 'sn_rtings',
    }),
  ];

  const result = runRetrieval({
    needRow: { field_key: 'weight', need_score: 10, required_level: 'required', min_refs: 2, tier_preference: [1, 2] },
    fieldRule: { search_hints: { query_terms: ['weight', 'grams'] }, unit: 'g' },
    evidencePool: pool,
  });

  assert.ok(result.miss_diagnostics);
  assert.equal(result.miss_diagnostics.status, 'satisfied');
  assert.ok(result.miss_diagnostics.preferred_tier_hit_count >= 2);
  assert.equal(result.miss_diagnostics.min_refs_gap, 0);
  assert.deepEqual(result.miss_diagnostics.reasons, []);
});
