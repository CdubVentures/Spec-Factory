import fs from 'node:fs/promises';
import path from 'node:path';
import {
  resolveExplicitPositiveId,
  resolveGridFieldStateForMutation,
} from '../../../features/review/api/mutationResolvers.js';
import { createReviewCandidateRuntime } from '../../../features/review/domain/reviewCandidateRuntime.js';
import { createReviewGridStateRuntime } from '../../../features/review/domain/reviewGridStateRuntime.js';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../catalogHelpers.js';
import { normalizePathToken } from '../../../shared/valueNormalizers.js';
import { safeReadJson, listFiles } from '../../../shared/fileHelpers.js';

export function createBootstrapDomainRuntimes({
  config, HELPER_ROOT, storage, getSpecDb, cleanVariant,
}) {
  const {
    ensureGridKeyReviewState,
    resolveKeyReviewForLaneMutation,
    markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept,
    syncPrimaryLaneAcceptFromItemSelection,
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
