const REQUIRED_KEYS = Object.freeze([
  'jsonRes',
  'readJsonBody',
  'config',
  'appDb',
  'getSpecDb',
  'broadcastWs',
]);

export function createFinderRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('createFinderRouteContext: options must be an object');
  }

  for (const key of REQUIRED_KEYS) {
    if (options[key] === undefined) {
      throw new TypeError(`createFinderRouteContext: missing required option "${key}"`);
    }
  }

  const { jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs, logger = null } = options;

  return { jsonRes, readJsonBody, config, appDb, getSpecDb, broadcastWs, logger };
}
