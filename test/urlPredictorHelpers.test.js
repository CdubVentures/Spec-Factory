import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computePredictionDecisionCounts,
  computeTopPredictionDomains,
  computeUniquePredictionDomains,
  buildPredictionDecisionSegments,
  computeFieldCoverageMatrix,
  computeAveragePayoff,
  computeRiskFlagDistribution,
  buildPredictorFunnelBullets,
} from '../tools/gui-react/src/pages/runtime-ops/panels/urlPredictorHelpers.js';

function makePrediction(overrides = {}) {
  return {
    url: 'https://example.com/page',
    domain: 'example.com',
    predicted_payoff: 75,
    target_fields: ['sensor', 'weight'],
    risk_flags: [],
    decision: 'fetch',
    ...overrides,
  };
}

// ── computePredictionDecisionCounts ──

describe('computePredictionDecisionCounts', () => {
  it('returns zero counts for empty predictions', () => {
    const result = computePredictionDecisionCounts([]);
    assert.deepEqual(result, { fetch: 0, later: 0, skip: 0 });
  });

  it('counts fetch/later/skip decisions', () => {
    const predictions = [
      makePrediction({ decision: 'fetch' }),
      makePrediction({ decision: 'fetch' }),
      makePrediction({ decision: 'later' }),
      makePrediction({ decision: 'skip' }),
      makePrediction({ decision: 'skip' }),
      makePrediction({ decision: 'skip' }),
    ];
    const result = computePredictionDecisionCounts(predictions);
    assert.equal(result.fetch, 2);
    assert.equal(result.later, 1);
    assert.equal(result.skip, 3);
  });

  it('classifies unknown decisions as skip', () => {
    const predictions = [
      makePrediction({ decision: 'fetch' }),
      makePrediction({ decision: 'unknown' }),
      makePrediction({ decision: '' }),
    ];
    const result = computePredictionDecisionCounts(predictions);
    assert.equal(result.fetch, 1);
    assert.equal(result.skip, 2);
  });
});

// ── computeTopPredictionDomains ──

describe('computeTopPredictionDomains', () => {
  it('returns empty array for empty predictions', () => {
    assert.deepEqual(computeTopPredictionDomains([], 5), []);
  });

  it('counts and sorts domains by frequency', () => {
    const predictions = [
      makePrediction({ domain: 'a.com' }),
      makePrediction({ domain: 'b.com' }),
      makePrediction({ domain: 'a.com' }),
      makePrediction({ domain: 'a.com' }),
      makePrediction({ domain: 'b.com' }),
      makePrediction({ domain: 'c.com' }),
    ];
    const result = computeTopPredictionDomains(predictions, 5);
    assert.equal(result[0].domain, 'a.com');
    assert.equal(result[0].count, 3);
    assert.equal(result[1].domain, 'b.com');
    assert.equal(result[1].count, 2);
    assert.equal(result[2].domain, 'c.com');
    assert.equal(result[2].count, 1);
  });

  it('respects the limit parameter', () => {
    const predictions = [
      makePrediction({ domain: 'a.com' }),
      makePrediction({ domain: 'b.com' }),
      makePrediction({ domain: 'c.com' }),
      makePrediction({ domain: 'd.com' }),
    ];
    const result = computeTopPredictionDomains(predictions, 2);
    assert.equal(result.length, 2);
  });
});

// ── computeUniquePredictionDomains ──

describe('computeUniquePredictionDomains', () => {
  it('returns 0 for empty predictions', () => {
    assert.equal(computeUniquePredictionDomains([]), 0);
  });

  it('counts unique domains', () => {
    const predictions = [
      makePrediction({ domain: 'a.com' }),
      makePrediction({ domain: 'b.com' }),
      makePrediction({ domain: 'a.com' }),
    ];
    assert.equal(computeUniquePredictionDomains(predictions), 2);
  });
});

// ── buildPredictionDecisionSegments ──

describe('buildPredictionDecisionSegments', () => {
  it('returns segments with correct labels and colors', () => {
    const counts = { fetch: 5, later: 2, skip: 3 };
    const segments = buildPredictionDecisionSegments(counts);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].label, 'Fetch');
    assert.equal(segments[0].value, 5);
    assert.ok(segments[0].color.includes('sf-metric-fill-success'));
    assert.equal(segments[1].label, 'Later');
    assert.equal(segments[1].value, 2);
    assert.ok(segments[1].color.includes('sf-metric-fill-warning'));
    assert.equal(segments[2].label, 'Skip');
    assert.equal(segments[2].value, 3);
    assert.ok(segments[2].color.includes('sf-metric-fill-danger'));
  });

  it('returns segments with zero values when all counts are zero', () => {
    const counts = { fetch: 0, later: 0, skip: 0 };
    const segments = buildPredictionDecisionSegments(counts);
    assert.equal(segments.length, 3);
    assert.equal(segments[0].value, 0);
    assert.equal(segments[1].value, 0);
    assert.equal(segments[2].value, 0);
  });
});

// ── computeFieldCoverageMatrix ──

