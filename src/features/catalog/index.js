export {
  loadProductCatalog,
  saveProductCatalog,
  addProduct,
  addProductsBulk,
  updateProduct,
  removeProduct,
  seedFromCatalog,
  listProducts,
} from './products/productCatalog.js';
export {
  loadBrandRegistry,
  saveBrandRegistry,
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
  appendBrandRenameLog,
} from './identity/brandRegistry.js';
export {
  buildCanonicalIdentityIndex,
  loadCanonicalIdentityIndex,
  evaluateIdentityGate,
  registerCanonicalIdentity,
} from './identity/identityGate.js';
export {
  cleanVariant,
  isFabricatedVariant,
  normalizeProductIdentity,
} from './identity/identityDedup.js';
export {
  inferIdentityFromProductId,
  resolveAuthoritativeProductIdentity,
  resolveProductIdentity,
} from './identity/productIdentityAuthority.js';
export { generateIdentifier, nextAvailableId } from './identity/productIdentity.js';
export { slugify } from './identity/slugify.js';
export {
  loadCatalogProducts,
  loadCatalogProductsWithFields,
  discoverCategoriesLocal,
} from './products/catalogProductLoader.js';
export {
  migrateProductArtifacts,
  appendRenameLog,
} from './migrations/artifactMigration.js';

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
