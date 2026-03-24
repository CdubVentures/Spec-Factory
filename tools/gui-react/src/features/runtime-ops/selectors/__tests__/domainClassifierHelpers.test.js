import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeSafetyClassCounts,
  computeRoleCounts,
  computeTopProblematicDomains,
  computeUniqueDomains,
  buildSafetyClassSegments,
  buildDomainFunnelBullets,
  computeAvgBudgetScore,
  computeCooldownSummary,
} from '../domainClassifierHelpers.js';

function makeDomain(overrides = {}) {
  return {
    domain: 'example.com',
    role: 'manufacturer',
    safety_class: 'safe',
    budget_score: 80,
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

// ── computeAvgBudgetScore ──

describe('computeAvgBudgetScore', () => {
  it('returns 0 for empty array', () => {
    assert.equal(computeAvgBudgetScore([]), 0);
  });

  it('computes rounded average of budget scores', () => {
    const health = [
      makeDomain({ budget_score: 80 }),
      makeDomain({ budget_score: 60 }),
      makeDomain({ budget_score: 70 }),
    ];
    assert.equal(computeAvgBudgetScore(health), 70);
  });

  it('rounds to nearest integer', () => {
    const health = [
      makeDomain({ budget_score: 33 }),
      makeDomain({ budget_score: 34 }),
    ];
    assert.equal(computeAvgBudgetScore(health), 34);
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
