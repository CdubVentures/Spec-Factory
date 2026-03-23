import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../src/shared/settingsDefaults.js';
import {
  SETTINGS_CLAMPING_INT_RANGE_MAP,
  SETTINGS_CLAMPING_FLOAT_RANGE_MAP,
  SETTINGS_CLAMPING_STRING_ENUM_MAP,
} from '../src/shared/settingsClampingRanges.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../src/core/config/settingsKeyMap.js';
import { RUNTIME_SETTINGS_ROUTE_PUT } from '../src/features/settings-authority/runtimeSettingsRoutePut.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function sortedKeys(obj) {
  return Object.keys(obj).sort();
}

/* ------------------------------------------------------------------ */
/*  1. Defaults snapshot — key set and types                           */
/* ------------------------------------------------------------------ */

describe('settingsDefaults.runtime — characterization', () => {
  const runtime = SETTINGS_DEFAULTS.runtime;

  it('runtime defaults is a frozen non-null object', () => {
    ok(runtime && typeof runtime === 'object');
    ok(Object.isFrozen(runtime));
  });

  it('has at least 200 keys', () => {
    ok(Object.keys(runtime).length >= 200, `expected >= 200, got ${Object.keys(runtime).length}`);
  });

  it('every value is string, number, boolean, or frozen object', () => {
    for (const [key, value] of Object.entries(runtime)) {
      const t = typeof value;
      const valid = t === 'string' || t === 'number' || t === 'boolean'
        || (t === 'object' && value !== null && Object.isFrozen(value));
      ok(valid, `runtime.${key} has unexpected type ${t}: ${JSON.stringify(value)}`);
    }
  });

  it('contains the 5 known aliased keys with expected defaults', () => {
    strictEqual(typeof runtime.indexingResumeMode, 'string');
    strictEqual(typeof runtime.concurrency, 'number');
    strictEqual(typeof runtime.indexingResumeMaxAgeHours, 'number');
    strictEqual(typeof runtime.indexingReextractAfterHours, 'number');
    strictEqual(typeof runtime.indexingReextractEnabled, 'boolean');
  });
});

/* ------------------------------------------------------------------ */
/*  2. Clamping ranges — key sets and shapes                           */
/* ------------------------------------------------------------------ */

