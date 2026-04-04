// ── Review Routes ───────────────────────────────────────────────────
//
// Thin dispatcher that delegates to extracted handler modules.
// Field review routes → fieldReviewHandlers.js
// Component review routes → componentReviewHandlers.js
// Mutation routes → itemMutationRoutes.js,
//   componentMutationRoutes.js, enumMutationRoutes.js

import { handleReviewItemMutationRoute } from './itemMutationRoutes.js';
import { handleReviewComponentMutationRoute } from './componentMutationRoutes.js';
import { handleReviewEnumMutationRoute } from './enumMutationRoutes.js';
import { runEnumConsistencyReview as runEnumConsistencyReviewDefault } from '../../indexing/index.js';
import { isConsumerEnabled } from '../../../field-rules/consumerGate.js';
import {
  normalizeEnumToken,
  hasMeaningfulEnumValue,
  dedupeEnumValues,
  readEnumConsistencyFormatHint,
} from '../services/enumMutationService.js';
import { normalizeFieldKey } from '../domain/reviewNormalization.js';
import { handleFieldReviewRoute } from './fieldReviewHandlers.js';
import { handleComponentReviewRoute } from './componentReviewHandlers.js';

// Re-export for characterization tests and any external consumers
export {
  normalizeEnumToken,
  hasMeaningfulEnumValue,
  dedupeEnumValues,
  readEnumConsistencyFormatHint,
};

function resolveSessionFieldRule(session = null, fieldKey = '') {
  const mergedFields = session?.mergedFields;
  if (!mergedFields || typeof mergedFields !== 'object' || Array.isArray(mergedFields)) {
    return {};
  }
  const wanted = normalizeFieldKey(fieldKey);
  if (!wanted) return {};
  for (const [rawFieldKey, rule] of Object.entries(mergedFields)) {
    if (normalizeFieldKey(rawFieldKey) !== wanted) continue;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return {};
    return rule;
  }
  return {};
}

