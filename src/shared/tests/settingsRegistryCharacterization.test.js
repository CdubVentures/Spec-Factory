import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import { SETTINGS_DEFAULTS } from '../settingsDefaults.js';
import {
  SETTINGS_CLAMPING_INT_RANGE_MAP,
  SETTINGS_CLAMPING_FLOAT_RANGE_MAP,
  SETTINGS_CLAMPING_STRING_ENUM_MAP,
} from '../settingsClampingRanges.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../../core/config/settingsKeyMap.js';
import { RUNTIME_SETTINGS_ROUTE_PUT } from '../../features/settings-authority/runtimeSettingsRoutePut.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';

function sortedKeys(obj) {
  return Object.keys(obj).sort();
}

function runtimeDefaultKeysFromRegistry() {
  const keys = new Set();
  for (const entry of RUNTIME_SETTINGS_REGISTRY) {
    if (entry.routeOnly) continue;
    const configKey = entry.configKey || entry.key;
    keys.add(configKey);
    if (entry.configKey && entry.configKey !== entry.key) {
      keys.add(entry.key);
    }
  }
  return [...keys].sort();
}

function registryKeysByType(
  types,
  { includeDefaultsOnly = true, includeReadOnly = true, requireBounds = false, requireAllowed = false } = {},
) {
  return RUNTIME_SETTINGS_REGISTRY
    .filter((entry) => types.includes(entry.type))
    .filter((entry) => includeDefaultsOnly || !entry.defaultsOnly)
    .filter((entry) => includeReadOnly || !entry.readOnly)
    .filter((entry) => !requireBounds || (entry.min != null && entry.max != null))
    .filter((entry) => !requireAllowed || (Array.isArray(entry.allowed) && entry.allowed.length > 0))
    .map((entry) => entry.key)
    .sort();
}

function currentAliasEntries() {
  return RUNTIME_SETTINGS_REGISTRY.filter(
    (entry) => entry.configKey && entry.configKey !== entry.key,
  );
}

describe('settingsDefaults.runtime — characterization', () => {
  const runtime = SETTINGS_DEFAULTS.runtime;

  it('runtime defaults is a frozen non-null object', () => {
    ok(runtime && typeof runtime === 'object');
    ok(Object.isFrozen(runtime));
  });

  it('runtime defaults keyset matches the registry-derived surface', () => {
    deepStrictEqual(sortedKeys(runtime), runtimeDefaultKeysFromRegistry());
  });

  it('every value is string, number, boolean, or frozen object', () => {
    for (const [key, value] of Object.entries(runtime)) {
      const t = typeof value;
      const valid = t === 'string' || t === 'number' || t === 'boolean'
        || (t === 'object' && value !== null && Object.isFrozen(value));
      ok(valid, `runtime.${key} has unexpected type ${t}: ${JSON.stringify(value)}`);
    }
  });

  it('contains only the current live alias pairs', () => {
    strictEqual(Object.hasOwn(runtime, 'fetchConcurrency'), false);
    strictEqual(Object.hasOwn(runtime, 'reextractAfterHours'), false);
    strictEqual(Object.hasOwn(runtime, 'reextractIndexed'), false);
  });
});

describe('settingsClampingRanges — characterization', () => {
  it('INT_RANGE_MAP keyset matches registry int bounds', () => {
    deepStrictEqual(
      sortedKeys(SETTINGS_CLAMPING_INT_RANGE_MAP),
      registryKeysByType(['int'], { requireBounds: true }),
    );
  });

  it('every INT_RANGE_MAP entry has configKey, min, max', () => {
    for (const [key, entry] of Object.entries(SETTINGS_CLAMPING_INT_RANGE_MAP)) {
      ok(typeof entry.configKey === 'string', `${key} missing configKey`);
      ok(typeof entry.min === 'number' && Number.isFinite(entry.min), `${key} bad min`);
      ok(typeof entry.max === 'number' && Number.isFinite(entry.max), `${key} bad max`);
      ok(entry.min <= entry.max, `${key} min > max`);
    }
  });

  it('FLOAT_RANGE_MAP keyset matches registry float bounds', () => {
    deepStrictEqual(
      sortedKeys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP),
      registryKeysByType(['float'], { requireBounds: true }),
    );
  });

  it('every FLOAT_RANGE_MAP entry has configKey, min, max', () => {
    for (const [key, entry] of Object.entries(SETTINGS_CLAMPING_FLOAT_RANGE_MAP)) {
      ok(typeof entry.configKey === 'string', `${key} missing configKey`);
      ok(typeof entry.min === 'number' && Number.isFinite(entry.min), `${key} bad min`);
      ok(typeof entry.max === 'number' && Number.isFinite(entry.max), `${key} bad max`);
    }
  });

  it('STRING_ENUM_MAP keyset matches registry enum entries', () => {
    deepStrictEqual(
      sortedKeys(SETTINGS_CLAMPING_STRING_ENUM_MAP),
      registryKeysByType(['enum', 'csv_enum'], { requireAllowed: true }),
    );
  });

  it('every STRING_ENUM_MAP entry has configKey and allowed array', () => {
    for (const [key, entry] of Object.entries(SETTINGS_CLAMPING_STRING_ENUM_MAP)) {
      ok(typeof entry.configKey === 'string', `${key} missing configKey`);
      ok(Array.isArray(entry.allowed) && entry.allowed.length > 0, `${key} missing/empty allowed`);
    }
  });

  it('STRING_ENUM_MAP csv flags are correct', () => {
    strictEqual(SETTINGS_CLAMPING_STRING_ENUM_MAP.searchEngines.csv, true);
    strictEqual(SETTINGS_CLAMPING_STRING_ENUM_MAP.searchEnginesFallback.csv, true);
  });
});

