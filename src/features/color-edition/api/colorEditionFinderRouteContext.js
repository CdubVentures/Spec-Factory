import { runColorEditionFinder } from '../colorEditionFinder.js';
import { readColorEdition } from '../colorEditionStore.js';

export function createColorEditionFinderRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs, colorRegistryPath, logger } = options;

  return {
    jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs,
    colorRegistryPath, logger, runColorEditionFinder, readColorEdition,
  };
}
