export function createPublisherRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, getSpecDb } = options;

  return { jsonRes, getSpecDb };
}
