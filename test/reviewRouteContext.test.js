import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewRouteContext } from '../src/features/review/api/reviewRouteContext.js';

const EXPECTED_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'hasKnownValue', 'config', 'storage',
  'OUTPUT_ROOT', 'HELPER_ROOT', 'path', 'fs', 'getSpecDb', 'getSpecDbReady',
  'buildReviewLayout', 'buildProductReviewPayload', 'buildReviewQueue',
  'buildComponentReviewLayout', 'buildComponentReviewPayloads',
  'buildEnumReviewPayloads', 'loadCategoryConfig', 'loadProductCatalog',
  'readLatestArtifacts', 'sessionCache', 'reviewLayoutByCategory', 'broadcastWs',
  'specDbCache', 'findProductsReferencingComponent', 'componentReviewPath',
  'runComponentReviewBatch', 'invalidateFieldRulesCache', 'safeReadJson', 'slugify',
  'spawn', 'resolveGridFieldStateForMutation', 'setOverrideFromCandidate',
  'setManualOverride', 'syncPrimaryLaneAcceptFromItemSelection',
  'resolveKeyReviewForLaneMutation', 'getPendingItemPrimaryCandidateIds',
  'markPrimaryLaneReviewedInItemState', 'syncItemFieldStateFromPrimaryLaneAccept',
  'isMeaningfulValue', 'propagateSharedLaneDecision',
  'syncSyntheticCandidatesFromComponentReview', 'resolveComponentMutationContext',
  'candidateLooksReference', 'normalizeLower', 'buildComponentIdentifier',
  'applySharedLaneState', 'cascadeComponentChange', 'loadQueueState',
  'saveQueueState', 'remapPendingComponentReviewItemsForNameChange',
  'getPendingComponentSharedCandidateIdsAsync', 'resolveEnumMutationContext',
  'getPendingEnumSharedCandidateIds', 'cascadeEnumChange',
  'markEnumSuggestionStatusBound', 'runEnumConsistencyReview',
  'annotateCandidatePrimaryReviews', 'ensureGridKeyReviewState',
  'patchCompiledComponentDb',
];

const CORE_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'hasKnownValue', 'config', 'storage',
  'OUTPUT_ROOT', 'HELPER_ROOT', 'path', 'fs', 'getSpecDb', 'getSpecDbReady',
  'loadCategoryConfig', 'loadProductCatalog', 'sessionCache',
  'reviewLayoutByCategory', 'broadcastWs', 'specDbCache',
  'invalidateFieldRulesCache', 'safeReadJson', 'spawn',
  'syncPrimaryLaneAcceptFromItemSelection', 'resolveKeyReviewForLaneMutation',
  'getPendingItemPrimaryCandidateIds', 'markPrimaryLaneReviewedInItemState',
  'syncItemFieldStateFromPrimaryLaneAccept', 'isMeaningfulValue',
  'propagateSharedLaneDecision', 'syncSyntheticCandidatesFromComponentReview',
  'candidateLooksReference', 'normalizeLower',
  'remapPendingComponentReviewItemsForNameChange',
  'getPendingComponentSharedCandidateIdsAsync', 'getPendingEnumSharedCandidateIds',
  'annotateCandidatePrimaryReviews', 'ensureGridKeyReviewState',
  'markEnumSuggestionStatusBound', 'patchCompiledComponentDb',
];

test('createReviewRouteContext throws TypeError on non-object input', () => {
  assert.throws(() => createReviewRouteContext(null), TypeError);
  assert.throws(() => createReviewRouteContext('str'), TypeError);
  assert.throws(() => createReviewRouteContext([1]), TypeError);
});

test('createReviewRouteContext returns exactly the expected keys', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = { _sentinel: k };
  options.extraProp = 'should not appear';

  const ctx = createReviewRouteContext(options);
  assert.deepEqual(Object.keys(ctx).sort(), [...EXPECTED_KEYS].sort());
});

test('createReviewRouteContext preserves identity references for core props', () => {
  const options = {};
  for (const k of CORE_KEYS) options[k] = { _sentinel: k };

  const ctx = createReviewRouteContext(options);
  for (const k of CORE_KEYS) {
    assert.equal(ctx[k], options[k], `${k} should be same reference`);
  }
});

test('createReviewRouteContext does not forward extra properties', () => {
  const options = {};
  for (const k of EXPECTED_KEYS) options[k] = () => {};
  options.extra = 'nope';
  const ctx = createReviewRouteContext(options);
  assert.equal(Object.hasOwn(ctx, 'extra'), false);
});
