import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchProfile,
  makeCategoryConfig,
  makeJob,
} from './helpers/phase02SearchProfileHarness.js';

describe('Phase 02 - Query Cap and Reject Log', () => {
  it('respects maxQueries cap and logs rejections', () => {
    const cap = 6;
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'click_latency', 'dpi', 'polling_rate'],
      maxQueries: cap
    });

    assert.ok(profile.queries.length <= cap, `queries capped at ${cap}`);
  });

  it('reject log entries have reason, stage, and query metadata', () => {
    const profile = buildSearchProfile({
      job: makeJob(),
      categoryConfig: makeCategoryConfig(),
      missingFields: ['weight', 'sensor', 'dpi', 'polling_rate', 'click_latency'],
      maxQueries: 4
    });

    for (const entry of profile.query_reject_log.slice(0, 5)) {
      assert.ok(typeof entry.reason === 'string' && entry.reason, 'reject has reason');
      assert.ok(typeof entry.stage === 'string', 'reject has stage');
    }
  });
});
