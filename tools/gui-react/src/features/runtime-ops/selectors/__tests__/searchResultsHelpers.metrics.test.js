import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDecisionCounts,
  computeTopDomains,
  computeUniqueUrls,
  computeFilteredCount,
  makeResult,
  makeDetail,
} from './helpers/searchResultsHelpersHarness.js';

describe('computeDecisionCounts', () => {
  it('returns zero counts for empty details', () => {
    const result = computeDecisionCounts([]);
    assert.deepEqual(result, { keep: 0, maybe: 0, drop: 0, other: 0 });
  });

  it('counts keep/maybe/drop decisions across multiple detail groups', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ decision: 'keep' }),
          makeResult({ decision: 'drop' }),
          makeResult({ decision: 'maybe' }),
        ],
      }),
      makeDetail({
        results: [
          makeResult({ decision: 'keep' }),
          makeResult({ decision: 'keep' }),
        ],
      }),
    ];
    const result = computeDecisionCounts(details);
    assert.equal(result.keep, 3);
    assert.equal(result.maybe, 1);
    assert.equal(result.drop, 1);
    assert.equal(result.other, 0);
  });

  it('classifies unknown decisions as other', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ decision: 'keep' }),
          makeResult({ decision: 'skip' }),
          makeResult({ decision: '' }),
        ],
      }),
    ];
    const result = computeDecisionCounts(details);
    assert.equal(result.keep, 1);
    assert.equal(result.other, 2);
  });
});

// ── computeTopDomains ──

describe('computeTopDomains', () => {
  it('returns empty array for empty details', () => {
    assert.deepEqual(computeTopDomains([], 5), []);
  });

  it('counts and sorts domains by frequency', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'b.com' }),
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'b.com' }),
          makeResult({ domain: 'c.com' }),
        ],
      }),
    ];
    const result = computeTopDomains(details, 5);
    assert.equal(result[0].domain, 'a.com');
    assert.equal(result[0].count, 3);
    assert.equal(result[1].domain, 'b.com');
    assert.equal(result[1].count, 2);
    assert.equal(result[2].domain, 'c.com');
    assert.equal(result[2].count, 1);
  });

  it('respects the limit parameter', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ domain: 'a.com' }),
          makeResult({ domain: 'b.com' }),
          makeResult({ domain: 'c.com' }),
          makeResult({ domain: 'd.com' }),
        ],
      }),
    ];
    const result = computeTopDomains(details, 2);
    assert.equal(result.length, 2);
  });

  it('aggregates across multiple detail groups', () => {
    const details = [
      makeDetail({ results: [makeResult({ domain: 'x.com' })] }),
      makeDetail({ results: [makeResult({ domain: 'x.com' }), makeResult({ domain: 'y.com' })] }),
    ];
    const result = computeTopDomains(details, 5);
    assert.equal(result[0].domain, 'x.com');
    assert.equal(result[0].count, 2);
  });
});

// ── computeUniqueUrls ──

describe('computeUniqueUrls', () => {
  it('returns 0 for empty details', () => {
    assert.equal(computeUniqueUrls([]), 0);
  });

  it('counts unique URLs across detail groups', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ url: 'https://a.com/1' }),
          makeResult({ url: 'https://a.com/2' }),
        ],
      }),
      makeDetail({
        results: [
          makeResult({ url: 'https://a.com/1' }),
          makeResult({ url: 'https://b.com/3' }),
        ],
      }),
    ];
    assert.equal(computeUniqueUrls(details), 3);
  });
});

// ── computeFilteredCount ──

describe('computeFilteredCount', () => {
  it('returns 0 for empty details', () => {
    assert.equal(computeFilteredCount([]), 0);
  });

  it('counts results with drop or skip decisions', () => {
    const details = [
      makeDetail({
        results: [
          makeResult({ decision: 'keep' }),
          makeResult({ decision: 'drop' }),
          makeResult({ decision: 'skip' }),
          makeResult({ decision: 'maybe' }),
        ],
      }),
    ];
    assert.equal(computeFilteredCount(details), 2);
  });
});

// ── buildFunnelBullets ──
