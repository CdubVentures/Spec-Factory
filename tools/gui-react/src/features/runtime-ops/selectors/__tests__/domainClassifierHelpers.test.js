import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeSafetyClassCounts,
  computeRoleCounts,
  computeTopProblematicDomains,
  computeUniqueDomains,
  buildSafetyClassSegments,
  buildDomainFunnelBullets,
  computeCooldownSummary,
  groupKeptUrlsByDomain,
  computeUrlSafetyBreakdown,
} from '../domainClassifierHelpers.js';

function makeDomain(overrides = {}) {
  return {
    domain: 'example.com',
    role: 'manufacturer',
    safety_class: 'safe',
    cooldown_remaining: 0,
    success_rate: 0.95,
    avg_latency_ms: 250,
    notes: '',
    ...overrides,
  };
}

function makeCall(overrides = {}) {
  return {
    status: 'finished',
    reason: 'domain_classification',
    model: 'gpt-4o-mini',
    provider: 'openai',
    tokens: { input: 400, output: 150 },
    duration_ms: 900,
    prompt_preview: null,
    response_preview: null,
    error: null,
    ...overrides,
  };
}

// ── computeSafetyClassCounts ──

describe('computeSafetyClassCounts', () => {
  it('returns zero counts for empty array', () => {
    const result = computeSafetyClassCounts([]);
    assert.deepEqual(result, { safe: 0, caution: 0, blocked: 0 });
  });

  it('counts safe/caution/blocked domains', () => {
    const health = [
      makeDomain({ safety_class: 'safe' }),
      makeDomain({ safety_class: 'safe' }),
      makeDomain({ safety_class: 'caution' }),
      makeDomain({ safety_class: 'blocked' }),
    ];
    const result = computeSafetyClassCounts(health);
    assert.equal(result.safe, 2);
    assert.equal(result.caution, 1);
    assert.equal(result.blocked, 1);
  });

  it('classifies unsafe as blocked', () => {
    const health = [makeDomain({ safety_class: 'unsafe' })];
    const result = computeSafetyClassCounts(health);
    assert.equal(result.blocked, 1);
  });

  it('classifies unknown safety classes as caution', () => {
    const health = [makeDomain({ safety_class: 'unknown' })];
    const result = computeSafetyClassCounts(health);
    assert.equal(result.caution, 1);
  });
});

// ── computeRoleCounts ──

describe('computeRoleCounts', () => {
  it('returns zero counts for empty array', () => {
    const result = computeRoleCounts([]);
    assert.deepEqual(result, { manufacturer: 0, review: 0, retail: 0, database: 0, unknown: 0 });
  });

  it('counts each role', () => {
    const health = [
      makeDomain({ role: 'manufacturer' }),
      makeDomain({ role: 'manufacturer' }),
      makeDomain({ role: 'review' }),
      makeDomain({ role: 'retail' }),
      makeDomain({ role: 'database' }),
    ];
    const result = computeRoleCounts(health);
    assert.equal(result.manufacturer, 2);
    assert.equal(result.review, 1);
    assert.equal(result.retail, 1);
    assert.equal(result.database, 1);
    assert.equal(result.unknown, 0);
  });

  it('classifies lab_review as review', () => {
    const health = [makeDomain({ role: 'lab_review' })];
    const result = computeRoleCounts(health);
    assert.equal(result.review, 1);
  });

  it('classifies empty or unrecognized roles as unknown', () => {
    const health = [
      makeDomain({ role: '' }),
      makeDomain({ role: 'something_else' }),
    ];
    const result = computeRoleCounts(health);
    assert.equal(result.unknown, 2);
  });
});

// ── computeTopProblematicDomains ──