describe('RUNTIME_SETTINGS_ROUTE_GET — characterization', () => {
  it('has stringMap, intMap, floatMap, boolMap', () => {
    ok(RUNTIME_SETTINGS_ROUTE_GET.stringMap);
    ok(RUNTIME_SETTINGS_ROUTE_GET.intMap);
    ok(RUNTIME_SETTINGS_ROUTE_GET.floatMap);
    ok(RUNTIME_SETTINGS_ROUTE_GET.boolMap);
  });

  it('stringMap keyset matches registry string/enum GET keys', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.stringMap),
      registryKeysByType(['string', 'enum', 'csv_enum'], { includeDefaultsOnly: false }),
    );
  });

  it('intMap keyset matches registry int GET keys', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.intMap),
      registryKeysByType(['int'], { includeDefaultsOnly: false }),
    );
  });

  it('floatMap keyset matches registry float GET keys', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.floatMap),
      registryKeysByType(['float'], { includeDefaultsOnly: false }),
    );
  });

  it('boolMap keyset matches registry bool GET keys', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.boolMap),
      registryKeysByType(['bool'], { includeDefaultsOnly: false }),
    );
  });

  it('every map entry value is a string config key', () => {
    for (const map of [
      RUNTIME_SETTINGS_ROUTE_GET.stringMap,
      RUNTIME_SETTINGS_ROUTE_GET.intMap,
      RUNTIME_SETTINGS_ROUTE_GET.floatMap,
      RUNTIME_SETTINGS_ROUTE_GET.boolMap,
    ]) {
      for (const [key, configKey] of Object.entries(map)) {
        ok(typeof configKey === 'string' && configKey.length > 0, `${key} has invalid configKey: ${configKey}`);
      }
    }
  });

  it('known live aliases are correct in GET', () => {
    strictEqual(Object.hasOwn(RUNTIME_SETTINGS_ROUTE_GET.intMap, 'fetchConcurrency'), false);
    strictEqual(Object.hasOwn(RUNTIME_SETTINGS_ROUTE_GET.intMap, 'reextractAfterHours'), false);
    strictEqual(Object.hasOwn(RUNTIME_SETTINGS_ROUTE_GET.boolMap, 'reextractIndexed'), false);
  });
});

describe('RUNTIME_SETTINGS_ROUTE_PUT — characterization', () => {
  it('has stringEnumMap, stringFreeMap, intRangeMap, floatRangeMap, boolMap', () => {
    ok(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap);
    ok(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap);
    ok(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap);
    ok(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap);
    ok(RUNTIME_SETTINGS_ROUTE_PUT.boolMap);
  });

  it('stringEnumMap keyset matches clamping', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap),
      sortedKeys(SETTINGS_CLAMPING_STRING_ENUM_MAP),
    );
  });

  it('intRangeMap keyset matches clamping', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap),
      sortedKeys(SETTINGS_CLAMPING_INT_RANGE_MAP),
    );
  });

  it('floatRangeMap keyset matches clamping', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap),
      sortedKeys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP),
    );
  });

  it('stringFreeMap keyset matches mutable registry string keys', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap),
      registryKeysByType(['string'], { includeDefaultsOnly: false, includeReadOnly: false }),
    );
  });

  it('boolMap keyset matches mutable registry bool keys', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap),
      registryKeysByType(['bool'], { includeDefaultsOnly: false, includeReadOnly: false }),
    );
  });

  it('known live aliases are correct in PUT', () => {
    strictEqual(Object.hasOwn(SETTINGS_CLAMPING_INT_RANGE_MAP, 'fetchConcurrency'), false);
    strictEqual(Object.hasOwn(SETTINGS_CLAMPING_INT_RANGE_MAP, 'reextractAfterHours'), false);
    strictEqual(Object.hasOwn(RUNTIME_SETTINGS_ROUTE_PUT.boolMap, 'reextractIndexed'), false);
  });
});

