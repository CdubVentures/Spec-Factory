import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isReviewItemCandidateVisible,
} from '../candidateInfrastructure.js';

test('isReviewItemCandidateVisible hides dismissed, ignored, and rejected rows', () => {
  assert.equal(isReviewItemCandidateVisible({}), true);
  assert.equal(isReviewItemCandidateVisible({ status: 'confirmed' }), true);
  assert.equal(isReviewItemCandidateVisible({ status: 'dismissed' }), false);
  assert.equal(isReviewItemCandidateVisible({ status: 'ignored' }), false);
  assert.equal(isReviewItemCandidateVisible({ status: 'rejected' }), false);
});
