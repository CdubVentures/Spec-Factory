import {
  reconcileOrphans, listProducts,
  addProduct as catalogAddProduct,
  addProductsBulk as catalogAddProductsBulk,
  updateProduct as catalogUpdateProduct,
  removeProduct as catalogRemoveProduct,
  seedFromCatalog as catalogSeedFromCatalog,
} from '../index.js';

export function createCatalogRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const {
    jsonRes, readJsonBody, toInt, config, storage, buildCatalog,
    readJsonlEvents, fs, path, OUTPUT_ROOT, sessionCache,
    resolveCategoryAlias, listDirs, HELPER_ROOT, broadcastWs, getSpecDb, appDb,
  } = options;

  return {
    jsonRes, readJsonBody, toInt, config, storage, reconcileOrphans, buildCatalog,
    listProducts, catalogAddProduct, catalogAddProductsBulk, catalogUpdateProduct,
    catalogRemoveProduct, catalogSeedFromCatalog,
    readJsonlEvents, fs, path, OUTPUT_ROOT, sessionCache,
    resolveCategoryAlias, listDirs, HELPER_ROOT, broadcastWs, getSpecDb, appDb,
  };
}
