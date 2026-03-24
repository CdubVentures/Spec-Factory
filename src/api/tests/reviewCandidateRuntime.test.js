import test from 'node:test';
import assert from 'node:assert/strict';

import { createReviewCandidateRuntime } from '../reviewCandidateRuntime.js';

test('candidateLooksReference recognizes reference and component-db candidates', () => {
  const runtime = createReviewCandidateRuntime({
    componentReviewPath: () => 'component_review.json',
    safeReadJson: async () => ({}),
    fs: { writeFile: async () => {} },
    getSpecDb: () => null,
    config: {},
    normalizePathToken: (value) => String(value || '').trim(),
    buildComponentReviewSyntheticCandidateId: ({ productId, fieldKey, reviewId, value }) => (
      `${productId}::${fieldKey}::${reviewId || 'pending'}::${value}`
    ),
  });

  assert.equal(runtime.candidateLooksReference('ref_sensor_1'), true);
  assert.equal(runtime.candidateLooksReference('cand-1', 'component_db'), true);
  assert.equal(runtime.candidateLooksReference('cand-2', 'pipeline'), false);
});

test('annotateCandidatePrimaryReviews marks accepted and pending candidates from review rows', () => {
  const runtime = createReviewCandidateRuntime({
    componentReviewPath: () => 'component_review.json',
    safeReadJson: async () => ({}),
    fs: { writeFile: async () => {} },
    getSpecDb: () => null,
    config: {},
    normalizePathToken: (value) => String(value || '').trim(),
    buildComponentReviewSyntheticCandidateId: ({ productId, fieldKey, reviewId, value }) => (
      `${productId}::${fieldKey}::${reviewId || 'pending'}::${value}`
    ),
  });
  const candidates = [
    { candidate_id: 'cand-1', value: 'PAW3395' },
    { candidate_id: 'cand-2', value: 'HERO 25K' },
  ];

  runtime.annotateCandidatePrimaryReviews(candidates, [
    { candidate_id: 'cand-1', human_accepted: 1, ai_review_status: 'accepted' },
  ]);

  assert.deepEqual(candidates, [
    {
      candidate_id: 'cand-1',
      value: 'PAW3395',
      primary_review_status: 'accepted',
      human_accepted: true,
    },
    {
      candidate_id: 'cand-2',
      value: 'HERO 25K',
      primary_review_status: 'pending',
      human_accepted: false,
    },
  ]);
});

test('getPendingItemPrimaryCandidateIds excludes resolved reviews and empty values', () => {
  const runtime = createReviewCandidateRuntime({
    componentReviewPath: () => 'component_review.json',
    safeReadJson: async () => ({}),
    fs: { writeFile: async () => {} },
    getSpecDb: () => null,
    config: {},
    normalizePathToken: (value) => String(value || '').trim(),
    buildComponentReviewSyntheticCandidateId: ({ productId, fieldKey, reviewId, value }) => (
      `${productId}::${fieldKey}::${reviewId || 'pending'}::${value}`
    ),
  });

  const result = runtime.getPendingItemPrimaryCandidateIds({
    getCandidatesForProduct: () => ({
      sensor: [
        { candidate_id: 'cand-1', value: 'PAW3395' },
        { candidate_id: 'cand-2', value: '' },
        { candidate_id: 'cand-3', value: 'HERO 25K' },
      ],
    }),
    getReviewsForContext: () => [
      { candidate_id: 'cand-1', human_accepted: 1 },
      { candidate_id: 'cand-3', ai_review_status: 'rejected' },
    ],
  }, {
    productId: 'mouse-1',
    fieldKey: 'sensor',
    itemFieldStateId: 19,
  });

  assert.deepEqual(result, []);
});
