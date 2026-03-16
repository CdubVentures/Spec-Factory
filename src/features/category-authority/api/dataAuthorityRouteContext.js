export function createDataAuthorityRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, config, sessionCache, getSpecDb } = options;

  return { jsonRes, config, sessionCache, getSpecDb };
}
