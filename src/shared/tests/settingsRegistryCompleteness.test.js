import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';
import { RUNTIME_SETTINGS_ROUTE_GET } from '../../core/config/settingsKeyMap.js';
import { RUNTIME_SETTINGS_ROUTE_PUT } from '../../features/settings-authority/runtimeSettingsRoutePut.js';

// WHY: This test locks down the structural completeness of the settings registry
// before the SSOT rewrite. Every registry key must have a clear classification.

const VALID_TYPES = new Set(['string', 'int', 'float', 'bool', 'enum', 'csv_enum']);

const allGetKeys = () => {
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

const allPutKeys = () => {
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
  if (RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey) {
    keys.add(RUNTIME_SETTINGS_ROUTE_PUT.dynamicFetchPolicyMapJsonKey);
  }
  return keys;
};

describe('settingsRegistryCompleteness — Plan 02 characterization', () => {

  // --- Structural invariants ---

  it('registry is a frozen non-empty array', () => {
    ok(Array.isArray(RUNTIME_SETTINGS_REGISTRY));
    ok(Object.isFrozen(RUNTIME_SETTINGS_REGISTRY));
    ok(RUNTIME_SETTINGS_REGISTRY.length >= 90, `expected >= 90, got ${RUNTIME_SETTINGS_REGISTRY.length}`);
  });

  it('every entry has a unique key', () => {
    const keys = RUNTIME_SETTINGS_REGISTRY.map(e => e.key);
    const unique = new Set(keys);
    strictEqual(unique.size, keys.length, `duplicate keys found: ${keys.filter((k, i) => keys.indexOf(k) !== i)}`);
  });

  it('every entry has a valid type', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      ok(VALID_TYPES.has(entry.type), `${entry.key} has invalid type: ${entry.type}`);
    }
  });

  it('every entry has a default value', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      ok(entry.default !== undefined, `${entry.key} missing default`);
    }
  });

  it('every int entry with min/max has min <= max', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.type !== 'int') continue;
      if (entry.min == null || entry.max == null) continue;
      ok(entry.min <= entry.max, `${entry.key}: min (${entry.min}) > max (${entry.max})`);
    }
  });

  it('every float entry with min/max has min <= max', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.type !== 'float') continue;
      if (entry.min == null || entry.max == null) continue;
      ok(entry.min <= entry.max, `${entry.key}: min (${entry.min}) > max (${entry.max})`);
    }
  });

  it('every enum/csv_enum entry has non-empty allowed array', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.type !== 'enum' && entry.type !== 'csv_enum') continue;
      ok(Array.isArray(entry.allowed) && entry.allowed.length > 0, `${entry.key} missing allowed values`);
    }
  });

  it('entries with configKey !== key use configKey for alias resolution', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.configKey || entry.configKey === entry.key) continue;
      ok(typeof entry.configKey === 'string' && entry.configKey.length > 0, `${entry.key} has empty configKey`);
    }
  });

  // --- Classification invariants ---

  it('readOnly entries are exactly awsRegion and s3Bucket', () => {
    const readOnlyKeys = RUNTIME_SETTINGS_REGISTRY
      .filter(e => e.readOnly)
      .map(e => e.key)
      .sort();
    deepStrictEqual(readOnlyKeys, ['awsRegion', 's3Bucket']);
  });

  it('defaultsOnly entries are exactly the known set', () => {
    const defaultsOnlyKeys = RUNTIME_SETTINGS_REGISTRY
      .filter(e => e.defaultsOnly)
      .map(e => e.key)
      .sort();
    deepStrictEqual(defaultsOnlyKeys, [
      'discoveryEnabled',
    ]);
  });

  it('secret entries include all known API key fields', () => {
    const secretKeys = new Set(
      RUNTIME_SETTINGS_REGISTRY.filter(e => e.secret).map(e => e.key)
    );
    for (const expected of [
      'anthropicApiKey', 'deepseekApiKey', 'geminiApiKey',
      'openaiApiKey', 'llmPlanApiKey',
    ]) {
      ok(secretKeys.has(expected), `${expected} should be marked secret`);
    }
  });

  it('no entry has both readOnly and defaultsOnly', () => {
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      ok(
        !(entry.readOnly && entry.defaultsOnly),
        `${entry.key} has both readOnly and defaultsOnly`
      );
    }
  });

  it('readOnly entries do NOT appear in PUT contract', () => {
    const putKeys = allPutKeys();
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.readOnly) continue;
      ok(!putKeys.has(entry.key), `readOnly key ${entry.key} appears in PUT contract`);
    }
  });

  it('defaultsOnly entries do NOT appear in GET or PUT contracts', () => {
    const getKeys = allGetKeys();
    const putKeys = allPutKeys();
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.defaultsOnly) continue;
      ok(!getKeys.has(entry.key), `defaultsOnly key ${entry.key} appears in GET contract`);
      ok(!putKeys.has(entry.key), `defaultsOnly key ${entry.key} appears in PUT contract`);
    }
  });

  // --- Route coverage ---

  it('every non-defaultsOnly, non-routeOnly registry key appears in GET', () => {
    const getKeys = allGetKeys();
    const missing = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.defaultsOnly) continue;
      if (!getKeys.has(entry.key)) missing.push(entry.key);
    }
    deepStrictEqual(missing, [], `registry keys missing from GET: ${missing.join(', ')}`);
  });

  it('every non-readOnly, non-defaultsOnly registry key appears in PUT (or is the special dynamicFetchPolicyMapJson)', () => {
    const putKeys = allPutKeys();
    const missing = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.readOnly || entry.defaultsOnly) continue;
      if (!putKeys.has(entry.key)) missing.push(entry.key);
    }
    deepStrictEqual(missing, [], `registry keys missing from PUT: ${missing.join(', ')}`);
  });

  // --- Known aliases ---

  it('known cfgKey aliases exist in registry', () => {
    const KNOWN_ALIASES = {
      resumeMode: 'indexingResumeMode',
      resumeWindowHours: 'indexingResumeMaxAgeHours',
    };
    for (const [key, cfgKey] of Object.entries(KNOWN_ALIASES)) {
      const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === key);
      ok(entry, `alias key ${key} not found in registry`);
      strictEqual(entry.configKey, cfgKey, `${key} configKey mismatch: expected ${cfgKey}, got ${entry.configKey}`);
    }
  });

  // --- Dead knob documentation ---

  it('documents known dead/legacy knobs exist in registry (pre-retirement baseline)', () => {
    const knownDead = ['runtimeTraceLlmRing'];
    for (const key of knownDead) {
      const entry = RUNTIME_SETTINGS_REGISTRY.find(e => e.key === key);
      ok(entry, `dead knob ${key} should exist in registry before retirement`);
    }
  });

  // --- Count baselines ---

  it('total registry count baseline', () => {
    const total = RUNTIME_SETTINGS_REGISTRY.length;
    // WHY: Lock down the count so adding/removing entries requires updating this test.
    ok(total >= 90 && total <= 110, `expected 90-110 entries, got ${total}`);
  });

  it('type distribution baseline', () => {
    const counts = { string: 0, int: 0, float: 0, bool: 0, enum: 0, csv_enum: 0 };
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      counts[entry.type] = (counts[entry.type] || 0) + 1;
    }
    ok(counts.string >= 25, `expected >= 25 strings, got ${counts.string}`);
    ok(counts.int >= 35, `expected >= 35 ints, got ${counts.int}`);
    ok(counts.float >= 5, `expected >= 5 floats, got ${counts.float}`);
    ok(counts.bool >= 17, `expected >= 17 bools, got ${counts.bool}`);
    ok(counts.enum >= 3, `expected >= 3 enums, got ${counts.enum}`);
    ok(counts.csv_enum >= 2, `expected >= 2 csv_enums, got ${counts.csv_enum}`);
  });
});

