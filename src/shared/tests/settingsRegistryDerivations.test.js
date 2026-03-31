import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';

import { SETTINGS_DEFAULTS, SETTINGS_OPTION_VALUES } from '../settingsDefaults.js';
import {
  SETTINGS_CLAMPING_INT_RANGE_MAP,
  SETTINGS_CLAMPING_FLOAT_RANGE_MAP,
  SETTINGS_CLAMPING_STRING_ENUM_MAP,
} from '../settingsClampingRanges.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../../core/config/settingsKeyMap.js';
import { RUNTIME_SETTINGS_ROUTE_PUT } from '../../features/settings-authority/runtimeSettingsRoutePut.js';

import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';
import {
  deriveRuntimeDefaults,
  deriveOptionValues,
  deriveClampingIntRangeMap,
  deriveClampingFloatRangeMap,
  deriveClampingStringEnumMap,
  deriveRouteGetMaps,
  deriveRoutePutContract,
} from '../settingsRegistryDerivations.js';

function sortedKeys(obj) {
  return Object.keys(obj).sort();
}

function toPlainObject(obj) {
  return JSON.parse(JSON.stringify(obj));
}

describe('RUNTIME_SETTINGS_REGISTRY integrity', () => {
  it('is a frozen array', () => {
    ok(Array.isArray(RUNTIME_SETTINGS_REGISTRY));
    ok(Object.isFrozen(RUNTIME_SETTINGS_REGISTRY));
  });

  it('has no duplicate keys', () => {
    const keys = RUNTIME_SETTINGS_REGISTRY.map((entry) => entry.key);
    const unique = new Set(keys);
    strictEqual(keys.length, unique.size, `duplicate keys: ${keys.filter((key, index) => keys.indexOf(key) !== index)}`);
  });

  it('every entry has key, type, and default', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      ok(typeof entry.key === 'string' && entry.key.length > 0, 'missing key');
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

describe('deriveRuntimeDefaults', () => {
  const derived = deriveRuntimeDefaults(RUNTIME_SETTINGS_REGISTRY);
  const existing = SETTINGS_DEFAULTS.runtime;

  it('derived key set matches existing', () => {
    deepStrictEqual(sortedKeys(derived), sortedKeys(existing));
  });

  it('every key has the existing value', () => {
    for (const key of Object.keys(derived)) {
      const derivedValue = derived[key];
      const existingValue = existing[key];
      ok(existingValue !== undefined, `key "${key}" not found in existing defaults`);
      strictEqual(
        JSON.stringify(derivedValue),
        JSON.stringify(existingValue),
        `mismatch for ${key}: derived=${JSON.stringify(derivedValue).slice(0, 60)} vs existing=${JSON.stringify(existingValue).slice(0, 60)}`,
      );
    }
  });
});

describe('deriveOptionValues', () => {
  const derived = deriveOptionValues(RUNTIME_SETTINGS_REGISTRY);

  it('matches the existing option-values surface', () => {
    deepStrictEqual(toPlainObject(derived), toPlainObject(SETTINGS_OPTION_VALUES.runtime));
  });

  it('does not emit retired option keys', () => {
    ok(!('resumeMode' in derived));
    ok(!('repairDedupeRule' in derived));
  });
});

describe('deriveClampingIntRangeMap', () => {
  const derived = deriveClampingIntRangeMap(RUNTIME_SETTINGS_REGISTRY);

  it('key set matches', () => {
    deepStrictEqual(sortedKeys(derived), sortedKeys(SETTINGS_CLAMPING_INT_RANGE_MAP));
  });

  it('every entry matches configKey, min, and max', () => {
    for (const key of Object.keys(SETTINGS_CLAMPING_INT_RANGE_MAP)) {
      const derivedEntry = derived[key];
      const existingEntry = SETTINGS_CLAMPING_INT_RANGE_MAP[key];
      strictEqual(derivedEntry.configKey, existingEntry.configKey, `${key} configKey mismatch`);
      strictEqual(derivedEntry.min, existingEntry.min, `${key} min mismatch`);
      strictEqual(derivedEntry.max, existingEntry.max, `${key} max mismatch`);
    }
  });
});

describe('deriveClampingFloatRangeMap', () => {
  const derived = deriveClampingFloatRangeMap(RUNTIME_SETTINGS_REGISTRY);

  it('key set matches', () => {
    deepStrictEqual(sortedKeys(derived), sortedKeys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP));
  });

  it('every entry matches configKey, min, and max', () => {
    for (const key of Object.keys(SETTINGS_CLAMPING_FLOAT_RANGE_MAP)) {
      const derivedEntry = derived[key];
      const existingEntry = SETTINGS_CLAMPING_FLOAT_RANGE_MAP[key];
      strictEqual(derivedEntry.configKey, existingEntry.configKey, `${key} configKey mismatch`);
      strictEqual(derivedEntry.min, existingEntry.min, `${key} min mismatch`);
      strictEqual(derivedEntry.max, existingEntry.max, `${key} max mismatch`);
    }
  });
});

describe('deriveClampingStringEnumMap', () => {
  const derived = deriveClampingStringEnumMap(RUNTIME_SETTINGS_REGISTRY);

  it('key set matches', () => {
    deepStrictEqual(sortedKeys(derived), sortedKeys(SETTINGS_CLAMPING_STRING_ENUM_MAP));
  });

  it('every entry matches configKey, allowed values, and csv flag', () => {
    for (const key of Object.keys(SETTINGS_CLAMPING_STRING_ENUM_MAP)) {
      const derivedEntry = derived[key];
      const existingEntry = SETTINGS_CLAMPING_STRING_ENUM_MAP[key];
      strictEqual(derivedEntry.configKey, existingEntry.configKey, `${key} configKey mismatch`);
      deepStrictEqual([...derivedEntry.allowed], [...existingEntry.allowed], `${key} allowed mismatch`);
      strictEqual(derivedEntry.csv, existingEntry.csv, `${key} csv mismatch`);
    }
  });
});

describe('deriveRouteGetMaps', () => {
  const derived = deriveRouteGetMaps(RUNTIME_SETTINGS_REGISTRY);

  it('stringMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.stringMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.stringMap));
  });

  it('stringMap values match', () => {
    for (const [key, configKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.stringMap)) {
      strictEqual(derived.stringMap[key], configKey, `stringMap[${key}] mismatch`);
    }
  });

  it('intMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.intMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.intMap));
  });

  it('intMap values match', () => {
    for (const [key, configKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.intMap)) {
      strictEqual(derived.intMap[key], configKey, `intMap[${key}] mismatch`);
    }
  });

  it('floatMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.floatMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.floatMap));
  });

  it('boolMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.boolMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_GET.boolMap));
  });

  it('boolMap values match', () => {
    for (const [key, configKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_GET.boolMap)) {
      strictEqual(derived.boolMap[key], configKey, `boolMap[${key}] mismatch`);
    }
  });
});

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
    for (const [key, configKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_PUT.stringFreeMap)) {
      strictEqual(derived.stringFreeMap[key], configKey, `stringFreeMap[${key}] mismatch`);
    }
  });

  it('boolMap key set matches', () => {
    deepStrictEqual(sortedKeys(derived.boolMap), sortedKeys(RUNTIME_SETTINGS_ROUTE_PUT.boolMap));
  });

  it('boolMap values match', () => {
    for (const [key, configKey] of Object.entries(RUNTIME_SETTINGS_ROUTE_PUT.boolMap)) {
      strictEqual(derived.boolMap[key], configKey, `boolMap[${key}] mismatch`);
    }
  });

  it('stringEnumMap reuses the clamping map', () => {
    strictEqual(derived.stringEnumMap, clampingStringEnumMap);
  });

  it('intRangeMap reuses the clamping map', () => {
    strictEqual(derived.intRangeMap, clampingIntRangeMap);
  });

  it('floatRangeMap reuses the clamping map', () => {
    strictEqual(derived.floatRangeMap, clampingFloatRangeMap);
  });

  it('stringTrimMap matches', () => {
    deepStrictEqual(toPlainObject(derived.stringTrimMap), toPlainObject(RUNTIME_SETTINGS_ROUTE_PUT.stringTrimMap));
  });
});

describe('registry enrichment aliases', () => {
  const byKey = Object.fromEntries(RUNTIME_SETTINGS_REGISTRY.map((entry) => [entry.key, entry]));

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

});

describe('registry enrichment deprecated', () => {
  const byKey = Object.fromEntries(RUNTIME_SETTINGS_REGISTRY.map((entry) => [entry.key, entry]));

  it('helperFilesRoot is removed from the registry', () => {
    strictEqual(byKey.helperFilesRoot, undefined);
  });
});

describe('registry enrichment defaults-only gap closure', () => {
  const registryKeys = new Set(RUNTIME_SETTINGS_REGISTRY.map((entry) => entry.key));

  it('all formerly missing defaultsOnly entries have been retired', () => {
    for (const key of ['frontierRepairSearchEnabled', 'fetchCandidateSources']) {
      ok(!registryKeys.has(key), `retired key ${key} should no longer be in the registry`);
    }
  });
});
