import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFunnelBullets,
  buildDecisionSegments,
  buildEnrichedFunnelBullets,
  computeDomainDecisionBreakdown,
  makeResult,
  makeDetail,
  makeBasicResult,
  makeSearchPlan,
} from './helpers/searchResultsHelpersHarness.js';

describe('buildFunnelBullets', () => {
  it('returns empty array when no data', () => {
    assert.deepEqual(buildFunnelBullets([], [], { keep: 0, maybe: 0, drop: 0, other: 0 }), []);
  });

  it('includes provider breakdown bullet', () => {
    const basics = [
      makeBasicResult({ provider: 'google', result_count: 10 }),
      makeBasicResult({ provider: 'searxng', result_count: 5 }),
    ];
    const details = [
      makeDetail({ results: [makeResult(), makeResult(), makeResult()] }),
    ];
    const decisions = { keep: 2, maybe: 0, drop: 1, other: 0 };
    const bullets = buildFunnelBullets(basics, details, decisions);
    assert.ok(bullets.length > 0);
    assert.ok(bullets.some((b) => b.includes('queries')));
  });

  it('includes dedupe impact when deduplication occurred', () => {
    const basics = [makeBasicResult({ result_count: 10 })];
    const details = [makeDetail({ dedupe_count: 3, results: [makeResult()] })];
    const decisions = { keep: 1, maybe: 0, drop: 0, other: 0 };
    const bullets = buildFunnelBullets(basics, details, decisions);
    assert.ok(bullets.some((b) => b.toLowerCase().includes('dedupe') || b.toLowerCase().includes('duplicate')));
  });

  it('includes decision distribution bullet when decisions exist', () => {
    const basics = [makeBasicResult()];
    const details = [makeDetail({ results: [makeResult(), makeResult({ decision: 'drop' })] })];
    const decisions = { keep: 1, maybe: 0, drop: 1, other: 0 };
    const bullets = buildFunnelBullets(basics, details, decisions);
    assert.ok(bullets.some((b) => b.includes('kept') || b.includes('keep')));
  });
});

// ── buildDecisionSegments ──

describe('buildDecisionSegments', () => {
  it('returns segments with correct colors', () => {
    const decisions = { keep: 5, maybe: 2, drop: 3, other: 0 };
    const segments = buildDecisionSegments(decisions);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].label, 'Keep');
    assert.equal(segments[0].value, 5);
    assert.ok(segments[0].color.includes('sf-metric-fill-success'));
    assert.equal(segments[1].label, 'Maybe');
    assert.equal(segments[1].value, 2);
    assert.ok(segments[1].color.includes('sf-metric-fill-warning'));
    assert.equal(segments[2].label, 'Drop');
    assert.equal(segments[2].value, 3);
    assert.ok(segments[2].color.includes('sf-metric-fill-danger'));
  });

  it('returns segments with zero values when all counts are zero', () => {
    const decisions = { keep: 0, maybe: 0, drop: 0, other: 0 };
    const segments = buildDecisionSegments(decisions);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].value, 0);
    assert.equal(segments[1].value, 0);
    assert.equal(segments[2].value, 0);
  });
});

// ── buildQueryTargetMap ──

describe('computeDomainDecisionBreakdown', () => {
  it('returns empty map for empty details', () => {
    const result = computeDomainDecisionBreakdown([]);
    assert.equal(result.size, 0);
  });

  it('counts keep/maybe/drop per domain across all queries', () => {
    const details = [
      makeDetail({
        query: 'q1',
        results: [
          makeResult({ domain: 'a.com', decision: 'keep' }),
          makeResult({ domain: 'a.com', decision: 'drop' }),
          makeResult({ domain: 'b.com', decision: 'keep' }),
        ],
      }),
      makeDetail({
        query: 'q2',
        results: [
          makeResult({ domain: 'a.com', decision: 'maybe' }),
          makeResult({ domain: 'b.com', decision: 'drop' }),
        ],
      }),
    ];
    const result = computeDomainDecisionBreakdown(details);
    const a = result.get('a.com');
    assert.equal(a.keep, 1);
    assert.equal(a.maybe, 1);
    assert.equal(a.drop, 1);
    const b = result.get('b.com');
    assert.equal(b.keep, 1);
    assert.equal(b.drop, 1);
    assert.equal(b.maybe, 0);
  });

  it('classifies skip decisions as drop', () => {
    const details = [
      makeDetail({
        results: [makeResult({ domain: 'x.com', decision: 'skip' })],
      }),
    ];
    const result = computeDomainDecisionBreakdown(details);
    assert.equal(result.get('x.com').drop, 1);
  });
});

// ── buildEnrichedFunnelBullets ──

describe('buildEnrichedFunnelBullets', () => {
  it('returns empty array when no data', () => {
    const result = buildEnrichedFunnelBullets([], [], { keep: 0, maybe: 0, drop: 0, other: 0 }, undefined);
    assert.deepEqual(result, []);
  });

  it('includes target fields bullet when search plans have target maps', () => {
    const basics = [makeBasicResult({ query: 'q1', result_count: 5 })];
    const details = [makeDetail({ query: 'q1', results: [makeResult()] })];
    const decisions = { keep: 1, maybe: 0, drop: 0, other: 0 };
    const plans = [
      makeSearchPlan({
        query_target_map: { 'q1': ['sensor', 'dpi', 'weight'] },
        queries_generated: ['q1'],
      }),
    ];
    const bullets = buildEnrichedFunnelBullets(basics, details, decisions, plans);
    assert.ok(bullets.some((b) => b.includes('field') || b.includes('target')));
  });

  it('includes top-yield query bullet when details exist', () => {
    const basics = [
      makeBasicResult({ query: 'q1', result_count: 5 }),
      makeBasicResult({ query: 'q2', result_count: 3 }),
    ];
    const details = [
      makeDetail({ query: 'q1', results: [makeResult(), makeResult(), makeResult({ decision: 'keep' })] }),
      makeDetail({ query: 'q2', results: [makeResult()] }),
    ];
    const decisions = { keep: 4, maybe: 0, drop: 0, other: 0 };
    const bullets = buildEnrichedFunnelBullets(basics, details, decisions, undefined);
    assert.ok(bullets.some((b) => b.includes('q1') || b.includes('yield') || b.includes('most')));
  });

  it('includes strongest domain bullet', () => {
    const basics = [makeBasicResult({ result_count: 10 })];
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: 'rtings.com', decision: 'keep' }),
          makeResult({ domain: 'rtings.com', decision: 'keep' }),
          makeResult({ domain: 'amazon.com', decision: 'drop' }),
        ],
      }),
    ];
    const decisions = { keep: 2, maybe: 0, drop: 1, other: 0 };
    const bullets = buildEnrichedFunnelBullets(basics, details, decisions, undefined);
    assert.ok(bullets.some((b) => b.includes('rtings.com')));
  });

  it('still includes basic funnel info (queries, dedupe, decisions)', () => {
    const basics = [makeBasicResult({ provider: 'google', result_count: 10 })];
    const details = [makeDetail({ dedupe_count: 2, results: [makeResult()] })];
    const decisions = { keep: 1, maybe: 0, drop: 0, other: 0 };
    const bullets = buildEnrichedFunnelBullets(basics, details, decisions, undefined);
    assert.ok(bullets.some((b) => b.includes('quer')));
  });
});

// ── extractSiteScope ──