describe('computeTopProblematicDomains', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(computeTopProblematicDomains([], 5), []);
  });

  it('sorts by worst success rate ascending', () => {
    const health = [
      makeDomain({ domain: 'good.com', success_rate: 0.9, safety_class: 'safe', cooldown_remaining: 0 }),
      makeDomain({ domain: 'bad.com', success_rate: 0.3, safety_class: 'safe', cooldown_remaining: 0 }),
      makeDomain({ domain: 'mid.com', success_rate: 0.6, safety_class: 'safe', cooldown_remaining: 0 }),
    ];
    const result = computeTopProblematicDomains(health, 5);
    assert.equal(result[0].domain, 'bad.com');
    assert.equal(result[1].domain, 'mid.com');
  });

  it('prioritizes blocked/cooldown domains', () => {
    const health = [
      makeDomain({ domain: 'ok.com', success_rate: 0.5, safety_class: 'safe', cooldown_remaining: 0 }),
      makeDomain({ domain: 'blocked.com', success_rate: 0.8, safety_class: 'blocked', cooldown_remaining: 0 }),
      makeDomain({ domain: 'cooling.com', success_rate: 0.9, safety_class: 'safe', cooldown_remaining: 300 }),
    ];
    const result = computeTopProblematicDomains(health, 5);
    assert.equal(result[0].domain, 'blocked.com');
    assert.equal(result[1].domain, 'cooling.com');
  });

  it('respects the limit parameter', () => {
    const health = [
      makeDomain({ domain: 'a.com', success_rate: 0.1 }),
      makeDomain({ domain: 'b.com', success_rate: 0.2 }),
      makeDomain({ domain: 'c.com', success_rate: 0.3 }),
    ];
    const result = computeTopProblematicDomains(health, 2);
    assert.equal(result.length, 2);
  });
});

// ── computeUniqueDomains ──

describe('computeUniqueDomains', () => {
  it('returns 0 for empty array', () => {
    assert.equal(computeUniqueDomains([]), 0);
  });

  it('counts unique domain strings', () => {
    const health = [
      makeDomain({ domain: 'a.com' }),
      makeDomain({ domain: 'b.com' }),
      makeDomain({ domain: 'a.com' }),
    ];
    assert.equal(computeUniqueDomains(health), 2);
  });
});

// ── buildSafetyClassSegments ──

describe('buildSafetyClassSegments', () => {
  it('returns segments with correct labels and colors', () => {
    const counts = { safe: 5, caution: 2, blocked: 1 };
    const segments = buildSafetyClassSegments(counts);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].label, 'Safe');
    assert.equal(segments[0].value, 5);
    assert.ok(segments[0].color.includes('sf-metric-fill-success'));
    assert.equal(segments[1].label, 'Caution');
    assert.equal(segments[1].value, 2);
    assert.ok(segments[1].color.includes('sf-metric-fill-warning'));
    assert.equal(segments[2].label, 'Blocked');
    assert.equal(segments[2].value, 1);
    assert.ok(segments[2].color.includes('sf-metric-fill-danger'));
  });

  it('returns segments with zero values', () => {
    const counts = { safe: 0, caution: 0, blocked: 0 };
    const segments = buildSafetyClassSegments(counts);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].value, 0);
    assert.equal(segments[1].value, 0);
    assert.equal(segments[2].value, 0);
  });
});

// ── buildDomainFunnelBullets ──

describe('buildDomainFunnelBullets', () => {
  it('returns empty array for empty health and no calls', () => {
    assert.deepEqual(buildDomainFunnelBullets([], []), []);
  });

  it('includes total domains bullet', () => {
    const health = [
      makeDomain({ domain: 'a.com' }),
      makeDomain({ domain: 'b.com' }),
    ];
    const bullets = buildDomainFunnelBullets(health, [makeCall()]);
    assert.ok(bullets.some((b) => b.includes('2')));
  });

  it('includes safety class breakdown', () => {
    const health = [
      makeDomain({ safety_class: 'safe' }),
      makeDomain({ safety_class: 'blocked' }),
    ];
    const bullets = buildDomainFunnelBullets(health, [makeCall()]);
    assert.ok(bullets.some((b) => b.toLowerCase().includes('safe') || b.toLowerCase().includes('blocked')));
  });

  it('includes model info when calls have model', () => {
    const health = [makeDomain()];
    const calls = [makeCall({ model: 'gpt-4o-mini' })];
    const bullets = buildDomainFunnelBullets(health, calls);
    assert.ok(bullets.some((b) => b.includes('gpt-4o-mini')));
  });

  it('includes cooldown count when domains in cooldown', () => {
    const health = [
      makeDomain({ cooldown_remaining: 120 }),
      makeDomain({ cooldown_remaining: 0 }),
    ];
    const bullets = buildDomainFunnelBullets(health, []);
    assert.ok(bullets.some((b) => b.toLowerCase().includes('cooldown')));
  });

  it('includes role distribution', () => {
    const health = [
      makeDomain({ role: 'manufacturer' }),
      makeDomain({ role: 'review' }),
      makeDomain({ role: 'retail' }),
    ];
    const bullets = buildDomainFunnelBullets(health, []);
    assert.ok(bullets.some((b) => b.toLowerCase().includes('role') || b.toLowerCase().includes('manufacturer')));
  });
});

