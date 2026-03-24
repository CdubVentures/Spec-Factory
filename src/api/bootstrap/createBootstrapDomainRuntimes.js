import fs from 'node:fs/promises';
import path from 'node:path';
import {
  resolveExplicitPositiveId,
  resolveGridFieldStateForMutation,
} from '../../features/review/api/mutationResolvers.js';
import { createReviewCandidateRuntime } from '../reviewCandidateRuntime.js';
import { createReviewGridStateRuntime } from '../reviewGridStateRuntime.js';
import { componentReviewPath } from '../../engine/curationSuggestions.js';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../../app/api/catalogHelpers.js';
import { loadQueueState } from '../../queue/queueState.js';
import { loadProductCatalog } from '../../features/catalog/index.js';
import {
  buildComponentReviewSyntheticCandidateId,
} from '../../utils/candidateIdentifier.js';
import { normalizePathToken } from '../helpers/valueNormalizers.js';
import { safeReadJson, listFiles } from '../helpers/fileHelpers.js';

export function createBootstrapDomainRuntimes({
  config, HELPER_ROOT, storage, getSpecDb, cleanVariant, catalogKey,
}) {
  const {
    ensureGridKeyReviewState,
    resolveKeyReviewForLaneMutation,
    markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept,
    syncPrimaryLaneAcceptFromItemSelection,
    purgeTestModeCategoryState,
    resetTestModeSharedReviewState,
    resetTestModeProductReviewState,
  } = createReviewGridStateRuntime({
    resolveExplicitPositiveId,
    resolveGridFieldStateForMutation,
  });

  const {
    normalizeLower,
    isMeaningfulValue,
    candidateLooksReference,
    annotateCandidatePrimaryReviews,
    getPendingItemPrimaryCandidateIds,
    getPendingComponentSharedCandidateIdsAsync,
    getPendingEnumSharedCandidateIds,
    syncSyntheticCandidatesFromComponentReview,
    remapPendingComponentReviewItemsForNameChange,
    propagateSharedLaneDecision,
  } = createReviewCandidateRuntime({
    componentReviewPath,
    safeReadJson,
    fs,
    getSpecDb,
    config,
    normalizePathToken,
    buildComponentReviewSyntheticCandidateId,
  });

  // ── Catalog builder ──
  const buildCatalog = createCatalogBuilder({
    config,
    storage,
    getSpecDb,
    loadQueueState,
    loadProductCatalog,
    cleanVariant,
    catalogKey,
    path,
  });

  const patchCompiledComponentDb = createCompiledComponentDbPatcher({
    helperRoot: HELPER_ROOT,
    listFiles,
    safeReadJson,
    fs,
    path,
  });

  return {
    // Review grid state
    ensureGridKeyReviewState, resolveKeyReviewForLaneMutation,
    markPrimaryLaneReviewedInItemState, syncItemFieldStateFromPrimaryLaneAccept,
    syncPrimaryLaneAcceptFromItemSelection,
    purgeTestModeCategoryState, resetTestModeSharedReviewState,
    resetTestModeProductReviewState,
    // Review candidate
    normalizeLower, isMeaningfulValue, candidateLooksReference,
    annotateCandidatePrimaryReviews, getPendingItemPrimaryCandidateIds,
    getPendingComponentSharedCandidateIdsAsync, getPendingEnumSharedCandidateIds,
    syncSyntheticCandidatesFromComponentReview,
    remapPendingComponentReviewItemsForNameChange, propagateSharedLaneDecision,
    // Catalog
    buildCatalog, patchCompiledComponentDb,
  };
}
