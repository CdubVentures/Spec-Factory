/**
 * Module Settings — route context injection.
 */

export function createModuleSettingsRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, readJsonBody, getSpecDb, broadcastWs, helperRoot, appDb } = options;

  return { jsonRes, readJsonBody, getSpecDb, broadcastWs, helperRoot, appDb };
}