// ── computeCooldownSummary ──

describe('computeCooldownSummary', () => {
  it('returns zeros for empty array', () => {
    const result = computeCooldownSummary([]);
    assert.equal(result.totalInCooldown, 0);
    assert.equal(result.maxRemainingSeconds, 0);
  });

  it('counts domains in cooldown and finds max remaining', () => {
    const health = [
      makeDomain({ cooldown_remaining: 120 }),
      makeDomain({ cooldown_remaining: 0 }),
      makeDomain({ cooldown_remaining: 300 }),
    ];
    const result = computeCooldownSummary(health);
    assert.equal(result.totalInCooldown, 2);
    assert.equal(result.maxRemainingSeconds, 300);
  });

  it('returns zero max when no domains in cooldown', () => {
    const health = [
      makeDomain({ cooldown_remaining: 0 }),
      makeDomain({ cooldown_remaining: 0 }),
    ];
    const result = computeCooldownSummary(health);
    assert.equal(result.totalInCooldown, 0);
    assert.equal(result.maxRemainingSeconds, 0);
  });
});

// ── Factories for URL-level helpers ──

function makeCandidate(overrides = {}) {
  return {
    url: 'https://example.com/page',
    title: 'Example Page',
    domain: 'example.com',
    snippet: 'A snippet',
    score: 0.8,
    decision: 'keep',
    rationale: 'llm_selected',
    role: 'manufacturer',
    identity_prelim: 'exact',
    host_trust_class: 'official',
    triage_disposition: 'fetch_high',
    doc_kind_guess: 'product_page',
    approval_bucket: 'approved',
    score_components: { base_relevance: 0.8, tier_boost: 0, identity_match: 0, penalties: 0 },
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

// ── groupKeptUrlsByDomain ──

describe('groupKeptUrlsByDomain', () => {
  it('returns empty map for empty triage array', () => {
    const result = groupKeptUrlsByDomain([]);
    assert.equal(result.size, 0);
  });

  it('filters to only kept candidates', () => {
    const triage = [makeTriageResult({
      candidates: [
        makeCandidate({ url: 'https://razer.com/a', domain: 'razer.com', decision: 'keep' }),
        makeCandidate({ url: 'https://razer.com/b', domain: 'razer.com', decision: 'drop' }),
        makeCandidate({ url: 'https://razer.com/c', domain: 'razer.com', decision: 'hard_drop' }),
      ],
    })];
    const result = groupKeptUrlsByDomain(triage);
    assert.equal(result.get('razer.com').length, 1);
    assert.equal(result.get('razer.com')[0].url, 'https://razer.com/a');
  });

  it('groups by domain across multiple triage results', () => {
    const triage = [
      makeTriageResult({
        candidates: [
          makeCandidate({ url: 'https://razer.com/a', domain: 'razer.com', decision: 'keep' }),
          makeCandidate({ url: 'https://rtings.com/x', domain: 'rtings.com', decision: 'keep' }),
        ],
      }),
      makeTriageResult({
        candidates: [
          makeCandidate({ url: 'https://razer.com/b', domain: 'razer.com', decision: 'keep' }),
          makeCandidate({ url: 'https://amazon.com/z', domain: 'amazon.com', decision: 'keep' }),
        ],
      }),
    ];
    const result = groupKeptUrlsByDomain(triage);
    assert.equal(result.size, 3);
    assert.equal(result.get('razer.com').length, 2);
    assert.equal(result.get('rtings.com').length, 1);
    assert.equal(result.get('amazon.com').length, 1);
  });

  it('returns empty map when all candidates are dropped', () => {
    const triage = [makeTriageResult({
      candidates: [
        makeCandidate({ decision: 'drop' }),
        makeCandidate({ decision: 'hard_drop' }),
      ],
    })];
    const result = groupKeptUrlsByDomain(triage);
    assert.equal(result.size, 0);
  });

  it('merges same-domain candidates from different queries', () => {
    const triage = [
      makeTriageResult({ query: 'query 1', candidates: [
        makeCandidate({ url: 'https://rtings.com/a', domain: 'rtings.com', decision: 'keep' }),
      ]}),
      makeTriageResult({ query: 'query 2', candidates: [
        makeCandidate({ url: 'https://rtings.com/b', domain: 'rtings.com', decision: 'keep' }),
      ]}),
    ];
    const result = groupKeptUrlsByDomain(triage);
    assert.equal(result.size, 1);
    assert.equal(result.get('rtings.com').length, 2);
  });
});

// ── computeUrlSafetyBreakdown ──

describe('computeUrlSafetyBreakdown', () => {
  it('returns zeros for empty inputs', () => {
    const result = computeUrlSafetyBreakdown(new Map(), []);
    assert.deepEqual(result, { safeUrls: 0, cautionUrls: 0, blockedUrls: 0, totalKeptUrls: 0 });
  });

  it('counts URLs from safe and caution domains', () => {
    const urlsByDomain = new Map([
      ['razer.com', [makeCandidate(), makeCandidate(), makeCandidate(), makeCandidate()]],
      ['sketchy.com', [makeCandidate(), makeCandidate()]],
    ]);
    const health = [
      makeDomain({ domain: 'razer.com', safety_class: 'safe' }),
      makeDomain({ domain: 'sketchy.com', safety_class: 'caution' }),
    ];
    const result = computeUrlSafetyBreakdown(urlsByDomain, health);
    assert.equal(result.safeUrls, 4);
    assert.equal(result.cautionUrls, 2);
    assert.equal(result.blockedUrls, 0);
    assert.equal(result.totalKeptUrls, 6);
  });

  it('classifies URLs from unknown domains as caution', () => {
    const urlsByDomain = new Map([
      ['unknown-site.com', [makeCandidate(), makeCandidate()]],
    ]);
    const result = computeUrlSafetyBreakdown(urlsByDomain, []);
    assert.equal(result.cautionUrls, 2);
    assert.equal(result.totalKeptUrls, 2);
  });

  it('counts URLs from blocked domains', () => {
    const urlsByDomain = new Map([
      ['blocked.com', [makeCandidate(), makeCandidate(), makeCandidate()]],
    ]);
    const health = [makeDomain({ domain: 'blocked.com', safety_class: 'blocked' })];
    const result = computeUrlSafetyBreakdown(urlsByDomain, health);
    assert.equal(result.blockedUrls, 3);
    assert.equal(result.totalKeptUrls, 3);
  });

  it('handles mixed safe/caution/blocked domains', () => {
    const urlsByDomain = new Map([
      ['safe.com', [makeCandidate(), makeCandidate()]],
      ['caution.com', [makeCandidate()]],
      ['blocked.com', [makeCandidate(), makeCandidate(), makeCandidate()]],
    ]);
    const health = [
      makeDomain({ domain: 'safe.com', safety_class: 'safe' }),
      makeDomain({ domain: 'caution.com', safety_class: 'caution' }),
      makeDomain({ domain: 'blocked.com', safety_class: 'blocked' }),
    ];
    const result = computeUrlSafetyBreakdown(urlsByDomain, health);
    assert.equal(result.safeUrls, 2);
    assert.equal(result.cautionUrls, 1);
    assert.equal(result.blockedUrls, 3);
    assert.equal(result.totalKeptUrls, 6);
  });

  it('classifies unsafe as blocked (consistent with computeSafetyClassCounts)', () => {
    const urlsByDomain = new Map([
      ['bad.com', [makeCandidate()]],
    ]);
    const health = [makeDomain({ domain: 'bad.com', safety_class: 'unsafe' })];
    const result = computeUrlSafetyBreakdown(urlsByDomain, health);
    assert.equal(result.blockedUrls, 1);
  });
});
