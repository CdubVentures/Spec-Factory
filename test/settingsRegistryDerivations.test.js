import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';

// Existing structures (the truth we must match)
import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../src/shared/settingsDefaults.js';
import {
  SETTINGS_CLAMPING_INT_RANGE_MAP,
  SETTINGS_CLAMPING_FLOAT_RANGE_MAP,
  SETTINGS_CLAMPING_STRING_ENUM_MAP,
} from '../src/shared/settingsClampingRanges.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../src/core/config/settingsKeyMap.js';
import { RUNTIME_SETTINGS_ROUTE_PUT } from '../src/features/settings-authority/runtimeSettingsRoutePut.js';

// New registry + derivation functions
import { RUNTIME_SETTINGS_REGISTRY } from '../src/shared/settingsRegistry.js';
import {
  deriveRuntimeDefaults,
  deriveOptionValues,
  deriveClampingIntRangeMap,
  deriveClampingFloatRangeMap,
  deriveClampingStringEnumMap,
  deriveRouteGetMaps,
  deriveRoutePutContract,
} from '../src/shared/settingsRegistryDerivations.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function sortedKeys(obj) {
  return Object.keys(obj).sort();
}

/** Deep-compare ignoring Object.freeze (frozen vs unfrozen are equal if values match) */
function toPlainObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/* ------------------------------------------------------------------ */
/*  Registry integrity                                                  */
/* ------------------------------------------------------------------ */

