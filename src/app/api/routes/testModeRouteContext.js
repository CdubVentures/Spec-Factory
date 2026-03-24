import { buildTrafficLight } from '../../../features/indexing/validation/index.js';
import { deriveTrafficLightCounts } from '../../../api/helpers/llmHelpers.js';
import { readLatestArtifacts } from '../../../features/review-curation/index.js';
import {
  generateTestSourceResults, buildDeterministicSourceResults, buildSeedComponentDB,
  analyzeContract, buildTestProducts, buildValidationChecks,
  loadComponentIdentityPools,
} from '../../../testing/testDataProvider.js';
// WHY: testRunner.js removed during crawl pipeline rework (consensus pipeline deleted).
// Stub preserves API shape. Test-mode product runs will error until rebuilt.
const runTestProduct = async () => { throw new Error('test mode pipeline removed — use crawl pipeline'); };
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
