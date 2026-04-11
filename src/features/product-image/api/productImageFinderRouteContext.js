/**
 * Product Image Finder — route context injection.
 */

import { runProductImageFinder } from '../productImageFinder.js';
import { deleteProductImageFinderRun, deleteProductImageFinderAll } from '../productImageStore.js';

export function createProductImageFinderRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs, logger } = options;

  return {
    jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
    logger, runProductImageFinder,
    deleteProductImageFinderRun, deleteProductImageFinderAll,
  };
}
