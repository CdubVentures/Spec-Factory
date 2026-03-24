import test from 'node:test';
import { createReviewRouteContext } from '../reviewRouteContext.js';
import {
  assertRouteContextContract,
  assertRouteContextRejectsInvalidInput,
} from '../../../../shared/tests/helpers/routeContextContractHarness.js';

const FORWARDED_KEYS = [
  'jsonRes', 'readJsonBody', 'toInt', 'hasKnownValue', 'config', 'storage',
  'OUTPUT_ROOT', 'HELPER_ROOT', 'path', 'fs', 'getSpecDb', 'getSpecDbReady',
  'loadCategoryConfig', 'loadProductCatalog', 'sessionCache',
  'reviewLayoutByCategory', 'broadcastWs', 'specDbCache',
  'invalidateFieldRulesCache', 'safeReadJson', 'spawn',
  'syncPrimaryLaneAcceptFromItemSelection',
  'resolveKeyReviewForLaneMutation', 'getPendingItemPrimaryCandidateIds',
  'markPrimaryLaneReviewedInItemState', 'syncItemFieldStateFromPrimaryLaneAccept',
  'isMeaningfulValue', 'propagateSharedLaneDecision',
  'syncSyntheticCandidatesFromComponentReview', 'candidateLooksReference',
  'normalizeLower', 'remapPendingComponentReviewItemsForNameChange',
  'getPendingComponentSharedCandidateIdsAsync',
  'getPendingEnumSharedCandidateIds',
  'markEnumSuggestionStatusBound',
  'annotateCandidatePrimaryReviews', 'ensureGridKeyReviewState',
  'patchCompiledComponentDb',
];

const HELPER_KEYS = [
  'buildReviewLayout', 'buildProductReviewPayload', 'buildReviewQueue',
  'buildComponentReviewLayout', 'buildComponentReviewPayloads',
  'buildEnumReviewPayloads', 'readLatestArtifacts',
  'findProductsReferencingComponent', 'componentReviewPath',
  'runComponentReviewBatch', 'slugify', 'resolveGridFieldStateForMutation',
  'setOverrideFromCandidate', 'setManualOverride',
  'resolveComponentMutationContext', 'resolveEnumMutationContext',
  'buildComponentIdentifier', 'applySharedLaneState',
  'cascadeComponentChange', 'cascadeEnumChange',
  'loadQueueState', 'saveQueueState',
  'runEnumConsistencyReview',
];

test('createReviewRouteContext throws TypeError on non-object input', () => {
  assertRouteContextRejectsInvalidInput(createReviewRouteContext);
});

test('createReviewRouteContext forwards dependencies and exposes helper surface', () => {
  assertRouteContextContract({
    createContext: createReviewRouteContext,
    forwardedKeys: FORWARDED_KEYS,
    helperKeys: HELPER_KEYS,
  });
});