describe('computeFieldCoverageMatrix', () => {
  it('returns empty result for empty predictions', () => {
    const result = computeFieldCoverageMatrix([]);
    assert.deepEqual(result.fields, []);
    assert.deepEqual(result.rows, []);
  });

  it('builds field list from all target_fields across predictions', () => {
    const predictions = [
      makePrediction({ target_fields: ['sensor', 'weight'] }),
      makePrediction({ target_fields: ['dpi', 'sensor'] }),
    ];
    const result = computeFieldCoverageMatrix(predictions);
    assert.ok(result.fields.includes('sensor'));
    assert.ok(result.fields.includes('weight'));
    assert.ok(result.fields.includes('dpi'));
    assert.equal(result.fields.length, 3);
  });

  it('returns intensity based on predicted_payoff when field is targeted', () => {
    const predictions = [
      makePrediction({ url: 'https://a.com/1', target_fields: ['sensor'], predicted_payoff: 80 }),
    ];
    const result = computeFieldCoverageMatrix(predictions);
    const row = result.rows[0];
    assert.equal(row.url, 'https://a.com/1');
    assert.equal(row.cells.sensor, 0.8);
  });

  it('returns 0 intensity when field is not targeted', () => {
    const predictions = [
      makePrediction({ url: 'https://a.com/1', target_fields: ['sensor'], predicted_payoff: 80 }),
    ];
    const result = computeFieldCoverageMatrix(predictions);
    const row = result.rows[0];
    const nonTargetField = result.fields.find((f) => f !== 'sensor');
    if (nonTargetField) {
      assert.equal(row.cells[nonTargetField], 0);
    }
  });

  it('caps output to 20 rows', () => {
    const predictions = Array.from({ length: 25 }, (_, i) =>
      makePrediction({ url: `https://example.com/${i}`, target_fields: ['sensor'] }),
    );
    const result = computeFieldCoverageMatrix(predictions);
    assert.equal(result.rows.length, 20);
  });
});

// ── computeAveragePayoff ──

describe('computeAveragePayoff', () => {
  it('returns 0 for empty predictions', () => {
    assert.equal(computeAveragePayoff([]), 0);
  });

  it('computes mean payoff', () => {
    const predictions = [
      makePrediction({ predicted_payoff: 60 }),
      makePrediction({ predicted_payoff: 80 }),
    ];
    assert.equal(computeAveragePayoff(predictions), 70);
  });

  it('rounds to nearest integer', () => {
    const predictions = [
      makePrediction({ predicted_payoff: 33 }),
      makePrediction({ predicted_payoff: 34 }),
    ];
    assert.equal(computeAveragePayoff(predictions), 34);
  });
});

// ── computeRiskFlagDistribution ──

describe('computeRiskFlagDistribution', () => {
  it('returns empty object for empty predictions', () => {
    assert.deepEqual(computeRiskFlagDistribution([]), {});
  });

  it('returns empty object when no predictions have risk flags', () => {
    const predictions = [
      makePrediction({ risk_flags: [] }),
      makePrediction({ risk_flags: [] }),
    ];
    assert.deepEqual(computeRiskFlagDistribution(predictions), {});
  });

  it('counts flag occurrences across predictions', () => {
    const predictions = [
      makePrediction({ risk_flags: ['low_trust', 'slow'] }),
      makePrediction({ risk_flags: ['low_trust'] }),
      makePrediction({ risk_flags: ['pdf_only'] }),
    ];
    const result = computeRiskFlagDistribution(predictions);
    assert.equal(result.low_trust, 2);
    assert.equal(result.slow, 1);
    assert.equal(result.pdf_only, 1);
  });
});

// ── buildPredictorFunnelBullets ──

describe('buildPredictorFunnelBullets', () => {
  it('returns empty array for empty predictions', () => {
    assert.deepEqual(buildPredictorFunnelBullets([], 0), []);
  });

  it('includes total predictions bullet', () => {
    const predictions = [
      makePrediction({ decision: 'fetch' }),
      makePrediction({ decision: 'skip' }),
    ];
    const bullets = buildPredictorFunnelBullets(predictions, 10);
    assert.ok(bullets.some((b) => b.includes('2')));
  });

  it('includes fetch count when fetches exist', () => {
    const predictions = [
      makePrediction({ decision: 'fetch' }),
      makePrediction({ decision: 'fetch' }),
      makePrediction({ decision: 'skip' }),
    ];
    const bullets = buildPredictorFunnelBullets(predictions, 5);
    assert.ok(bullets.some((b) => b.toLowerCase().includes('fetch')));
  });

  it('includes budget information when budget > 0', () => {
    const predictions = [makePrediction({ decision: 'fetch' })];
    const bullets = buildPredictorFunnelBullets(predictions, 8);
    assert.ok(bullets.some((b) => b.toLowerCase().includes('budget') || b.includes('8')));
  });

  it('includes risk flag mention when flags present', () => {
    const predictions = [
      makePrediction({ risk_flags: ['low_trust'] }),
      makePrediction({ risk_flags: ['slow', 'low_trust'] }),
    ];
    const bullets = buildPredictorFunnelBullets(predictions, 5);
    assert.ok(bullets.some((b) => b.toLowerCase().includes('risk')));
  });

  it('includes domain count when multiple domains present', () => {
    const predictions = [
      makePrediction({ domain: 'a.com' }),
      makePrediction({ domain: 'b.com' }),
      makePrediction({ domain: 'c.com' }),
    ];
    const bullets = buildPredictorFunnelBullets(predictions, 5);
    assert.ok(bullets.some((b) => b.includes('3') && b.toLowerCase().includes('domain')));
  });
});