describe('settingsClampingRanges — characterization', () => {
  it('INT_RANGE_MAP has expected key count', () => {
    const count = Object.keys(SETTINGS_CLAMPING_INT_RANGE_MAP).length;
    ok(count >= 90, `expected >= 90, got ${count}`);
  });

  it('every INT_RANGE_MAP entry has cfgKey, min, max', () => {
    for (const [key, entry] of Object.entries(SETTINGS_CLAMPING_INT_RANGE_MAP)) {
      ok(typeof entry.configKey === 'string', `${key} missing cfgKey`);
      ok(typeof entry.min === 'number' && Number.isFinite(entry.min), `${key} bad min`);
      ok(typeof entry.max === 'number' && Number.isFinite(entry.max), `${key} bad max`);
      ok(entry.min <= entry.max, `${key} min > max`);
    }
  });

  it('FLOAT_RANGE_MAP has expected key count', () => {
    const count = Object.keys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP).length;
    strictEqual(count, 11);
  });

  it('every FLOAT_RANGE_MAP entry has cfgKey, min, max', () => {
    for (const [key, entry] of Object.entries(SETTINGS_CLAMPING_FLOAT_RANGE_MAP)) {
      ok(typeof entry.configKey === 'string', `${key} missing cfgKey`);
      ok(typeof entry.min === 'number' && Number.isFinite(entry.min), `${key} bad min`);
      ok(typeof entry.max === 'number' && Number.isFinite(entry.max), `${key} bad max`);
    }
  });

  it('STRING_ENUM_MAP has expected key count', () => {
    const count = Object.keys(SETTINGS_CLAMPING_STRING_ENUM_MAP).length;
    strictEqual(count, 6);
  });

  it('every STRING_ENUM_MAP entry has cfgKey and allowed array', () => {
    for (const [key, entry] of Object.entries(SETTINGS_CLAMPING_STRING_ENUM_MAP)) {
      ok(typeof entry.configKey === 'string', `${key} missing cfgKey`);
      ok(Array.isArray(entry.allowed) && entry.allowed.length > 0, `${key} missing/empty allowed`);
    }
  });

  it('STRING_ENUM_MAP csv flags are correct', () => {
    strictEqual(SETTINGS_CLAMPING_STRING_ENUM_MAP.searchEngines.csv, true);
    strictEqual(SETTINGS_CLAMPING_STRING_ENUM_MAP.searchEnginesFallback.csv, true);
    strictEqual(SETTINGS_CLAMPING_STRING_ENUM_MAP.resumeMode.csv, undefined);
    strictEqual(SETTINGS_CLAMPING_STRING_ENUM_MAP.outputMode.csv, undefined);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Route GET contract — key sets                                   */
/* ------------------------------------------------------------------ */

describe('RUNTIME_SETTINGS_ROUTE_GET — characterization', () => {
  it('has stringMap, intMap, floatMap, boolMap', () => {
    ok(RUNTIME_SETTINGS_ROUTE_GET.stringMap);
    ok(RUNTIME_SETTINGS_ROUTE_GET.intMap);
    ok(RUNTIME_SETTINGS_ROUTE_GET.floatMap);
    ok(RUNTIME_SETTINGS_ROUTE_GET.boolMap);
  });

  it('stringMap has expected count', () => {
    const count = Object.keys(RUNTIME_SETTINGS_ROUTE_GET.stringMap).length;
    ok(count >= 48, `expected >= 48, got ${count}`);
  });

  it('intMap has expected count', () => {
    const count = Object.keys(RUNTIME_SETTINGS_ROUTE_GET.intMap).length;
    ok(count >= 90, `expected >= 90, got ${count}`);
  });

  it('floatMap has expected count', () => {
    strictEqual(Object.keys(RUNTIME_SETTINGS_ROUTE_GET.floatMap).length, 11);
  });

  it('boolMap has expected count', () => {
    const count = Object.keys(RUNTIME_SETTINGS_ROUTE_GET.boolMap).length;
    ok(count >= 30, `expected >= 30, got ${count}`);
  });

  it('every map entry value is a string (config key)', () => {
    for (const map of [
      RUNTIME_SETTINGS_ROUTE_GET.stringMap,
      RUNTIME_SETTINGS_ROUTE_GET.intMap,
      RUNTIME_SETTINGS_ROUTE_GET.floatMap,
      RUNTIME_SETTINGS_ROUTE_GET.boolMap,
    ]) {
      for (const [key, cfgKey] of Object.entries(map)) {
        ok(typeof cfgKey === 'string' && cfgKey.length > 0, `${key} has invalid cfgKey: ${cfgKey}`);
      }
    }
  });

  it('known aliases are correct in GET', () => {
    strictEqual(RUNTIME_SETTINGS_ROUTE_GET.stringMap.resumeMode, 'indexingResumeMode');
    strictEqual(RUNTIME_SETTINGS_ROUTE_GET.intMap.fetchConcurrency, 'concurrency');
    strictEqual(RUNTIME_SETTINGS_ROUTE_GET.intMap.resumeWindowHours, 'indexingResumeMaxAgeHours');
    strictEqual(RUNTIME_SETTINGS_ROUTE_GET.intMap.reextractAfterHours, 'indexingReextractAfterHours');
    strictEqual(RUNTIME_SETTINGS_ROUTE_GET.boolMap.reextractIndexed, 'indexingReextractEnabled');
  });
});

/* ------------------------------------------------------------------ */
/*  4. Route PUT contract — key sets                                   */
/* ------------------------------------------------------------------ */

describe('RUNTIME_SETTINGS_ROUTE_PUT — characterization', () => {
  it('has stringEnumMap, stringFreeMap, intRangeMap, floatRangeMap, boolMap', () => {
    ok(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap);
    ok(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap);
    ok(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap);
    ok(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap);
    ok(RUNTIME_SETTINGS_ROUTE_PUT.boolMap);
  });

  it('stringEnumMap key set matches clamping', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.stringEnumMap),
      sortedKeys(SETTINGS_CLAMPING_STRING_ENUM_MAP),
    );
  });

  it('intRangeMap key set matches clamping', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.intRangeMap),
      sortedKeys(SETTINGS_CLAMPING_INT_RANGE_MAP),
    );
  });

  it('floatRangeMap key set matches clamping', () => {
    deepStrictEqual(
      sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.floatRangeMap),
      sortedKeys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP),
    );
  });

  it('stringFreeMap has expected count', () => {
    const count = Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap).length;
    ok(count >= 40, `expected >= 40, got ${count}`);
  });

  it('boolMap has expected count', () => {
    const count = Object.keys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap).length;
    ok(count >= 30, `expected >= 30, got ${count}`);
  });

  it('known aliases are correct in PUT', () => {
    strictEqual(SETTINGS_CLAMPING_STRING_ENUM_MAP.resumeMode.configKey, 'indexingResumeMode');
    strictEqual(SETTINGS_CLAMPING_INT_RANGE_MAP.fetchConcurrency.configKey, 'concurrency');
    strictEqual(SETTINGS_CLAMPING_INT_RANGE_MAP.resumeWindowHours.configKey, 'indexingResumeMaxAgeHours');
    strictEqual(SETTINGS_CLAMPING_INT_RANGE_MAP.reextractAfterHours.configKey, 'indexingReextractAfterHours');
    strictEqual(RUNTIME_SETTINGS_ROUTE_PUT.boolMap.reextractIndexed, 'indexingReextractEnabled');
  });
});

