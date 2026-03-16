import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHypothesisFollowupState } from '../src/features/indexing/orchestration/index.js';

test('resolveHypothesisFollowupState returns follow-up rounds and seeded URL set from phase result', () => {
  const seededUrls = new Set(['https://example.com/a']);
  const result = resolveHypothesisFollowupState({
    followupResult: {
      hypothesisFollowupRoundsExecuted: 2,
      hypothesisFollowupSeededUrls: seededUrls,
    },
  });

  assert.equal(result.hypothesisFollowupRoundsExecuted, 2);
  assert.equal(result.hypothesisFollowupSeededUrls, seededUrls);
});

test('resolveHypothesisFollowupState preserves undefined values when phase result fields are missing', () => {
  const result = resolveHypothesisFollowupState({
    followupResult: {},
  });

  assert.equal(result.hypothesisFollowupRoundsExecuted, undefined);
  assert.equal(result.hypothesisFollowupSeededUrls, undefined);
});
