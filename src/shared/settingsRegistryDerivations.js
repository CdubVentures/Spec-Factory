// WHY: Pure derivation functions that produce all settings structures from
// the unified registry. Each function is deterministic and testable.

/**
 * Derive the runtime defaults object from registry.
 * Produces: { [configKey]: default } for every entry.
 * WHY: When an alias exists (configKey != key), BOTH forms are emitted so
 * downstream consumers can read either name with identical values.
 */
export function deriveRuntimeDefaults(registry) {
  const defaults = {};
  for (const entry of registry) {
    // WHY: routeOnly keys exist in route contracts but not in SETTINGS_DEFAULTS
    if (entry.routeOnly) continue;
    const cfgKey = entry.configKey || entry.key;
    defaults[cfgKey] = entry.default;
    // WHY: Aliased keys must appear under BOTH names in defaults
    if (entry.configKey && entry.configKey !== entry.key) {
      defaults[entry.key] = entry.default;
    }
  }
  return defaults;
}

/**
 * Derive option values for enum/csv_enum types.
 * Produces: { [feKey]: allowed[] } matching SETTINGS_OPTION_VALUES.runtime shape.
 */
export function deriveOptionValues(registry) {
  const options = {};
  for (const entry of registry) {
    if ((entry.type === 'enum' || entry.type === 'csv_enum') && entry.allowed) {
      options[entry.key] = entry.allowed;
    }
  }
  return options;
}

/**
 * Derive the int clamping range map.
 * Produces: { [feKey]: { configKey, min, max } } matching SETTINGS_CLAMPING_INT_RANGE_MAP.
 */
export function deriveClampingIntRangeMap(registry) {
  const map = {};
  for (const entry of registry) {
    if (entry.type !== 'int') continue;
    if (entry.min == null || entry.max == null) continue;
    map[entry.key] = Object.freeze({
      configKey: entry.configKey || entry.key,
      min: entry.min,
      max: entry.max,
    });
  }
  return Object.freeze(map);
}

/**
 * Derive the float clamping range map.
 * Produces: { [feKey]: { configKey, min, max } } matching SETTINGS_CLAMPING_FLOAT_RANGE_MAP.
 */
export function deriveClampingFloatRangeMap(registry) {
  const map = {};
  for (const entry of registry) {
    if (entry.type !== 'float') continue;
    if (entry.min == null || entry.max == null) continue;
    map[entry.key] = Object.freeze({
      configKey: entry.configKey || entry.key,
      min: entry.min,
      max: entry.max,
    });
  }
  return Object.freeze(map);
}

/**
 * Derive the string enum clamping map.
 * Produces: { [feKey]: { configKey, allowed, csv? } } matching SETTINGS_CLAMPING_STRING_ENUM_MAP.
 */
export function deriveClampingStringEnumMap(registry) {
  const map = {};
  for (const entry of registry) {
    if (entry.type !== 'enum' && entry.type !== 'csv_enum') continue;
    if (!entry.allowed) continue;
    const descriptor = {
      configKey: entry.configKey || entry.key,
      allowed: entry.allowed,
    };
    if (entry.type === 'csv_enum') descriptor.csv = true;
    map[entry.key] = Object.freeze(descriptor);
  }
  return Object.freeze(map);
}

/**
 * Derive the GET route maps.
 * Produces: { stringMap, intMap, floatMap, boolMap }
 * matching RUNTIME_SETTINGS_ROUTE_GET shape.
 */
export function deriveRouteGetMaps(registry) {
  const stringMap = {};
  const intMap = {};
  const floatMap = {};
  const boolMap = {};
  for (const entry of registry) {
    if (entry.defaultsOnly) continue;
    const cfgKey = entry.configKey || entry.key;
    switch (entry.type) {
      case 'string':
      case 'enum':
      case 'csv_enum':
        stringMap[entry.key] = cfgKey;
        break;
      case 'int':
        intMap[entry.key] = cfgKey;
        break;
      case 'float':
        floatMap[entry.key] = cfgKey;
        break;
      case 'bool':
        boolMap[entry.key] = cfgKey;
        break;
    }
  }
  return Object.freeze({
    stringMap: Object.freeze(stringMap),
    intMap: Object.freeze(intMap),
    floatMap: Object.freeze(floatMap),
    boolMap: Object.freeze(boolMap),
  });
}

/**
 * Derive the PUT route contract.
 * Produces: { stringEnumMap, stringFreeMap, stringTrimMap, intRangeMap, floatRangeMap, boolMap }
 * matching RUNTIME_SETTINGS_ROUTE_PUT shape. Excludes readOnly entries.
 */
