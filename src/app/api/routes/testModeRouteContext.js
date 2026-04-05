import { buildTrafficLight } from '../../../features/indexing/validation/index.js';
import { deriveTrafficLightCounts } from '../../../core/llm/llmRouteHelpers.js';
import { readLatestArtifacts } from '../../../features/review-curation/index.js';
import {
  generateTestSourceResults, buildDeterministicSourceResults, buildSeedComponentDB,
  analyzeContract, buildTestProducts, buildValidationChecks,
  loadComponentIdentityPools,
} from '../../../tests/testDataProvider.js';
import { runTestProduct } from '../../../tests/testRunner.js';
import { addBrand } from '../../../features/catalog/index.js';

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
    invalidateFieldRulesCache, sessionCache, appDb,
  } = options;

  return {
    jsonRes, readJsonBody, toInt, toUnitRatio, config, storage, HELPER_ROOT,
    OUTPUT_ROOT, getSpecDb, getSpecDbReady, fs, path, safeReadJson, safeStat,
    listFiles, resolveCategoryAlias, broadcastWs, buildTrafficLight,
    deriveTrafficLightCounts, readLatestArtifacts, analyzeContract,
    buildTestProducts, generateTestSourceResults, buildDeterministicSourceResults,
    buildSeedComponentDB, buildValidationChecks, loadComponentIdentityPools,
    runTestProduct, purgeTestModeCategoryState,
    resetTestModeSharedReviewState, resetTestModeProductReviewState,
    addBrand, invalidateFieldRulesCache,
    sessionCache, appDb,
  };
}
