import {
  buildReviewLayout, buildProductReviewPayload,
  buildComponentReviewLayout, buildComponentReviewPayloads,
  buildEnumReviewPayloads,
  findProductsReferencingComponent,
  cascadeComponentChange,
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
    sessionCache, reviewLayoutByCategory,
    broadcastWs, specDbCache, invalidateFieldRulesCache, safeReadJson, spawn,
    isMeaningfulValue,
    normalizeLower,
    patchCompiledComponentDb,
  } = options;

  return {
    jsonRes, readJsonBody, toInt, hasKnownValue, config, storage, OUTPUT_ROOT,
    HELPER_ROOT, path, fs, getSpecDb, getSpecDbReady, buildReviewLayout,
    buildProductReviewPayload, buildComponentReviewLayout,
    buildComponentReviewPayloads, buildEnumReviewPayloads,
    sessionCache, reviewLayoutByCategory,
    broadcastWs, specDbCache, findProductsReferencingComponent,
    invalidateFieldRulesCache,
    safeReadJson, slugify, spawn, resolveGridFieldStateForMutation,
    isMeaningfulValue,
    resolveComponentMutationContext, normalizeLower,
    buildComponentIdentifier, cascadeComponentChange,
    resolveEnumMutationContext,
    cascadeEnumChange,
    runEnumConsistencyReview,
    patchCompiledComponentDb,
  };
}
