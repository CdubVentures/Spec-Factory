export function createPublisherRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, readJsonBody, getSpecDb, broadcastWs, config, productRoot } = options;

  return { jsonRes, readJsonBody, getSpecDb, broadcastWs, config, productRoot };
}
