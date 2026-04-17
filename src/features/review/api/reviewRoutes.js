// ── Review Routes ───────────────────────────────────────────────────
//
// Thin dispatcher that delegates to extracted handler modules.
// Field review routes → fieldReviewHandlers.js
// Component review routes → componentReviewHandlers.js
// Mutation routes → itemMutationRoutes.js,
//   componentMutationRoutes.js, enumMutationRoutes.js

import { handleReviewItemMutationRoute } from './itemMutationRoutes.js';
import { handleCandidateDeletionRoute } from './candidateDeletionRoutes.js';
import { handleReviewComponentMutationRoute } from './componentMutationRoutes.js';
import { handleReviewEnumMutationRoute } from './enumMutationRoutes.js';
import { isConsumerEnabled } from '../../../field-rules/consumerGate.js';
import {
  normalizeEnumToken,
  hasMeaningfulEnumValue,
  dedupeEnumValues,
} from '../services/enumMutationService.js';
import { normalizeFieldKey } from '../domain/reviewNormalization.js';
import { handleFieldReviewRoute } from './fieldReviewHandlers.js';
import { handleComponentReviewRoute } from './componentReviewHandlers.js';

// Re-export for characterization tests and any external consumers
export {
  normalizeEnumToken,
  hasMeaningfulEnumValue,
  dedupeEnumValues,
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
    buildComponentReviewLayout,
    buildComponentReviewPayloads,
    buildEnumReviewPayloads,
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
    // Component mutation helpers
    resolveComponentMutationContext,
    normalizeLower,
    isMeaningfulValue,
    buildComponentIdentifier,
    cascadeComponentChange,

    // Enum mutation helpers
    resolveEnumMutationContext,
    cascadeEnumChange,
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
    getSpecDb, buildReviewLayout, buildProductReviewPayload,
    sessionCache, slugify,
    broadcastWs, path, spawn,
  };

  const componentReviewContext = {
    jsonRes, readJsonBody, config, storage,
    getSpecDb, getSpecDbReady, sessionCache,
    buildComponentReviewLayout, buildComponentReviewPayloads, buildEnumReviewPayloads,
    findProductsReferencingComponent,
    safeReadJson,
    invalidateFieldRulesCache, path, fs,
    HELPER_ROOT, OUTPUT_ROOT,
    cascadeEnumChange,
    specDbCache, broadcastWs,
  };

  return async function handleReviewRoutes(parts, params, method, req, res) {
    // Field review routes (layout, product, products, products-index, candidates, suggest)
    const fieldResult = await handleFieldReviewRoute({
      parts, params, method, req, res,
      context: fieldReviewContext,
    });
    if (fieldResult !== false) return fieldResult;

    // Candidate deletion routes (DELETE single + DELETE all-for-field)
    const handledCandidateDeletion = await handleCandidateDeletionRoute({
      parts, method, req, res,
      context: {
        jsonRes, getSpecDb, broadcastWs, config,
        productRoot: storage?.productRoot || undefined,
      },
    });
    if (handledCandidateDeletion !== false) return handledCandidateDeletion;

    // Item mutation routes (already extracted)
    const handledReviewItemMutation = await handleReviewItemMutationRoute({
      parts,
      method,
      req,
      res,
      context: {
        readJsonBody,
        jsonRes,
        getSpecDb,
        resolveGridFieldStateForMutation,
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
        resolveComponentMutationContext,
        isMeaningfulValue,
        normalizeLower,
        buildComponentIdentifier,
        cascadeComponentChange,
        outputRoot: OUTPUT_ROOT,
        storage,
        specDbCache,
        broadcastWs,
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
        resolveEnumMutationContext,
        isMeaningfulValue,
        normalizeLower,
        specDbCache,
        storage,
        outputRoot: OUTPUT_ROOT,
        cascadeEnumChange,
        isReviewFieldPathEnabled: isReviewFieldPathEnabledForCategory,
        broadcastWs,
      },
    });
    if (handledReviewEnumMutation !== false) return handledReviewEnumMutation;

    return false;
  };
}