describe('GET ↔ PUT cross-checks', () => {
  const getAllGetKeys = () => {
    const keys = new Set();
    for (const map of [
      RUNTIME_SETTINGS_ROUTE_GET.stringMap,
      RUNTIME_SETTINGS_ROUTE_GET.intMap,
      RUNTIME_SETTINGS_ROUTE_GET.floatMap,
      RUNTIME_SETTINGS_ROUTE_GET.boolMap,
    ]) {
      for (const key of Object.keys(map)) keys.add(key);
    }
    return keys;
  };

  const getAllPutKeys = () => {
    const keys = new Set();
    for (const map of [
      RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap,
      RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap,
      RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap,
      RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap,
      RUNTIME_SETTINGS_ROUTE_PUT.boolMap,
    ]) {
      for (const key of Object.keys(map)) keys.add(key);
    }
    return keys;
  };

  it('every PUT key also exists in GET', () => {
    const missingFromGet = [...getAllPutKeys()].filter((key) => !getAllGetKeys().has(key)).sort();
    deepStrictEqual(missingFromGet, []);
  });

  it('GET-only keys are the read-only registry keys', () => {
    const putKeys = getAllPutKeys();
    const getOnly = [...getAllGetKeys()].filter((key) => !putKeys.has(key)).sort();
    const expectedReadOnly = RUNTIME_SETTINGS_REGISTRY
      .filter((entry) => !entry.defaultsOnly && entry.readOnly)
      .map((entry) => entry.key)
      .sort();
    deepStrictEqual(getOnly, expectedReadOnly);
  });

  it('clamping ranges int keys are a subset of GET intMap keys', () => {
    const intMapKeys = new Set(Object.keys(RUNTIME_SETTINGS_ROUTE_GET.intMap));
    for (const key of Object.keys(SETTINGS_CLAMPING_INT_RANGE_MAP)) {
      ok(intMapKeys.has(key), `clamping int key "${key}" not in GET intMap`);
    }
  });

  it('clamping ranges float keys are a subset of GET floatMap keys', () => {
    const floatMapKeys = new Set(Object.keys(RUNTIME_SETTINGS_ROUTE_GET.floatMap));
    for (const key of Object.keys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP)) {
      ok(floatMapKeys.has(key), `clamping float key "${key}" not in GET floatMap`);
    }
  });

  it('clamping ranges enum keys are a subset of GET stringMap keys', () => {
    const stringMapKeys = new Set(Object.keys(RUNTIME_SETTINGS_ROUTE_GET.stringMap));
    for (const key of Object.keys(SETTINGS_CLAMPING_STRING_ENUM_MAP)) {
      ok(stringMapKeys.has(key), `clamping enum key "${key}" not in GET stringMap`);
    }
  });
});

describe('alias consistency — GET ↔ clamping ↔ PUT', () => {
  for (const entry of currentAliasEntries()) {
    it(`alias ${entry.key} → ${entry.configKey} is consistent across all layers`, () => {
      const getMap =
        RUNTIME_SETTINGS_ROUTE_GET.stringMap[entry.key]
        ?? RUNTIME_SETTINGS_ROUTE_GET.intMap[entry.key]
        ?? RUNTIME_SETTINGS_ROUTE_GET.floatMap[entry.key]
        ?? RUNTIME_SETTINGS_ROUTE_GET.boolMap[entry.key];
      strictEqual(getMap, entry.configKey, `GET alias mismatch for ${entry.key}`);

      const clampEntry =
        SETTINGS_CLAMPING_INT_RANGE_MAP[entry.key]
        ?? SETTINGS_CLAMPING_FLOAT_RANGE_MAP[entry.key]
        ?? SETTINGS_CLAMPING_STRING_ENUM_MAP[entry.key];
      if (clampEntry) {
        strictEqual(clampEntry.configKey, entry.configKey, `clamping alias mismatch for ${entry.key}`);
      }

      const putBool = RUNTIME_SETTINGS_ROUTE_PUT.boolMap[entry.key];
      if (putBool) {
        strictEqual(putBool, entry.configKey, `PUT boolMap alias mismatch for ${entry.key}`);
      }
    });
  }
});
