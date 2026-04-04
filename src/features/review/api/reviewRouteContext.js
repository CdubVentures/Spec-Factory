import {
  buildReviewLayout, buildProductReviewPayload, buildReviewQueue,
  buildComponentReviewLayout, buildComponentReviewPayloads,
  buildEnumReviewPayloads, readLatestArtifacts,
  findProductsReferencingComponent, setOverrideFromCandidate,
  setManualOverride, applySharedLaneState, cascadeComponentChange,
  cascadeEnumChange,
} from '../../review-curation/index.js';
import {
  resolveGridFieldStateForMutation, resolveComponentMutationContext,
  resolveEnumMutationContext,
} from './mutationResolvers.js';
import { buildComponentIdentifier } from '../../../utils/componentIdentifier.js';
import { slugify } from '../../catalog/index.js';
import { runEnumConsistencyReview } from '../../indexing/index.js';

export function createReviewRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, readJsonBody, toInt, hasKnownValue, config, storage, OUTPUT_ROOT,
    HELPER_ROOT, path, fs, getSpecDb, getSpecDbReady,
    loadCategoryConfig, sessionCache, reviewLayoutByCategory,
    broadcastWs, specDbCache, invalidateFieldRulesCache, safeReadJson, spawn,
    syncPrimaryLaneAcceptFromItemSelection, resolveKeyReviewForLaneMutation,
    markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept, isMeaningfulValue,
    propagateSharedLaneDecision,
    normalizeLower,
    remapPendingComponentReviewItemsForNameChange,
    ensureGridKeyReviewState,
    patchCompiledComponentDb,
  } = options;

  return {
    jsonRes, readJsonBody, toInt, hasKnownValue, config, storage, OUTPUT_ROOT,
    HELPER_ROOT, path, fs, getSpecDb, getSpecDbReady, buildReviewLayout,
    buildProductReviewPayload, buildReviewQueue, buildComponentReviewLayout,
    buildComponentReviewPayloads, buildEnumReviewPayloads, loadCategoryConfig,
    readLatestArtifacts, sessionCache, reviewLayoutByCategory,
    broadcastWs, specDbCache, findProductsReferencingComponent,
    invalidateFieldRulesCache,
    safeReadJson, slugify, spawn, resolveGridFieldStateForMutation,
    setOverrideFromCandidate, setManualOverride,
    syncPrimaryLaneAcceptFromItemSelection, resolveKeyReviewForLaneMutation,
    markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept, isMeaningfulValue,
    propagateSharedLaneDecision,
    resolveComponentMutationContext, normalizeLower,
    buildComponentIdentifier, applySharedLaneState, cascadeComponentChange,
    remapPendingComponentReviewItemsForNameChange,
    resolveEnumMutationContext,
    cascadeEnumChange,
    runEnumConsistencyReview,
    ensureGridKeyReviewState,
    patchCompiledComponentDb,
  };
}
