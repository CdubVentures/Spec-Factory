import { buildTrafficLight } from '../../../features/indexing/validation/index.js';
import { deriveTrafficLightCounts } from '../../../api/helpers/llmHelpers.js';
import { readLatestArtifacts } from '../../../features/review-curation/index.js';
import {
  generateTestSourceResults, buildDeterministicSourceResults, buildSeedComponentDB,
  analyzeContract, buildTestProducts, buildValidationChecks,
  loadComponentIdentityPools,
} from '../../../testing/testDataProvider.js';
import { runTestProduct } from '../../../testing/testRunner.js';
import { runComponentReviewBatch } from '../../../pipeline/componentReviewBatch.js';
import { addBrand, loadBrandRegistry, saveBrandRegistry } from '../../../features/catalog/index.js';

export function createTestModeRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, readJsonBody, toInt, toUnitRatio, config, storage, HELPER_ROOT,
    OUTPUT_ROOT, getSpecDb, getSpecDbReady, fs, path, safeReadJson, safeStat,
    listFiles, resolveCategoryAlias, broadcastWs,
    purgeTestModeCategoryState, resetTestModeSharedReviewState,
    resetTestModeProductReviewState,
    invalidateFieldRulesCache, sessionCache,
  } = options;

  return {
    jsonRes, readJsonBody, toInt, toUnitRatio, config, storage, HELPER_ROOT,
    OUTPUT_ROOT, getSpecDb, getSpecDbReady, fs, path, safeReadJson, safeStat,
    listFiles, resolveCategoryAlias, broadcastWs, buildTrafficLight,
    deriveTrafficLightCounts, readLatestArtifacts, analyzeContract,
    buildTestProducts, generateTestSourceResults, buildDeterministicSourceResults,
    buildSeedComponentDB, buildValidationChecks, loadComponentIdentityPools,
    runTestProduct, runComponentReviewBatch, purgeTestModeCategoryState,
    resetTestModeSharedReviewState, resetTestModeProductReviewState,
    addBrand, loadBrandRegistry, saveBrandRegistry, invalidateFieldRulesCache,
    sessionCache,
  };
}
