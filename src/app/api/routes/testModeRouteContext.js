import {
  generateTestSourceResults, buildSeedComponentDB,
  analyzeContract, buildTestProducts,
  loadComponentIdentityPools,
} from '../../../tests/testDataProvider.js';
import { runTestProduct } from '../../../tests/testRunner.js';
import { runFieldContractTests } from '../../../tests/fieldContractTestRunner.js';
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
    invalidateFieldRulesCache, sessionCache, appDb, logger,
  } = options;

  return {
    jsonRes, readJsonBody, toInt, toUnitRatio, config, storage, HELPER_ROOT,
    OUTPUT_ROOT, getSpecDb, getSpecDbReady, fs, path, safeReadJson, safeStat,
    listFiles, resolveCategoryAlias, broadcastWs, analyzeContract,
    buildTestProducts, generateTestSourceResults,
    buildSeedComponentDB, loadComponentIdentityPools, runFieldContractTests,
    runTestProduct, purgeTestModeCategoryState,
    resetTestModeSharedReviewState, resetTestModeProductReviewState,
    addBrand, invalidateFieldRulesCache,
    sessionCache, appDb, logger,
  };
}
