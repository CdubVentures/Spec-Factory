// WHY: Pure derivation functions that produce all settings structures from
// the unified registry. Each function is deterministic and testable.

/**
 * Derive the runtime defaults object from registry.
 * Produces: { [configKey]: default } for every entry.
 * WHY: When an alias exists (configKey != key), BOTH forms are emitted to match
 * the existing SETTINGS_DEFAULTS.runtime shape where both `resumeMode` and
 * `indexingResumeMode` coexist with identical values.
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
 * Produces: { stringMap, intMap, floatMap, boolMap, dynamicFetchPolicyMapJsonKey }
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
    dynamicFetchPolicyMapJsonKey: 'dynamicFetchPolicyMapJson',
    stringMap: Object.freeze(stringMap),
    intMap: Object.freeze(intMap),
    floatMap: Object.freeze(floatMap),
    boolMap: Object.freeze(boolMap),
  });
}

/**
 * Derive the PUT route contract.
 * Produces: { stringEnumMap, stringFreeMap, stringTrimMap, intRangeMap, floatRangeMap, boolMap, dynamicFetchPolicyMapJsonKey }
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
        // WHY: dynamicFetchPolicyMapJson is handled as a special key, not in stringFreeMap
        if (entry.key === 'dynamicFetchPolicyMapJson') break;
        stringFreeMap[entry.key] = cfgKey;
        break;
      case 'bool':
        boolMap[entry.key] = cfgKey;
        break;
      // enum, csv_enum, int, float handled by clamping maps
    }
  }
  return Object.freeze({
    dynamicFetchPolicyMapJsonKey: 'dynamicFetchPolicyMapJson',
    stringEnumMap: clampingStringEnumMap,
    stringFreeMap: Object.freeze(stringFreeMap),
    stringTrimMap: Object.freeze({ fetchSchedulerInternalsMapJson: 'fetchSchedulerInternalsMapJson' }),
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

/**
 * Derive the set of round-overridable setting keys.
 * Produces: Set<string> of keys where roundOverridable === true.
 */
export function deriveRoundOverridableSet(registry) {
  const set = new Set();
  for (const entry of registry) {
    if (entry.roundOverridable) set.add(entry.key);
  }
  return Object.freeze(set);
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
 * Produces: { timeoutMs: 'llmTimeoutMs', writeSummary: 'llmWriteSummary' }
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

/**
 * Derive the set of deprecated setting keys.
 * Produces: Set<string> of keys where deprecated === true.
 */
export function deriveDeprecatedSet(registry) {
  const set = new Set();
  for (const entry of registry) {
    if (entry.deprecated) set.add(entry.key);
  }
  return Object.freeze(set);
}

// --- Convergence registry derivations ---

const CONVERGENCE_TYPE_TO_VALUE_TYPE = { int: 'integer', float: 'number', bool: 'boolean' };

/**
 * Derive convergence defaults from registry.
 * Produces: { [key]: default } for every entry.
 */
export function deriveConvergenceDefaults(registry) {
  const defaults = {};
  for (const entry of registry) {
    defaults[entry.key] = entry.default;
  }
  return defaults;
}

/**
 * Derive convergence route contract from registry.
 * Produces: { intKeys: [...], floatKeys: [...], boolKeys: [...] }
 */
export function deriveConvergenceRouteContract(registry) {
  const intKeys = [];
  const floatKeys = [];
  const boolKeys = [];
  for (const entry of registry) {
    if (entry.type === 'int') intKeys.push(entry.key);
    else if (entry.type === 'float') floatKeys.push(entry.key);
    else if (entry.type === 'bool') boolKeys.push(entry.key);
  }
  return Object.freeze({
    intKeys: Object.freeze(intKeys),
    floatKeys: Object.freeze(floatKeys),
    boolKeys: Object.freeze(boolKeys),
  });
}

/**
 * Derive convergence value type map from registry.
 * Produces: { [key]: 'integer' | 'number' | 'boolean' }
 */
export function deriveConvergenceValueTypes(registry) {
  const types = {};
  for (const entry of registry) {
    const valueType = CONVERGENCE_TYPE_TO_VALUE_TYPE[entry.type];
    if (valueType) types[entry.key] = valueType;
  }
  return Object.freeze(types);
}

/**
 * Derive convergence key set from registry.
 * Produces: string[] of all convergence setting keys.
 */
export function deriveConvergenceKeySet(registry) {
  return registry.map(e => e.key);
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

// --- Storage registry derivations ---

/**
 * Derive storage defaults from registry.
 * WHY: Secret fields are excluded from defaults — they are never pre-populated.
 */
export function deriveStorageDefaults(registry) {
  const defaults = {};
  for (const entry of registry) {
    if (entry.secret || entry.computed) continue;
    defaults[entry.key] = entry.default;
  }
  return defaults;
}

/**
 * Derive storage option values from registry.
 * Produces: { [key]: allowed[] } for enum entries.
 */
export function deriveStorageOptionValues(registry) {
  const options = {};
  for (const entry of registry) {
    if (entry.type === 'enum' && entry.allowed) {
      options[entry.key] = [...entry.allowed];
    }
  }
  return options;
}

/**
 * Derive the mutable key allowlist for storage settings PUT.
 * WHY: Includes the key itself (for setting the value) plus clearFlag keys
 * (for explicitly clearing secrets). This produces the exact array the handler uses.
 */
const STORAGE_TYPE_TO_VALUE_TYPE = { string: 'string', bool: 'boolean', enum: 'string', string_or_null: 'string_or_null' };

/**
 * Derive storage value type map from registry.
 * Produces: { [key]: 'string' | 'boolean' | 'string_or_null' }
 */
export function deriveStorageValueTypes(registry) {
  const types = {};
  for (const entry of registry) {
    const vt = STORAGE_TYPE_TO_VALUE_TYPE[entry.type];
    if (vt) types[entry.key] = vt;
  }
  return Object.freeze(types);
}

export function deriveStorageMutableKeys(registry) {
  const keys = [];
  for (const entry of registry) {
    if (!entry.mutable) continue;
    keys.push(entry.key);
  }
  for (const entry of registry) {
    if (entry.clearFlag) keys.push(entry.clearFlag);
  }
  return keys;
}

/**
 * Derive all canonical registry keys (including secret and computed).
 * WHY: Used by sanitizers that pick from a normalized object — ensures every
 * registry key is included without manual enumeration.
 */
export function deriveStorageCanonicalKeys(registry) {
  return registry.map((entry) => entry.key);
}

/**
 * Derive secret-to-presence mapping for API responses.
 * WHY: Secret values are never returned; instead the response includes
 * `has<PascalCase>: Boolean(value)`. This produces the mapping so response
 * sanitizers can iterate instead of hardcoding each secret field.
 */
export function deriveStorageSecretPresenceMap(registry) {
  const map = [];
  for (const entry of registry) {
    if (!entry.secret) continue;
    const responseKey = 'has' + entry.key[0].toUpperCase() + entry.key.slice(1);
    map.push({ sourceKey: entry.key, responseKey });
  }
  return map;
}

/**
 * Derive clear-flag-to-key pairs from registry metadata.
 * WHY: Entries with `clearFlag` allow clients to explicitly clear a secret
 * by sending `{ [clearFlag]: true }`. The handler can loop this instead of
 * hardcoding each clear-flag name.
 */
export function deriveStorageClearFlags(registry) {
  const flags = [];
  for (const entry of registry) {
    if (!entry.clearFlag) continue;
    flags.push({ clearFlag: entry.clearFlag, key: entry.key });
  }
  return flags;
}
