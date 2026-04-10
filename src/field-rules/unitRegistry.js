// WHY: Runtime cache layer for the managed unit registry.
// Loads all units from app.sqlite on first call, builds lookup maps.
// Used by checkUnit.js for synonym resolution and unit conversion.
// Cache is invalidated after CRUD operations via invalidateUnitRegistryCache().

let _cache = null;

function buildCache(appDb) {
  const units = appDb.listUnits();
  const canonicalMap = new Map();
  const synonymMap = new Map();
  const conversionMap = new Map();

  for (const u of units) {
    const canonical = u.canonical;
    const canonicalLower = canonical.toLowerCase();
    canonicalMap.set(canonicalLower, canonical);

    for (const syn of u.synonyms || []) {
      const synLower = syn.toLowerCase();
      synonymMap.set(synLower, canonical);
    }

    for (const conv of u.conversions || []) {
      const fromLower = conv.from.toLowerCase();
      const key = `${fromLower}→${canonicalLower}`;
      conversionMap.set(key, conv.factor);
    }
  }

  return { canonicalMap, synonymMap, conversionMap };
}

function getCache(appDb) {
  if (!_cache && appDb) {
    _cache = buildCache(appDb);
  }
  return _cache;
}

/**
 * Resolve a detected unit suffix against an expected canonical unit.
 *
 * Resolution order:
 * 1. Case-insensitive exact match against expectedCanonical
 * 2. Synonym of expectedCanonical
 * 3. Cross-unit conversion (detected is a different canonical with conversion path)
 * 4. Fallback: case-insensitive match even for unregistered units
 *
 * @param {string} detected - Unit suffix from the value (e.g., "hertz", "lb")
 * @param {string} expectedCanonical - From contract.unit (e.g., "Hz", "g")
 * @param {object} [appDb] - AppDb instance for registry lookup
 * @returns {{ canonical: string, factor: number } | null}
 */
export function resolveUnit(detected, expectedCanonical, appDb) {
  if (!detected || !expectedCanonical) return null;

  const detectedLower = detected.toLowerCase();
  const expectedLower = expectedCanonical.toLowerCase();

  // 1. Case-insensitive exact match (works for registered AND unregistered units)
  if (detectedLower === expectedLower) {
    return { canonical: expectedCanonical, factor: 1 };
  }

  // Without appDb, only exact match is possible
  const cache = getCache(appDb);
  if (!cache) return null;

  // 2. Synonym of expectedCanonical
  const resolvedCanonical = cache.synonymMap.get(detectedLower);
  if (resolvedCanonical && resolvedCanonical.toLowerCase() === expectedLower) {
    return { canonical: expectedCanonical, factor: 1 };
  }

  // 3. Cross-unit conversion: check if detected unit has a conversion path to expected.
  // WHY: Conversion map stores fromUnit→toUnit keys. The detected unit may be a
  // canonical (like "kg"), a "from" value (like "kHz"), or a synonym. Try all forms.
  const directKey = `${detectedLower}→${expectedLower}`;
  const directFactor = cache.conversionMap.get(directKey);
  if (typeof directFactor === 'number' && Number.isFinite(directFactor)) {
    return { canonical: expectedCanonical, factor: directFactor };
  }

  // Also check if detected resolves to a canonical that has a conversion path
  const detectedCanonical = cache.canonicalMap.get(detectedLower) || cache.synonymMap.get(detectedLower);
  if (detectedCanonical && detectedCanonical.toLowerCase() !== detectedLower) {
    const canonicalKey = `${detectedCanonical.toLowerCase()}→${expectedLower}`;
    const canonicalFactor = cache.conversionMap.get(canonicalKey);
    if (typeof canonicalFactor === 'number' && Number.isFinite(canonicalFactor)) {
      return { canonical: expectedCanonical, factor: canonicalFactor };
    }
  }

  return null;
}

/**
 * Get all canonical unit names from the registry.
 * @param {object} appDb - AppDb instance
 * @returns {string[]}
 */
export function getRegistryUnits(appDb) {
  if (!appDb) return [];
  const cache = getCache(appDb);
  if (!cache) return [];
  return [...cache.canonicalMap.values()];
}

/**
 * Invalidate the cached registry. Call after CRUD operations.
 */
export function invalidateUnitRegistryCache() {
  _cache = null;
}
