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

  // WHY: After Phase 2, SETTINGS_DEFAULTS.runtime IS deriveRuntimeDefaults(REGISTRY)
  // plus dynamicFetchPolicyMap. Zero drift sets remain.

  it('derived key set matches existing (zero drift)', () => {
    const derivedKeys = sortedKeys(derived);
    const existingKeys = sortedKeys(existing).filter(k => k !== 'dynamicFetchPolicyMap');
    deepStrictEqual(derivedKeys, existingKeys);
  });

  it('every key has matching value', () => {
    for (const key of Object.keys(derived)) {
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
});

/* ------------------------------------------------------------------ */
/*  deriveClampingIntRangeMap — must match existing                     */
/* ------------------------------------------------------------------ */

describe('deriveClampingIntRangeMap', () => {
  const derived = deriveClampingIntRangeMap(RUNTIME_SETTINGS_REGISTRY);

  it('key set matches', () => {
    deepStrictEqual(sortedKeys(derived), sortedKeys(SETTINGS_CLAMPING_INT_RANGE_MAP));
  });

  it('every entry matches configKey, min, max', () => {
    for (const key of Object.keys(SETTINGS_CLAMPING_INT_RANGE_MAP)) {
      const d = derived[key];
      const e = SETTINGS_CLAMPING_INT_RANGE_MAP[key];
      strictEqual(d.configKey, e.configKey, `${key} configKey mismatch`);
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

  it('every entry matches configKey, min, max', () => {
    for (const key of Object.keys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP)) {
      const d = derived[key];
      const e = SETTINGS_CLAMPING_FLOAT_RANGE_MAP[key];
      strictEqual(d.configKey, e.configKey, `${key} configKey mismatch`);
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

  it('every entry matches configKey and allowed', () => {
    for (const key of Object.keys(SETTINGS_CLAMPING_STRING_ENUM_MAP)) {
      const d = derived[key];
      const e = SETTINGS_CLAMPING_STRING_ENUM_MAP[key];
      strictEqual(d.configKey, e.configKey, `${key} configKey mismatch`);
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

/* ------------------------------------------------------------------ */
/*  Phase 2: derived defaults golden-master (key existence + values)   */
/* ------------------------------------------------------------------ */

describe('deriveRuntimeDefaults — golden-master after Phase 2', () => {
  const derived = deriveRuntimeDefaults(RUNTIME_SETTINGS_REGISTRY);

  it('SETTINGS_DEFAULTS.runtime is registry-derived (not hand-maintained)', () => {
    const derivedKeys = new Set(Object.keys(derived));
    for (const key of Object.keys(SETTINGS_DEFAULTS.runtime)) {
      if (key === 'dynamicFetchPolicyMap') continue;
      ok(derivedKeys.has(key), `SETTINGS_DEFAULTS.runtime key "${key}" missing from derived`);
    }
  });

  it('spot-check key values match registry defaults', () => {
    strictEqual(derived.fetchConcurrency, 4);
    strictEqual(derived.llmModelPlan, 'gemini-2.5-flash');
    strictEqual(derived.llmModelReasoning, 'deepseek-reasoner');
    strictEqual(derived.maxRunSeconds, 480);
    strictEqual(derived.autoScrollEnabled, true);
    strictEqual(derived.resumeMode, 'auto');
    strictEqual(derived.scannedPdfOcrBackend, 'auto');
    strictEqual(derived.discoveryEnabled, true);
    strictEqual(derived.fetchCandidateSources, true);
    strictEqual(derived.llmExtractionCacheEnabled, true);
  });

  it('cfgKey aliases are emitted under both names', () => {
    strictEqual(derived.resumeMode, derived.indexingResumeMode);
    strictEqual(derived.fetchConcurrency, derived.concurrency);
    strictEqual(derived.resumeWindowHours, derived.indexingResumeMaxAgeHours);
    strictEqual(derived.reextractAfterHours, derived.indexingReextractAfterHours);
    strictEqual(derived.reextractIndexed, derived.indexingReextractEnabled);
  });

  it('google search keys from registry appear in derived (gap closed)', () => {
    ok('googleSearchMaxRetries' in derived);
    ok('googleSearchTimeoutMs' in derived);
    ok('serperEnabled' in derived);
  });

  it('deriveOptionValues produces correct enum options', () => {
    const options = deriveOptionValues(RUNTIME_SETTINGS_REGISTRY);
    deepStrictEqual([...options.resumeMode], ['auto', 'force_resume', 'start_over']);
    deepStrictEqual([...options.scannedPdfOcrBackend], ['auto', 'tesseract', 'none']);
    deepStrictEqual([...options.repairDedupeRule], ['domain_once', 'domain_and_status', 'none']);
    deepStrictEqual([...options.outputMode], ['local', 'dual', 's3']);
    ok(options.searchEngines.includes('google'));
  });
});

/* ------------------------------------------------------------------ */
/*  Phase 1: Registry enrichment — aliases, deprecated, gap closure    */
/* ------------------------------------------------------------------ */

describe('registry enrichment — aliases', () => {
  const byKey = Object.fromEntries(RUNTIME_SETTINGS_REGISTRY.map(e => [e.key, e]));

  it('aliases field is always an array of strings when present', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.aliases) {
        ok(Array.isArray(entry.aliases), `${entry.key}: aliases must be an array`);
        for (const alias of entry.aliases) {
          ok(typeof alias === 'string' && alias.length > 0, `${entry.key}: alias must be non-empty string`);
        }
      }
    }
  });

  it('categoryAuthorityRoot has helperFilesRoot alias', () => {
    ok(byKey.categoryAuthorityRoot.aliases?.includes('helperFilesRoot'));
  });

  it('categoryAuthorityEnabled has helperFilesEnabled alias', () => {
    ok(byKey.categoryAuthorityEnabled.aliases?.includes('helperFilesEnabled'));
  });

  it('indexingCategoryAuthorityEnabled has indexingHelperFilesEnabled alias', () => {
    ok(byKey.indexingCategoryAuthorityEnabled.aliases?.includes('indexingHelperFilesEnabled'));
  });

  it('searchEngines has searchProvider alias', () => {
    ok(byKey.searchEngines.aliases?.includes('searchProvider'));
  });

  it('llmModelPlan has phase2LlmModel alias', () => {
    ok(byKey.llmModelPlan.aliases?.includes('phase2LlmModel'));
  });

  it('llmMaxOutputTokensPlan has llmTokensPlan alias', () => {
    ok(byKey.llmMaxOutputTokensPlan.aliases?.includes('llmTokensPlan'));
  });

  it('llmMaxOutputTokensReasoning has llmTokensReasoning alias', () => {
    ok(byKey.llmMaxOutputTokensReasoning.aliases?.includes('llmTokensReasoning'));
  });

  it('llmMaxOutputTokensPlanFallback has llmTokensPlanFallback alias', () => {
    ok(byKey.llmMaxOutputTokensPlanFallback.aliases?.includes('llmTokensPlanFallback'));
  });

  it('llmMaxOutputTokensReasoningFallback has llmTokensReasoningFallback alias', () => {
    ok(byKey.llmMaxOutputTokensReasoningFallback.aliases?.includes('llmTokensReasoningFallback'));
  });
});

describe('registry enrichment — deprecated', () => {
  const byKey = Object.fromEntries(RUNTIME_SETTINGS_REGISTRY.map(e => [e.key, e]));

  it('fetchCandidateSources is deprecated', () => {
    strictEqual(byKey.fetchCandidateSources.deprecated, true);
  });

  it('helperFilesRoot removed from registry (canonical is categoryAuthorityRoot)', () => {
    strictEqual(byKey.helperFilesRoot, undefined);
  });
});

describe('registry enrichment — defaults-only gap closure', () => {
  const registryKeys = new Set(RUNTIME_SETTINGS_REGISTRY.map(e => e.key));

  // WHY: These 12 keys were in SETTINGS_DEFAULTS.runtime but missing from the
  // registry. Phase 1 adds them as defaultsOnly entries to close the gap.
  const FORMERLY_MISSING = [
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
  ];

  for (const key of FORMERLY_MISSING) {
    it(`"${key}" is now in the registry`, () => {
      ok(registryKeys.has(key), `${key} must be in RUNTIME_SETTINGS_REGISTRY`);
    });
  }

  it('all formerly-missing entries are defaultsOnly booleans', () => {
    for (const key of FORMERLY_MISSING) {
      const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === key);
      ok(entry, `${key} missing from registry`);
      strictEqual(entry.type, 'bool', `${key} should be bool`);
      strictEqual(entry.defaultsOnly, true, `${key} should be defaultsOnly`);
    }
  });
});
