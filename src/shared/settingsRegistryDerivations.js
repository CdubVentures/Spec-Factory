// WHY: Pure derivation functions that produce all settings structures from
// the unified registry. Each function is deterministic and testable.

/**
 * Derive the runtime defaults object from registry.
 * Produces: { [cfgKey]: default } for every entry.
 * WHY: When an alias exists (cfgKey != key), BOTH forms are emitted to match
 * the existing SETTINGS_DEFAULTS.runtime shape where both `resumeMode` and
 * `indexingResumeMode` coexist with identical values.
 */
export function deriveRuntimeDefaults(registry) {
  const defaults = {};
  for (const entry of registry) {
    // WHY: routeOnly keys exist in route contracts but not in SETTINGS_DEFAULTS
    if (entry.routeOnly) continue;
    const cfgKey = entry.cfgKey || entry.key;
    defaults[cfgKey] = entry.default;
    // WHY: Aliased keys must appear under BOTH names in defaults
    if (entry.cfgKey && entry.cfgKey !== entry.key) {
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
 * Produces: { [feKey]: { cfgKey, min, max } } matching SETTINGS_CLAMPING_INT_RANGE_MAP.
 */
export function deriveClampingIntRangeMap(registry) {
  const map = {};
  for (const entry of registry) {
    if (entry.type !== 'int') continue;
    if (entry.min == null || entry.max == null) continue;
    map[entry.key] = Object.freeze({
      cfgKey: entry.cfgKey || entry.key,
      min: entry.min,
      max: entry.max,
    });
  }
  return Object.freeze(map);
}

/**
 * Derive the float clamping range map.
 * Produces: { [feKey]: { cfgKey, min, max } } matching SETTINGS_CLAMPING_FLOAT_RANGE_MAP.
 */
export function deriveClampingFloatRangeMap(registry) {
  const map = {};
  for (const entry of registry) {
    if (entry.type !== 'float') continue;
    if (entry.min == null || entry.max == null) continue;
    map[entry.key] = Object.freeze({
      cfgKey: entry.cfgKey || entry.key,
      min: entry.min,
      max: entry.max,
    });
  }
  return Object.freeze(map);
}

/**
 * Derive the string enum clamping map.
 * Produces: { [feKey]: { cfgKey, allowed, csv? } } matching SETTINGS_CLAMPING_STRING_ENUM_MAP.
 */
export function deriveClampingStringEnumMap(registry) {
  const map = {};
  for (const entry of registry) {
    if (entry.type !== 'enum' && entry.type !== 'csv_enum') continue;
    if (!entry.allowed) continue;
    const descriptor = {
      cfgKey: entry.cfgKey || entry.key,
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
    const cfgKey = entry.cfgKey || entry.key;
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
    const cfgKey = entry.cfgKey || entry.key;
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
    const cfgKey = entry.cfgKey || entry.key;
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
    map[entry.key] = entry.configKey || entry.cfgKey || entry.key;
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
