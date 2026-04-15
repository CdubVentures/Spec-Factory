import { runColorEditionFinder } from '../colorEditionFinder.js';
import { deleteColorEditionFinderRun, deleteColorEditionFinderAll } from '../colorEditionStore.js';
import { deleteVariant } from '../variantLifecycle.js';

export function createColorEditionFinderRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs, logger } = options;

  return {
    jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
    logger, runColorEditionFinder,
    deleteColorEditionFinderRun, deleteColorEditionFinderAll,
    deleteVariant,
  };
}
