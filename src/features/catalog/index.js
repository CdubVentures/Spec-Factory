export {
  addProduct,
  addProductsBulk,
  updateProduct,
  removeProduct,
  listProducts,
} from './products/productCatalog.js';
export {
  loadBrandRegistry,
  addBrand,
  addBrandsBulk,
  updateBrand,
  removeBrand,
  getBrandsForCategory,
  findBrandByAlias,
  seedBrandsFromActiveFiltering,
  seedBrandsFromCatalog,
  renameBrand,
  getBrandImpactAnalysis,
  writeBackBrandRegistry,
} from './identity/brandRegistry.js';
export {
  buildCanonicalIdentityIndex,
  loadCanonicalIdentityIndex,
  evaluateIdentityGate,
  registerCanonicalIdentity,
} from './identity/identityGate.js';
export {
  cleanVariant,
  deriveFullModel,
  isFabricatedVariant,
  normalizeProductIdentity,
} from './identity/identityDedup.js';
export {
  inferIdentityFromProductId,
  resolveAuthoritativeProductIdentity,
  resolveProductIdentity,
} from './identity/productIdentityAuthority.js';
export { generateIdentifier } from './identity/productIdentity.js';
export { slugify } from './identity/slugify.js';
export { resolveBrandIdentifier } from './identity/resolveBrandIdentifier.js';
export { discoverCategoriesLocal } from './products/discoverCategories.js';
async function loadCatalogReconciler() {
  return import('./products/reconciler.js');
}

export async function scanOrphans(options) {
  const { scanOrphans: scanOrphansImpl } = await loadCatalogReconciler();
  return scanOrphansImpl(options);
}

export async function reconcileOrphans(options) {
  const { reconcileOrphans: reconcileOrphansImpl } = await loadCatalogReconciler();
  return reconcileOrphansImpl(options);
}
