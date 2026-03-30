import {
  loadBrandRegistry, addBrand, addBrandsBulk,
  updateBrand, removeBrand, getBrandsForCategory, seedBrandsFromActiveFiltering,
  renameBrand, getBrandImpactAnalysis,
} from '../index.js';
import { upsertQueueProduct } from '../../../queue/queueState.js';

export function createBrandRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, readJsonBody, config, storage,
    resolveCategoryAlias, broadcastWs, getSpecDb,
    loadProductCatalog, appDb,
  } = options;

  return {
    jsonRes, readJsonBody, config, storage, appDb, loadBrandRegistry,
    addBrand, addBrandsBulk, updateBrand, removeBrand, getBrandsForCategory,
    seedBrandsFromActiveFiltering, renameBrand, getBrandImpactAnalysis,
    resolveCategoryAlias, upsertQueueProduct, broadcastWs, getSpecDb,
    loadProductCatalog,
  };
}
