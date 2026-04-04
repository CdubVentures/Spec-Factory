import {
  loadBrandRegistry, addBrand, addBrandsBulk,
  updateBrand, removeBrand, getBrandsForCategory, seedBrandsFromActiveFiltering,
  renameBrand, getBrandImpactAnalysis, writeBackBrandRegistry,
} from '../index.js';

export function createBrandRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, readJsonBody, config, storage,
    resolveCategoryAlias, broadcastWs, getSpecDb,
    appDb, brandRegistryPath,
  } = options;

  return {
    jsonRes, readJsonBody, config, storage, appDb, loadBrandRegistry,
    addBrand, addBrandsBulk, updateBrand, removeBrand, getBrandsForCategory,
    seedBrandsFromActiveFiltering, renameBrand, getBrandImpactAnalysis,
    resolveCategoryAlias, broadcastWs, getSpecDb,
    brandRegistryPath, writeBackBrandRegistry,
  };
}