// WHY: These tests lock down the UI metadata contract added for the registry-driven
// settings page. Every user-facing setting must route to exactly one category/section.
const VALID_UI_CATEGORIES = new Set(['flow', 'planner', 'fetcher', 'extraction', 'validation']);

describe('settingsRegistry — UI metadata contract', () => {

  it('every non-defaultsOnly, non-readOnly entry has a uiCategory', () => {
    const missing = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.defaultsOnly || entry.readOnly) continue;
      if (!entry.uiCategory) missing.push(entry.key);
    }
    deepStrictEqual(missing, [], `entries missing uiCategory: ${missing.join(', ')}`);
  });

  it('every entry with uiCategory also has uiSection', () => {
    const missing = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.uiCategory) continue;
      if (!entry.uiSection) missing.push(entry.key);
    }
    deepStrictEqual(missing, [], `entries with uiCategory but missing uiSection: ${missing.join(', ')}`);
  });

  it('uiCategory values are from the allowed set', () => {
    const invalid = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.uiCategory) continue;
      if (!VALID_UI_CATEGORIES.has(entry.uiCategory)) {
        invalid.push(`${entry.key} has uiCategory "${entry.uiCategory}"`);
      }
    }
    deepStrictEqual(invalid, [], `invalid uiCategory values: ${invalid.join(', ')}`);
  });

  it('every disabledBy value references an existing setting key', () => {
    const allKeys = new Set(RUNTIME_SETTINGS_REGISTRY.map(e => e.key));
    const broken = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.disabledBy) continue;
      if (!allKeys.has(entry.disabledBy)) {
        broken.push(`${entry.key} disabledBy "${entry.disabledBy}" does not exist`);
      }
    }
    deepStrictEqual(broken, [], `broken disabledBy refs: ${broken.join(', ')}`);
  });

  it('readOnly entries also have uiCategory and uiSection', () => {
    const missing = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.readOnly) continue;
      if (!entry.uiCategory || !entry.uiSection) missing.push(entry.key);
    }
    deepStrictEqual(missing, [], `readOnly entries missing UI metadata: ${missing.join(', ')}`);
  });

  it('defaultsOnly entries also have uiCategory and uiSection', () => {
    const missing = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.defaultsOnly) continue;
      if (!entry.uiCategory || !entry.uiSection) missing.push(entry.key);
    }
    deepStrictEqual(missing, [], `defaultsOnly entries missing UI metadata: ${missing.join(', ')}`);
  });
});