export function registerReviewRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    toInt,
    hasKnownValue,
    config,
    storage,
    OUTPUT_ROOT,
    HELPER_ROOT,
    path,
    fs,
    getSpecDb,
    getSpecDbReady,
    buildReviewLayout,
    buildProductReviewPayload,
    buildReviewQueue,
    buildComponentReviewLayout,
    buildComponentReviewPayloads,
    buildEnumReviewPayloads,
    loadCategoryConfig,
    readLatestArtifacts,
    sessionCache,
    reviewLayoutByCategory,
    broadcastWs,
    specDbCache,
    findProductsReferencingComponent,
    invalidateFieldRulesCache,
    safeReadJson,
    slugify,
    spawn,
    // Review mutation helpers
    resolveGridFieldStateForMutation,
    setOverrideFromCandidate,
    setManualOverride,
    syncPrimaryLaneAcceptFromItemSelection,
    resolveKeyReviewForLaneMutation,
    getPendingItemPrimaryCandidateIds,
    markPrimaryLaneReviewedInItemState,
    syncItemFieldStateFromPrimaryLaneAccept,
    isMeaningfulValue,
    propagateSharedLaneDecision,
    // Component mutation helpers
    syncSyntheticCandidatesFromComponentReview,
    resolveComponentMutationContext,
    candidateLooksReference,
    normalizeLower,
    buildComponentIdentifier,
    applySharedLaneState,
    cascadeComponentChange,
    loadQueueState,
    saveQueueState,
    remapPendingComponentReviewItemsForNameChange,
    getPendingComponentSharedCandidateIdsAsync,
    // Enum mutation helpers
    resolveEnumMutationContext,
    getPendingEnumSharedCandidateIds,
    cascadeEnumChange,
    runEnumConsistencyReview = runEnumConsistencyReviewDefault,
    // Candidate enrichment helpers
    annotateCandidatePrimaryReviews,
    ensureGridKeyReviewState,
    patchCompiledComponentDb,
  } = ctx;

  async function isReviewFieldPathEnabledForCategory({
    category,
    fieldKey,
    fieldPath,
  }) {
    if (!fieldKey || !fieldPath) return true;
    const session = await sessionCache.getSessionRules(category);
    const fieldRule = resolveSessionFieldRule(session, fieldKey);
    return isConsumerEnabled(fieldRule, fieldPath, 'review');
  }

  const fieldReviewContext = {
    jsonRes, readJsonBody, toInt, hasKnownValue, config, storage,
    getSpecDb, buildReviewLayout, buildProductReviewPayload, buildReviewQueue,
    sessionCache, annotateCandidatePrimaryReviews, slugify,
    broadcastWs, path, spawn,
  };

  const componentReviewContext = {
    jsonRes, readJsonBody, config, storage,
    getSpecDb, getSpecDbReady, sessionCache,
    buildComponentReviewLayout, buildComponentReviewPayloads, buildEnumReviewPayloads,
    loadCategoryConfig, findProductsReferencingComponent,
    safeReadJson,
    invalidateFieldRulesCache, path, fs,
    HELPER_ROOT, OUTPUT_ROOT,
    applySharedLaneState, cascadeEnumChange,
    specDbCache, broadcastWs,
    loadQueueState, saveQueueState,
    runEnumConsistencyReview,
  };

  return async function handleReviewRoutes(parts, params, method, req, res) {
    // Field review routes (layout, product, products, products-index, candidates, suggest)
    const fieldResult = await handleFieldReviewRoute({
      parts, params, method, req, res,
      context: fieldReviewContext,
    });
    if (fieldResult !== false) return fieldResult;

    // Item mutation routes (already extracted)
    const handledReviewItemMutation = await handleReviewItemMutationRoute({
      parts,
      method,
      req,
      res,
      context: {
        storage,
        config,
        readJsonBody,
        jsonRes,
        getSpecDb,
        resolveGridFieldStateForMutation,
        setOverrideFromCandidate,
        setManualOverride,
        syncPrimaryLaneAcceptFromItemSelection,
        resolveKeyReviewForLaneMutation,
        getPendingItemPrimaryCandidateIds,
        markPrimaryLaneReviewedInItemState,
        syncItemFieldStateFromPrimaryLaneAccept,
        isMeaningfulValue,
        propagateSharedLaneDecision,
        broadcastWs,
      },
    });
    if (handledReviewItemMutation) return handledReviewItemMutation;

    // Component review routes (layout, components, enums, enum-consistency, impact, review, batch)
    const componentResult = await handleComponentReviewRoute({
      parts, params, method, req, res,
      context: componentReviewContext,
    });
    if (componentResult !== false) return componentResult;

    // Component mutation routes (already extracted)
    const handledReviewComponentMutation = await handleReviewComponentMutationRoute({
      parts,
      method,
      req,
      res,
      context: {
        readJsonBody,
        jsonRes,
        getSpecDbReady,
        syncSyntheticCandidatesFromComponentReview,
        resolveComponentMutationContext,
        isMeaningfulValue,
        candidateLooksReference,
        normalizeLower,
        buildComponentIdentifier,
        applySharedLaneState,
        cascadeComponentChange,
        outputRoot: OUTPUT_ROOT,
        storage,
        loadQueueState,
        saveQueueState,
        remapPendingComponentReviewItemsForNameChange,
        specDbCache,
        broadcastWs,
        getPendingComponentSharedCandidateIdsAsync,
      },
    });
    if (handledReviewComponentMutation !== false) return handledReviewComponentMutation;

    // Enum mutation routes (already extracted)
    const handledReviewEnumMutation = await handleReviewEnumMutationRoute({
      parts,
      method,
      req,
      res,
      context: {
        readJsonBody,
        jsonRes,
        getSpecDbReady,
        syncSyntheticCandidatesFromComponentReview,
        resolveEnumMutationContext,
        isMeaningfulValue,
        normalizeLower,
        candidateLooksReference,
        applySharedLaneState,
        getPendingEnumSharedCandidateIds,
        specDbCache,
        storage,
        outputRoot: OUTPUT_ROOT,
        cascadeEnumChange,
        loadQueueState,
        saveQueueState,
        isReviewFieldPathEnabled: isReviewFieldPathEnabledForCategory,
        broadcastWs,
      },
    });
    if (handledReviewEnumMutation !== false) return handledReviewEnumMutation;

    return false;
  };
}