export function deriveRoutePutContract(registry, { clampingIntRangeMap, clampingFloatRangeMap, clampingStringEnumMap }) {
  const stringFreeMap = {};
  const boolMap = {};
  for (const entry of registry) {
    if (entry.readOnly || entry.defaultsOnly) continue;
    const cfgKey = entry.configKey || entry.key;
    switch (entry.type) {
      case 'string':
        stringFreeMap[entry.key] = cfgKey;
        break;
      case 'bool':
        boolMap[entry.key] = cfgKey;
        break;
      // enum, csv_enum, int, float handled by clamping maps
    }
  }
  return Object.freeze({
    stringEnumMap: clampingStringEnumMap,
    stringFreeMap: Object.freeze(stringFreeMap),
    stringTrimMap: Object.freeze({}),
    intRangeMap: clampingIntRangeMap,
    floatRangeMap: clampingFloatRangeMap,
    boolMap: Object.freeze(boolMap),
  });
}

/**
 * Derive the value type map.
 * Produces: { [cfgKey]: typeToken } matching RUNTIME_SETTINGS_VALUE_TYPES.
 */
export function deriveValueTypeMap(registry) {
  const typeMap = {};
  for (const entry of registry) {
    const cfgKey = entry.configKey || entry.key;
    switch (entry.type) {
      case 'string':
      case 'enum':
      case 'csv_enum':
        typeMap[cfgKey] = 'string';
        break;
      case 'int':
        typeMap[cfgKey] = 'integer';
        break;
      case 'float':
        typeMap[cfgKey] = 'number';
        break;
      case 'bool':
        typeMap[cfgKey] = 'boolean';
        break;
    }
  }
  return Object.freeze(typeMap);
}

// --- Manifest derivation (Phase 2 SSOT) ---

const REGISTRY_TO_MANIFEST_TYPE = Object.freeze({
  int: 'integer',
  float: 'number',
  bool: 'boolean',
  string: 'string',
  enum: 'string',
  csv_enum: 'string',
});

/**
 * Derive miscGroup manifest entries from registry.
 * Produces: frozen array of { key, defaultValue, type, secret, userMutable, description }
 * matching the shape expected by CONFIG_MANIFEST consumers.
 * WHY: Eliminates 81 hand-maintained entries that drifted from registry defaults.
 */
export function deriveMiscGroupEntries(registry) {
  const entries = [];
  for (const entry of registry) {
    if (!entry.envKey) continue;
    if (entry.routeOnly) continue;
    entries.push(Object.freeze({
      key: entry.envKey,
      defaultValue: String(entry.default ?? ''),
      type: REGISTRY_TO_MANIFEST_TYPE[entry.type] || 'string',
      secret: !!entry.secret,
      userMutable: false,
      description: 'System-level setting. User/domain-generated values must not be stored here.',
    }));
  }
  return Object.freeze(entries);
}

/**
 * Derive the full CONFIG_MANIFEST group array from a combined registry.
 * @param {Array} registry - Combined [...RUNTIME_SETTINGS_REGISTRY, ...BOOTSTRAP_ENV_REGISTRY]
 * @param {Array} groupMeta - Array of { id, title, notes } defining group order and metadata
 * @param {Object} [computedDefaults] - Optional { envKey: value } overrides for platform-specific defaults
 * @returns {ReadonlyArray} Frozen manifest groups, each with { id, title, notes, entries[] }
 * WHY: Eliminates 10 hardcoded manifest group files. Single derivation from registry SSOT.
 */
export function deriveManifestGroups(registry, groupMeta, computedDefaults = {}) {
  const byGroup = new Map(groupMeta.map(g => [g.id, { ...g, entries: [] }]));

  for (const entry of registry) {
    if (!entry.envKey) continue;
    if (entry.routeOnly) continue;
    const groupId = entry.group || 'misc';
    const target = byGroup.get(groupId) || byGroup.get('misc');
    const override = computedDefaults[entry.envKey];
    target.entries.push(Object.freeze({
      key: entry.envKey,
      defaultValue: override !== undefined ? String(override) : String(entry.default ?? ''),
      type: REGISTRY_TO_MANIFEST_TYPE[entry.type] || 'string',
      secret: !!entry.secret,
      userMutable: false,
      description: 'System-level setting.',
    }));
  }

  return Object.freeze(
    groupMeta
      .map(g => Object.freeze({ ...byGroup.get(g.id), entries: Object.freeze(byGroup.get(g.id).entries) }))
      .filter(g => g.entries.length > 0)
  );
}

// --- Plan 03: New derivation functions for SSOT rewrite ---

/**
 * Derive the envKey map from registry.
 * Produces: { [settingKey]: 'ENV_VAR_NAME' } for entries with non-empty envKey.
 */
export function deriveEnvKeyMap(registry) {
  const map = {};
  for (const entry of registry) {
    if (entry.envKey) {
      map[entry.key] = entry.envKey;
    }
  }
  return Object.freeze(map);
}

/**
 * Derive the configKey map from registry.
 * Produces: { [settingKey]: 'configKey' } for all entries.
 */
