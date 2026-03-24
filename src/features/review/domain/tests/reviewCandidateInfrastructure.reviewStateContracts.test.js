import test from 'node:test';
import assert from 'node:assert/strict';

import {
  hasActionableCandidate,
  isReviewItemCandidateVisible,
  isSharedLanePending,
  normalizeCandidateSharedReviewStatus,
  shouldIncludeEnumValueEntry,
} from '../candidateInfrastructure.js';

test('isSharedLanePending returns expected states', () => {
  assert.equal(isSharedLanePending({ user_override_ai_shared: true }, true), false);
  assert.equal(isSharedLanePending({ ai_confirm_shared_status: 'confirmed' }), false);
  assert.equal(isSharedLanePending({ ai_confirm_shared_status: 'pending' }), true);
  assert.equal(isSharedLanePending({}, true), true);
  assert.equal(isSharedLanePending({}, false), false);
});

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

test('isReviewItemCandidateVisible hides dismissed, ignored, and rejected rows', () => {
  assert.equal(isReviewItemCandidateVisible({}), true);
  assert.equal(isReviewItemCandidateVisible({ status: 'confirmed' }), true);
  assert.equal(isReviewItemCandidateVisible({ status: 'dismissed' }), false);
  assert.equal(isReviewItemCandidateVisible({ status: 'ignored' }), false);
  assert.equal(isReviewItemCandidateVisible({ status: 'rejected' }), false);
});

test('hasActionableCandidate requires non-synthetic candidates with known values and ids', () => {
  assert.equal(hasActionableCandidate([]), false);
  assert.equal(hasActionableCandidate([{ candidate_id: 'c1', value: 'x' }]), true);
  assert.equal(hasActionableCandidate([{ candidate_id: 'c1', value: 'x', is_synthetic_selected: true }]), false);
  assert.equal(hasActionableCandidate([{ candidate_id: '', value: 'x' }]), false);
  assert.equal(hasActionableCandidate([{ candidate_id: 'c1', value: 'unknown' }]), false);
});

test('shouldIncludeEnumValueEntry filters unlinked pending pipeline entries', () => {
  assert.equal(shouldIncludeEnumValueEntry(null), false);
  assert.equal(shouldIncludeEnumValueEntry({ value: 'x' }), true);
  assert.equal(
    shouldIncludeEnumValueEntry(
      { source: 'pipeline', needs_review: true, candidates: [{ candidate_id: 'c', value: 'v' }], linked_products: [] },
      { requireLinkedPendingPipeline: true },
    ),
    false,
  );
  assert.equal(
    shouldIncludeEnumValueEntry(
      { source: 'pipeline', needs_review: true, candidates: [{ candidate_id: 'c', value: 'v' }], linked_products: ['p1'] },
      { requireLinkedPendingPipeline: true },
    ),
    true,
  );
});