/* ------------------------------------------------------------------ */
/*  5. Cross-checks: GET ↔ PUT coverage                                */
/* ------------------------------------------------------------------ */

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
    // dynamicFetchPolicyMapJson is a special key handled separately in PUT
    keys.add(RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey);
    return keys;
  };

  it('every PUT key also exists in GET', () => {
    const getKeys = getAllGetKeys();
    const putKeys = getAllPutKeys();
    const missingFromGet = [];
    for (const key of putKeys) {
      if (!getKeys.has(key)) missingFromGet.push(key);
    }
    deepStrictEqual(missingFromGet, [], `PUT keys missing from GET: ${missingFromGet.join(', ')}`);
  });

  it('GET keys not in PUT are exactly the known read-only set', () => {
    const getKeys = getAllGetKeys();
    const putKeys = getAllPutKeys();
    const readOnly = [];
    for (const key of getKeys) {
      if (!putKeys.has(key)) readOnly.push(key);
    }
    // Known read-only keys: present in GET but not in PUT
    readOnly.sort();
    deepStrictEqual(readOnly, [
      'awsRegion',
      's3Bucket',
    ]);
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

/* ------------------------------------------------------------------ */
/*  6. Alias consistency: cfgKey matches between GET and PUT           */
/* ------------------------------------------------------------------ */

describe('alias consistency — GET ↔ clamping ↔ PUT', () => {
  const KNOWN_ALIASES = [
    { feKey: 'resumeMode', cfgKey: 'indexingResumeMode' },
    { feKey: 'fetchConcurrency', cfgKey: 'concurrency' },
    { feKey: 'resumeWindowHours', cfgKey: 'indexingResumeMaxAgeHours' },
    { feKey: 'reextractAfterHours', cfgKey: 'indexingReextractAfterHours' },
    { feKey: 'reextractIndexed', cfgKey: 'indexingReextractEnabled' },
  ];

  for (const { feKey, cfgKey } of KNOWN_ALIASES) {
    it(`alias ${feKey} → ${cfgKey} is consistent across all layers`, () => {
      // Check GET maps
      const getMap =
        RUNTIME_SETTINGS_ROUTE_GET.stringMap[feKey]
        ?? RUNTIME_SETTINGS_ROUTE_GET.intMap[feKey]
        ?? RUNTIME_SETTINGS_ROUTE_GET.floatMap[feKey]
        ?? RUNTIME_SETTINGS_ROUTE_GET.boolMap[feKey];
      strictEqual(getMap, cfgKey, `GET alias mismatch for ${feKey}`);

      // Check clamping / PUT maps
      const clampEntry =
        SETTINGS_CLAMPING_INT_RANGE_MAP[feKey]
        ?? SETTINGS_CLAMPING_FLOAT_RANGE_MAP[feKey]
        ?? SETTINGS_CLAMPING_STRING_ENUM_MAP[feKey];
      if (clampEntry) {
        strictEqual(clampEntry.configKey, cfgKey, `clamping alias mismatch for ${feKey}`);
      }

      const putBool = RUNTIME_SETTINGS_ROUTE_PUT.boolMap[feKey];
      if (putBool) {
        strictEqual(putBool, cfgKey, `PUT boolMap alias mismatch for ${feKey}`);
      }
    });
  }
});