export function deriveConfigKeyMap(registry) {
  const map = {};
  for (const entry of registry) {
    map[entry.key] = entry.configKey || entry.key;
  }
  return Object.freeze(map);
}

// ── LLM Policy derivations ──────────────────────────────────────────────

/**
 * Derive the LLM policy group map from policyGroup/policyField metadata.
 * Produces: { models: { plan: 'llmModelPlan', ... }, tokens: { ... }, ... }
 * Excludes special groups (_topLevel, _json).
 */
export function deriveLlmPolicyGroupMap(registry) {
  const groups = {};
  for (const entry of registry) {
    if (!entry.policyGroup || entry.policyGroup.startsWith('_')) continue;
    const g = entry.policyGroup;
    if (!groups[g]) groups[g] = {};
    groups[g][entry.policyField] = entry.key;
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(groups).map(([k, v]) => [k, Object.freeze(v)])
  ));
}

/**
 * Derive top-level scalar LLM policy keys (policyGroup === '_topLevel').
 * Produces: { timeoutMs: 'llmTimeoutMs' }
 */
export function deriveLlmPolicyTopLevelKeys(registry) {
  const map = {};
  for (const entry of registry) {
    if (entry.policyGroup !== '_topLevel') continue;
    map[entry.policyField] = entry.key;
  }
  return Object.freeze(map);
}

/**
 * Derive JSON-serialized LLM policy keys (policyGroup === '_json').
 * Produces: { phaseOverrides: 'llmPhaseOverridesJson', providerRegistry: 'llmProviderRegistryJson' }
 */
export function deriveLlmPolicyJsonKeys(registry) {
  const map = {};
  for (const entry of registry) {
    if (entry.policyGroup !== '_json') continue;
    map[entry.policyField] = entry.key;
  }
  return Object.freeze(map);
}

/**
 * Derive flat-key → env-var mapping for all LLM policy entries with non-empty envKey.
 * Produces: { llmModelPlan: 'LLM_MODEL_PLAN', ... }
 */
export function deriveLlmPolicyFlatKeyToEnv(registry) {
  const map = {};
  for (const entry of registry) {
    if (!entry.policyGroup) continue;
    if (entry.envKey) map[entry.key] = entry.envKey;
  }
  return Object.freeze(map);
}

/**
 * Derive default flat-key values for all LLM policy entries.
 * Produces: { llmModelPlan: 'gemini-2.5-flash', llmMaxOutputTokens: 1400, ... }
 */
export function deriveLlmPolicyDefaults(registry) {
  const flat = {};
  for (const entry of registry) {
    if (!entry.policyGroup) continue;
    flat[entry.key] = entry.default;
  }
  return flat;
}

// --- UI registry derivations ---

const UI_TYPE_TO_VALUE_TYPE = { bool: 'boolean', int: 'integer', float: 'number', string: 'string', enum: 'string' };

/**
 * Derive UI defaults from registry.
 * Produces: { [key]: default } for every entry.
 */
export function deriveUiDefaults(registry) {
  const defaults = {};
  for (const entry of registry) {
    defaults[entry.key] = entry.default;
  }
  return defaults;
}

/**
 * Derive UI value type map from registry.
 * Produces: { [key]: 'boolean' | 'integer' | 'number' | 'string' }
 */
export function deriveUiValueTypes(registry) {
  const types = {};
  for (const entry of registry) {
    const valueType = UI_TYPE_TO_VALUE_TYPE[entry.type];
    if (valueType) types[entry.key] = valueType;
  }
  return Object.freeze(types);
}

/**
 * Derive UI mutable key allowlist from registry.
 * Produces: string[] of keys where mutable: true.
 */
export function deriveUiMutableKeys(registry) {
  const keys = [];
  for (const entry of registry) {
    if (!entry.mutable) continue;
    keys.push(entry.key);
  }
  return keys;
}

// --- UI category derivations (pipeline settings reorganization) ---

/**
 * Derive the UI category map from registry.
 * Produces: { [uiCategory]: { [uiSection]: RegistryEntry[] } }
 * Entries without uiCategory are excluded.
 */
export function deriveUiCategoryMap(registry) {
  const map = {};
  for (const entry of registry) {
    if (!entry.uiCategory) continue;
    if (!map[entry.uiCategory]) map[entry.uiCategory] = {};
    const section = entry.uiSection || '_default';
    if (!map[entry.uiCategory][section]) map[entry.uiCategory][section] = [];
    map[entry.uiCategory][section].push(entry);
  }
  // Sort entries within each section by uiOrder
  for (const cat of Object.values(map)) {
    for (const entries of Object.values(cat)) {
      entries.sort((a, b) => (a.uiOrder ?? 999) - (b.uiOrder ?? 999));
    }
  }
  return map;
}

