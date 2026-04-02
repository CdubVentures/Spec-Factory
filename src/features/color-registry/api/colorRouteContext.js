import { writeBackColorRegistry } from '../colorRegistrySeed.js';

export function createColorRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, readJsonBody, appDb, broadcastWs, colorRegistryPath } = options;

  return {
    jsonRes, readJsonBody, appDb, broadcastWs,
    colorRegistryPath, writeBackColorRegistry,
  };
}
