import fs from 'node:fs/promises';
import path from 'node:path';
import {
  resolveExplicitPositiveId,
  resolveGridFieldStateForMutation,
} from '../../features/review/api/mutationResolvers.js';
import { createReviewCandidateRuntime } from '../reviewCandidateRuntime.js';
import { createReviewGridStateRuntime } from '../reviewGridStateRuntime.js';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../../app/api/catalogHelpers.js';
import { normalizePathToken } from '../helpers/valueNormalizers.js';
import { safeReadJson, listFiles } from '../helpers/fileHelpers.js';

export function createBootstrapDomainRuntimes({
  config, HELPER_ROOT, storage, getSpecDb, cleanVariant,
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
    getSpecDb,
    config,
    normalizePathToken,
  });

  // ── Catalog builder (SQL-first: reads from specDb products + queue tables) ──
  const buildCatalog = createCatalogBuilder({
    config,
    storage,
    getSpecDb,
    cleanVariant,
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
