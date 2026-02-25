import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeTriageDecisionCounts,
  computeTriageTopDomains,
  computeTriageUniqueDomains,
  buildTriageDecisionSegments,
  buildTriageFunnelBullets,
  computeTriageDedupeStats,
  buildTriageDomainDecisionBreakdown,
} from '../tools/gui-react/src/pages/runtime-ops/panels/serpTriageHelpers.js';

function makeCandidate(overrides = {}) {
  return {
    url: 'https://example.com/page',
    title: 'Product Page',
    domain: 'example.com',
    snippet: 'Some snippet text',
    score: 0.75,
    decision: 'keep',
    rationale: 'High relevance',
    score_components: {
      base_relevance: 0.5,
      tier_boost: 0.1,
      identity_match: 0.1,
      penalties: -0.05,
    },
    ...overrides,
  };
}

function makeTriageResult(overrides = {}) {
  return {
    query: 'test query',
    kept_count: 0,
    dropped_count: 0,
    candidates: [],
    ...overrides,
  };
}

function makeCall(overrides = {}) {
  return {
    status: 'finished',
    reason: 'triage',
    model: 'gpt-4o-mini',
    provider: 'openai',
    tokens: { input: 500, output: 200 },
    duration_ms: 1200,
    prompt_preview: null,
    response_preview: null,
    error: null,
    ...overrides,
  };
}

// ── computeTriageDecisionCounts ──

describe('computeTriageDecisionCounts', () => {
  it('returns zero counts for empty triage array', () => {
    const result = computeTriageDecisionCounts([]);
    assert.deepEqual(result, { keep: 0, maybe: 0, drop: 0 });
  });

  it('counts keep/maybe/drop decisions across all triage results', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ decision: 'keep' }),
          makeCandidate({ decision: 'drop' }),
          makeCandidate({ decision: 'maybe' }),
        ],
      }),
      makeTriageResult({
        candidates: [
          makeCandidate({ decision: 'keep' }),
          makeCandidate({ decision: 'keep' }),
        ],
      }),
    ];
    const result = computeTriageDecisionCounts(triage);
    assert.equal(result.keep, 3);
    assert.equal(result.maybe, 1);
    assert.equal(result.drop, 1);
  });

  it('classifies skip decisions as drop', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ decision: 'keep' }),
          makeCandidate({ decision: 'skip' }),
        ],
      }),
    ];
    const result = computeTriageDecisionCounts(triage);
    assert.equal(result.keep, 1);
    assert.equal(result.drop, 1);
  });

  it('classifies unknown decisions as drop', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ decision: '' }),
          makeCandidate({ decision: 'unknown' }),
        ],
      }),
    ];
    const result = computeTriageDecisionCounts(triage);
    assert.equal(result.drop, 2);
  });
});

// ── computeTriageTopDomains ──

describe('computeTriageTopDomains', () => {
  it('returns empty array for empty triage', () => {
    assert.deepEqual(computeTriageTopDomains([], 5), []);
  });

  it('counts and sorts domains by frequency', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ domain: 'a.com' }),
          makeCandidate({ domain: 'b.com' }),
          makeCandidate({ domain: 'a.com' }),
          makeCandidate({ domain: 'a.com' }),
          makeCandidate({ domain: 'b.com' }),
          makeCandidate({ domain: 'c.com' }),
        ],
      }),
    ];
    const result = computeTriageTopDomains(triage, 5);
    assert.equal(result[0].domain, 'a.com');
    assert.equal(result[0].count, 3);
    assert.equal(result[1].domain, 'b.com');
    assert.equal(result[1].count, 2);
    assert.equal(result[2].domain, 'c.com');
    assert.equal(result[2].count, 1);
  });

  it('respects the limit parameter', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ domain: 'a.com' }),
          makeCandidate({ domain: 'b.com' }),
          makeCandidate({ domain: 'c.com' }),
          makeCandidate({ domain: 'd.com' }),
        ],
      }),
    ];
    const result = computeTriageTopDomains(triage, 2);
    assert.equal(result.length, 2);
  });

  it('aggregates across multiple triage results', () => {
    const triage = [
      makeTriageResult({ candidates: [makeCandidate({ domain: 'x.com' })] }),
      makeTriageResult({ candidates: [makeCandidate({ domain: 'x.com' }), makeCandidate({ domain: 'y.com' })] }),
    ];
    const result = computeTriageTopDomains(triage, 5);
    assert.equal(result[0].domain, 'x.com');
    assert.equal(result[0].count, 2);
  });
});

// ── computeTriageUniqueDomains ──

describe('computeTriageUniqueDomains', () => {
  it('returns 0 for empty triage', () => {
    assert.equal(computeTriageUniqueDomains([]), 0);
  });

  it('counts unique domains across all triage results', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ domain: 'a.com' }),
          makeCandidate({ domain: 'b.com' }),
          makeCandidate({ domain: 'a.com' }),
        ],
      }),
      makeTriageResult({
        candidates: [
          makeCandidate({ domain: 'b.com' }),
          makeCandidate({ domain: 'c.com' }),
        ],
      }),
    ];
    assert.equal(computeTriageUniqueDomains(triage), 3);
  });
});

// ── buildTriageDecisionSegments ──

