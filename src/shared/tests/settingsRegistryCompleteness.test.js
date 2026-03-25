import { describe, it } from 'node:test';
import { deepStrictEqual, ok, strictEqual } from 'node:assert';

import { RUNTIME_SETTINGS_ROUTE_GET } from '../../core/config/settingsKeyMap.js';
import { RUNTIME_SETTINGS_ROUTE_PUT } from '../../features/settings-authority/runtimeSettingsRoutePut.js';
import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';
import { deriveUiCategoryMap } from '../settingsRegistryDerivations.js';

const VALID_TYPES = new Set(['string', 'int', 'float', 'bool', 'enum', 'csv_enum']);

function getRouteKeys() {
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
}

function putRouteKeys() {
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
}

describe('RUNTIME_SETTINGS_REGISTRY contract', () => {
  it('exposes unique well-formed entries', () => {
    ok(Array.isArray(RUNTIME_SETTINGS_REGISTRY));
    ok(Object.isFrozen(RUNTIME_SETTINGS_REGISTRY));
    ok(RUNTIME_SETTINGS_REGISTRY.length > 0);

    const keys = new Set();
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      ok(typeof entry.key === 'string' && entry.key.length > 0, 'each entry needs a key');
      ok(!keys.has(entry.key), `duplicate registry key: ${entry.key}`);
      keys.add(entry.key);

      ok(VALID_TYPES.has(entry.type), `${entry.key} has invalid type: ${entry.type}`);
      ok(entry.default !== undefined, `${entry.key} missing default`);

      if (entry.min != null && entry.max != null) {
        ok(entry.min <= entry.max, `${entry.key}: min (${entry.min}) > max (${entry.max})`);
      }

      if (entry.type === 'enum' || entry.type === 'csv_enum') {
        ok(Array.isArray(entry.allowed) && entry.allowed.length > 0, `${entry.key} missing allowed values`);
      }

      if (entry.configKey != null) {
        ok(typeof entry.configKey === 'string' && entry.configKey.length > 0, `${entry.key} has empty configKey`);
      }
    }
  });

  it('keeps defaultsOnly entries off the public GET and PUT surfaces', () => {
    const getKeys = getRouteKeys();
    const putKeys = putRouteKeys();
    const leaked = [];

    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.defaultsOnly) continue;
      if (getKeys.has(entry.key)) leaked.push(`${entry.key}:get`);
      if (putKeys.has(entry.key)) leaked.push(`${entry.key}:put`);
    }

    deepStrictEqual(leaked, []);
  });

  it('keeps non-defaultsOnly registry keys on GET and writable keys on PUT', () => {
    const getKeys = getRouteKeys();
    const putKeys = putRouteKeys();
    const missingGet = [];
    const missingPut = [];

    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.defaultsOnly && !getKeys.has(entry.key)) {
        missingGet.push(entry.key);
      }
      if (!entry.defaultsOnly && !entry.readOnly && !putKeys.has(entry.key)) {
        missingPut.push(entry.key);
      }
    }

    deepStrictEqual(missingGet, [], `registry keys missing from GET: ${missingGet.join(', ')}`);
    deepStrictEqual(missingPut, [], `registry keys missing from PUT: ${missingPut.join(', ')}`);
  });

  it('keeps retired runtime aliases out of the registry', () => {
    const keys = new Set(RUNTIME_SETTINGS_REGISTRY.map((entry) => entry.key));
    for (const retiredKey of ['resumeMode', 'resumeWindowHours']) {
      strictEqual(keys.has(retiredKey), false, `${retiredKey} should stay retired`);
    }
  });
});

describe('runtime settings UI metadata contract', () => {
  it('assigns category and section metadata to UI-exposed runtime entries', () => {
    const missing = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (entry.defaultsOnly || entry.readOnly) continue;
      if (!entry.uiCategory || !entry.uiSection) missing.push(entry.key);
    }
    deepStrictEqual(missing, [], `entries missing UI metadata: ${missing.join(', ')}`);
  });

  it('keeps disabledBy references inside the registry', () => {
    const keys = new Set(RUNTIME_SETTINGS_REGISTRY.map((entry) => entry.key));
    const broken = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.disabledBy) continue;
      if (!keys.has(entry.disabledBy)) {
        broken.push(`${entry.key}:${entry.disabledBy}`);
      }
    }
    deepStrictEqual(broken, [], `broken disabledBy refs: ${broken.join(', ')}`);
  });

  it('requires uiTip on every UI-exposed entry', () => {
    const missing = [];
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.uiCategory) continue;
      if (!entry.uiTip || typeof entry.uiTip !== 'string' || entry.uiTip.trim().length === 0) {
        missing.push(entry.key);
      }
    }
    deepStrictEqual(missing, [], `entries missing uiTip tooltip: ${missing.join(', ')}`);
  });

  it('requires uiGroup on non-hero entries when a section has 5+ non-hero entries', () => {
    // WHY: Sections with many settings must group them into collapsible blocks.
    // Hero entries are exempt (they render above the groups with blue bg).
    const sectionNonHeroes = {};
    for (const entry of RUNTIME_SETTINGS_REGISTRY) {
      if (!entry.uiCategory || entry.uiHero) continue;
      const sectionKey = `${entry.uiCategory}/${entry.uiSection}`;
      if (!sectionNonHeroes[sectionKey]) sectionNonHeroes[sectionKey] = [];
      sectionNonHeroes[sectionKey].push(entry);
    }

    const ungrouped = [];
    for (const [sectionKey, entries] of Object.entries(sectionNonHeroes)) {
      if (entries.length < 5) continue;
      for (const entry of entries) {
        if (!entry.uiGroup) ungrouped.push(`${sectionKey}:${entry.key}`);
      }
    }
    deepStrictEqual(ungrouped, [], `non-hero entries in large sections missing uiGroup: ${ungrouped.join(', ')}`);
  });

  it('derives non-empty UI category buckets without dropping tagged entries', () => {
    const taggedKeys = RUNTIME_SETTINGS_REGISTRY
      .filter((entry) => entry.uiCategory)
      .map((entry) => entry.key)
      .sort();
    const categoryMap = deriveUiCategoryMap(RUNTIME_SETTINGS_REGISTRY);
    const derivedKeys = [];

    for (const [category, sections] of Object.entries(categoryMap)) {
      ok(category.length > 0, 'uiCategory keys must be non-empty');
      ok(Object.keys(sections).length > 0, `${category} should include at least one section`);
      for (const [section, entries] of Object.entries(sections)) {
        ok(section.length > 0, `${category} should not expose an empty uiSection`);
        ok(entries.length > 0, `${category}/${section} should include at least one entry`);
        for (const entry of entries) derivedKeys.push(entry.key);
      }
    }

    deepStrictEqual(derivedKeys.sort(), taggedKeys);
  });
});
