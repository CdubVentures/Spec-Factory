export function createSourceStrategyRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, readJsonBody, config, resolveCategoryAlias, broadcastWs, getSpecDb } = options;

  return { jsonRes, readJsonBody, config, resolveCategoryAlias, broadcastWs, getSpecDb };
}