describe('RUNTIME_SETTINGS_REGISTRY — integrity', () => {
  it('is a frozen array', () => {
    ok(Array.isArray(RUNTIME_SETTINGS_REGISTRY));
    ok(Object.isFrozen(RUNTIME_SETTINGS_REGISTRY));
  });

  it('has no duplicate keys', () => {
    const keys = RUNTIME_SETTINGS_REGISTRY.map(e => e.key);
    const unique = new Set(keys);
    strictEqual(keys.length, unique.size, `duplicate keys: ${keys.filter((k, i) => keys.indexOf(k) !== i)}`);
  });

  it('every entry has key, type, and default', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      ok(typeof entry.key === 'string' && entry.key.length > 0, `missing key`);
      ok(['string', 'int', 'float', 'bool', 'enum', 'csv_enum'].includes(entry.type), `${entry.key}: bad type ${entry.type}`);
      ok(entry.default !== undefined, `${entry.key}: missing default`);
    }
  });

  it('int/float entries with min/max have min <= max', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.min != null && entry.max != null) {
        ok(entry.min <= entry.max, `${entry.key}: min ${entry.min} > max ${entry.max}`);
      }
    }
  });

  it('enum/csv_enum entries have allowed arrays', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.type === 'enum' || entry.type === 'csv_enum') {
        ok(Array.isArray(entry.allowed) && entry.allowed.length > 0, `${entry.key}: missing allowed`);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/*  deriveRuntimeDefaults — must match SETTINGS_DEFAULTS.runtime        */
/* ------------------------------------------------------------------ */

describe('deriveRuntimeDefaults', () => {
  const derived = deriveRuntimeDefaults(RUNTIME_SETTINGS_REGISTRY);
  const existing = SETTINGS_DEFAULTS.runtime;

  // WHY: The registry is the SSOT. settingsDefaults.js has legacy keys not yet
  // migrated into the registry, and the registry has new keys (googleSearch*)
  // not yet added to settingsDefaults.js. These sets track the known drift so
  // the test stays green while migration converges.
  const REGISTRY_ONLY_KEYS = new Set([
    'googleSearchMaxRetries',
    'googleSearchMinQueryIntervalMs',
    'googleSearchProxyUrlsJson',
    'googleSearchScreenshotsEnabled',
    'googleSearchTimeoutMs',
    'searchMaxRetries',
  ]);
  const DEFAULTS_ONLY_KEYS = new Set([
    'authoritySnapshotEnabled',
    'billingJsonWrite',
    'cacheJsonWrite',
    'corpusJsonWrite',
    'frontierRepairSearchEnabled',
    'htmlTableExtractorV2',
    'intelJsonWrite',
    'learningJsonWrite',
    'llmExtractionCacheEnabled',
    'queueJsonWrite',
    'scannedPdfOcrPromoteCandidates',
    'staticDomExtractorEnabled',
  ]);
  // WHY: Track any known value drift between registry-derived defaults and settingsDefaults.
  // searchEngines drift was fixed when settingsDefaults aligned to registry default ('google').
  const KNOWN_VALUE_DRIFT_KEYS = new Set([]);

  it('derived key set matches existing (modulo known registry/defaults drift)', () => {
    const derivedKeys = sortedKeys(derived).filter(k => !REGISTRY_ONLY_KEYS.has(k));
    const existingKeys = sortedKeys(existing)
      .filter(k => k !== 'dynamicFetchPolicyMap')
      .filter(k => !DEFAULTS_ONLY_KEYS.has(k));
    deepStrictEqual(derivedKeys, existingKeys);
  });

  it('every shared key has matching value (excluding known drift)', () => {
    for (const key of Object.keys(derived)) {
      if (key === 'dynamicFetchPolicyMap') continue;
      if (REGISTRY_ONLY_KEYS.has(key)) continue;
      if (KNOWN_VALUE_DRIFT_KEYS.has(key)) continue;
      const d = derived[key];
      const e = existing[key];
      ok(e !== undefined, `key "${key}" not found in existing defaults`);
      strictEqual(
        JSON.stringify(d),
        JSON.stringify(e),
        `mismatch for ${key}: derived=${JSON.stringify(d).slice(0, 60)} vs existing=${JSON.stringify(e).slice(0, 60)}`,
      );
    }
  });

  it('registry-only keys have valid defaults', () => {
    for (const key of REGISTRY_ONLY_KEYS) {
      ok(key in derived, `registry-only key "${key}" should appear in derived defaults`);
      ok(derived[key] !== undefined, `registry-only key "${key}" should have a defined default`);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  deriveClampingIntRangeMap — must match existing                     */
/* ------------------------------------------------------------------ */

describe('deriveClampingIntRangeMap', () => {
  const derived = deriveClampingIntRangeMap(RUNTIME_SETTINGS_REGISTRY);

  it('key set matches', () => {
    deepStrictEqual(sortedKeys(derived), sortedKeys(SETTINGS_CLAMPING_INT_RANGE_MAP));
  });

  it('every entry matches cfgKey, min, max', () => {
    for (const key of Object.keys(SETTINGS_CLAMPING_INT_RANGE_MAP)) {
      const d = derived[key];
      const e = SETTINGS_CLAMPING_INT_RANGE_MAP[key];
      strictEqual(d.cfgKey, e.cfgKey, `${key} cfgKey mismatch`);
      strictEqual(d.min, e.min, `${key} min mismatch`);
      strictEqual(d.max, e.max, `${key} max mismatch`);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  deriveClampingFloatRangeMap — must match existing                   */
/* ------------------------------------------------------------------ */

describe('deriveClampingFloatRangeMap', () => {
  const derived = deriveClampingFloatRangeMap(RUNTIME_SETTINGS_REGISTRY);

  it('key set matches', () => {
    deepStrictEqual(sortedKeys(derived), sortedKeys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP));
  });

  it('every entry matches cfgKey, min, max', () => {
    for (const key of Object.keys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP)) {
      const d = derived[key];
      const e = SETTINGS_CLAMPING_FLOAT_RANGE_MAP[key];
      strictEqual(d.cfgKey, e.cfgKey, `${key} cfgKey mismatch`);
      strictEqual(d.min, e.min, `${key} min mismatch`);
      strictEqual(d.max, e.max, `${key} max mismatch`);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  deriveClampingStringEnumMap — must match existing                   */
/* ------------------------------------------------------------------ */

describe('deriveClampingStringEnumMap', () => {
  const derived = deriveClampingStringEnumMap(RUNTIME_SETTINGS_REGISTRY);

  it('key set matches', () => {
    deepStrictEqual(sortedKeys(derived), sortedKeys(SETTINGS_CLAMPING_STRING_ENUM_MAP));
  });

  it('every entry matches cfgKey and allowed', () => {
    for (const key of Object.keys(SETTINGS_CLAMPING_STRING_ENUM_MAP)) {
      const d = derived[key];
      const e = SETTINGS_CLAMPING_STRING_ENUM_MAP[key];
      strictEqual(d.cfgKey, e.cfgKey, `${key} cfgKey mismatch`);
      deepStrictEqual([...d.allowed], [...e.allowed], `${key} allowed mismatch`);
      strictEqual(d.csv, e.csv, `${key} csv mismatch`);
    }
  });
});

/* ------------------------------------------------------------------ */
/*  deriveRouteGetMaps — must match existing                           */
/* ------------------------------------------------------------------ */

describe('deriveRouteGetMaps', () => {
  const derived = deriveRouteGetMaps(RUNTIME_SETTINGS_REGISTRY);

  it('stringMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.stringMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.stringMap));
  });

  it('stringMap values match', () => {
    for (const [key, cfgKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.stringMap)) {
      strictEqual(derived.stringMap[key], cfgKey, `stringMap[${key}] mismatch`);
    }
  });

  it('intMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.intMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.intMap));
  });

  it('intMap values match', () => {
    for (const [key, cfgKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.intMap)) {
      strictEqual(derived.intMap[key], cfgKey, `intMap[${key}] mismatch`);
    }
  });

  it('floatMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.floatMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.floatMap));
  });

  it('boolMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.boolMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.boolMap));
  });

  it('boolMap values match', () => {
    for (const [key, cfgKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.boolMap)) {
      strictEqual(derived.boolMap[key], cfgKey, `boolMap[${key}] mismatch`);
    }
  });

  it('dynamicFetchPolicyMapJsonKey matches', () => {
    strictEqual(derived.dynamicFetchPolicyMapJsonKey, RUNTIME_SETTINGS_ROUTE_GET.dynamicFetchPolicyMapJsonKey);
  });
});

/* ------------------------------------------------------------------ */
/*  deriveRoutePutContract — must match existing                       */
/* ------------------------------------------------------------------ */

describe('deriveRoutePutContract', () => {
  const clampingIntRangeMap = deriveClampingIntRangeMap(RUNTIME_SETTINGS_REGISTRY);
  const clampingFloatRangeMap = deriveClampingFloatRangeMap(RUNTIME_SETTINGS_REGISTRY);
  const clampingStringEnumMap = deriveClampingStringEnumMap(RUNTIME_SETTINGS_REGISTRY);
  const derived = deriveRoutePutContract(RUNTIME_SETTINGS_REGISTRY, {
    clampingIntRangeMap,
    clampingFloatRangeMap,
    clampingStringEnumMap,
  });

  it('stringFreeMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.stringFreeMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap));
  });

  it('stringFreeMap values match', () => {
    for (const [key, cfgKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap)) {
      strictEqual(derived.stringFreeMap[key], cfgKey, `stringFreeMap[${key}] mismatch`);
    }
  });

  it('boolMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.boolMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap));
  });

  it('boolMap values match', () => {
    for (const [key, cfgKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_PUT.boolMap)) {
      strictEqual(derived.boolMap[key], cfgKey, `boolMap[${key}] mismatch`);
    }
  });

  it('stringEnumMap is the clamping map (reference equality)', () => {
    strictEqual(derived.stringEnumMap, clampingStringEnumMap);
  });

  it('intRangeMap is the clamping map (reference equality)', () => {
    strictEqual(derived.intRangeMap, clampingIntRangeMap);
  });

  it('floatRangeMap is the clamping map (reference equality)', () => {
    strictEqual(derived.floatRangeMap, clampingFloatRangeMap);
  });

  it('dynamicFetchPolicyMapJsonKey matches', () => {
    strictEqual(derived.dynamicFetchPolicyMapJsonKey, RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey);
  });

  it('stringTrimMap matches', () => {
    deepStrictEqual(toPlainObject(derived.stringTrimMap), toPlainObject(RUNTIME_SETTINGS_ROUTE_PUT.stringTrimMap));
  });
});
