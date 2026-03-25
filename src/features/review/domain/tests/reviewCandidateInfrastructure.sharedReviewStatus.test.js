import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCandidateSharedReviewStatus,
} from '../candidateInfrastructure.js';

test('normalizeCandidateSharedReviewStatus handles synthetic, review rows, and source tokens', () => {
  assert.equal(normalizeCandidateSharedReviewStatus({ is_synthetic_selected: true }), 'accepted');
  assert.equal(normalizeCandidateSharedReviewStatus({}, { ai_review_status: 'accepted' }), 'accepted');
  assert.equal(normalizeCandidateSharedReviewStatus({}, { ai_review_status: 'rejected' }), 'rejected');
  assert.equal(normalizeCandidateSharedReviewStatus({}, { ai_review_status: 'pending' }), 'pending');
  assert.equal(
    normalizeCandidateSharedReviewStatus({}, { ai_review_status: 'accepted', ai_reason: 'shared_accept' }),
    'pending',
  );
  assert.equal(normalizeCandidateSharedReviewStatus({ source_id: 'reference' }), 'accepted');
  assert.equal(normalizeCandidateSharedReviewStatus({ source_id: 'pipeline' }), 'pending');
});
