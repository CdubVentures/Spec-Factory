import { writeBackColorRegistry } from '../colorRegistrySeed.js';

// WHY: After a color registry mutation, sync list_values in all active
// category specDbs so the closed enum stays current without recompile.
function buildSyncColorEnums(appDb, specDbCache) {
  return function syncColorEnumsToActiveCategories() {
    if (!specDbCache || typeof specDbCache.entries !== 'function') return;
    const allColors = appDb.listColors();
    for (const [, specDb] of specDbCache) {
      if (!specDb || typeof specDb.upsertListValue !== 'function') continue;
      for (const color of allColors) {
        specDb.upsertListValue({
          fieldKey: 'colors',
          value: color.name,
          normalizedValue: color.name,
          source: 'known_values',
          enumPolicy: 'closed',
          needsReview: false,
          overridden: false,
        });
      }
    }
  };
}

export function createColorRouteContext(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object');
  }

  const { jsonRes, readJsonBody, appDb, broadcastWs, colorRegistryPath, specDbCache } = options;

  return {
    jsonRes, readJsonBody, appDb, broadcastWs,
    colorRegistryPath, writeBackColorRegistry,
    syncColorEnums: buildSyncColorEnums(appDb, specDbCache),
  };
}