describe('buildTriageDecisionSegments', () => {
  it('returns segments with correct labels and colors', () => {
    const counts = { keep: 5, maybe: 2, drop: 3 };
    const segments = buildTriageDecisionSegments(counts);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].label, 'Keep');
    assert.equal(segments[0].value, 5);
    assert.ok(segments[0].color.includes('green'));
    assert.equal(segments[1].label, 'Maybe');
    assert.equal(segments[1].value, 2);
    assert.ok(segments[1].color.includes('yellow'));
    assert.equal(segments[2].label, 'Drop');
    assert.equal(segments[2].value, 3);
    assert.ok(segments[2].color.includes('red'));
  });

  it('returns segments with zero values when all counts are zero', () => {
    const counts = { keep: 0, maybe: 0, drop: 0 };
    const segments = buildTriageDecisionSegments(counts);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].value, 0);
    assert.equal(segments[1].value, 0);
    assert.equal(segments[2].value, 0);
  });
});

// ── buildTriageFunnelBullets ──

describe('buildTriageFunnelBullets', () => {
  it('returns empty array for empty triage and no calls', () => {
    assert.deepEqual(buildTriageFunnelBullets([], []), []);
  });

  it('includes total candidates bullet', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ decision: 'keep' }),
          makeCandidate({ decision: 'drop' }),
        ],
      }),
    ];
    const bullets = buildTriageFunnelBullets(triage, [makeCall()]);
    assert.ok(bullets.some((b) => b.includes('2')));
  });

  it('includes query count when multiple queries', () => {
    const triage = [
      makeTriageResult({ query: 'q1', candidates: [makeCandidate()] }),
      makeTriageResult({ query: 'q2', candidates: [makeCandidate()] }),
    ];
    const bullets = buildTriageFunnelBullets(triage, [makeCall()]);
    assert.ok(bullets.some((b) => b.includes('2') && b.toLowerCase().includes('quer')));
  });

  it('includes keep/drop breakdown', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ decision: 'keep' }),
          makeCandidate({ decision: 'keep' }),
          makeCandidate({ decision: 'drop' }),
        ],
      }),
    ];
    const bullets = buildTriageFunnelBullets(triage, [makeCall()]);
    assert.ok(bullets.some((b) => b.includes('kept') || b.includes('keep')));
  });

  it('includes domain count when domains present', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ domain: 'a.com' }),
          makeCandidate({ domain: 'b.com' }),
          makeCandidate({ domain: 'c.com' }),
        ],
      }),
    ];
    const bullets = buildTriageFunnelBullets(triage, [makeCall()]);
    assert.ok(bullets.some((b) => b.includes('3') && b.toLowerCase().includes('domain')));
  });

  it('includes model info when calls have model', () => {
    const triage = [makeTriageResult({ candidates: [makeCandidate()] })];
    const calls = [makeCall({ model: 'gpt-4o-mini' })];
    const bullets = buildTriageFunnelBullets(triage, calls);
    assert.ok(bullets.some((b) => b.includes('gpt-4o-mini')));
  });
});

// ── computeTriageDedupeStats ──

describe('computeTriageDedupeStats', () => {
  it('returns zero stats for empty triage', () => {
    const result = computeTriageDedupeStats([]);
    assert.equal(result.totalCandidates, 0);
    assert.equal(result.uniqueUrls, 0);
    assert.equal(result.deduped, 0);
  });

  it('counts total candidates and unique URLs', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ url: 'https://a.com/1' }),
          makeCandidate({ url: 'https://a.com/2' }),
        ],
      }),
      makeTriageResult({
        candidates: [
          makeCandidate({ url: 'https://a.com/1' }),
          makeCandidate({ url: 'https://b.com/3' }),
        ],
      }),
    ];
    const result = computeTriageDedupeStats(triage);
    assert.equal(result.totalCandidates, 4);
    assert.equal(result.uniqueUrls, 3);
    assert.equal(result.deduped, 1);
  });

  it('reports zero deduped when all URLs are unique', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ url: 'https://a.com/1' }),
          makeCandidate({ url: 'https://b.com/2' }),
        ],
      }),
    ];
    const result = computeTriageDedupeStats(triage);
    assert.equal(result.totalCandidates, 2);
    assert.equal(result.uniqueUrls, 2);
    assert.equal(result.deduped, 0);
  });
});

// ── buildTriageDomainDecisionBreakdown ──

describe('buildTriageDomainDecisionBreakdown', () => {
  it('returns empty map for empty triage', () => {
    const result = buildTriageDomainDecisionBreakdown([]);
    assert.equal(result.size, 0);
  });

  it('counts keep/maybe/drop per domain across all queries', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ domain: 'a.com', decision: 'keep' }),
          makeCandidate({ domain: 'a.com', decision: 'drop' }),
          makeCandidate({ domain: 'b.com', decision: 'keep' }),
        ],
      }),
      makeTriageResult({
        candidates: [
          makeCandidate({ domain: 'a.com', decision: 'maybe' }),
          makeCandidate({ domain: 'b.com', decision: 'drop' }),
        ],
      }),
    ];
    const result = buildTriageDomainDecisionBreakdown(triage);
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
    const triage = [
      makeTriageResult({
        candidates: [makeCandidate({ domain: 'x.com', decision: 'skip' })],
      }),
    ];
    const result = buildTriageDomainDecisionBreakdown(triage);
    assert.equal(result.get('x.com').drop, 1);
  });
});
