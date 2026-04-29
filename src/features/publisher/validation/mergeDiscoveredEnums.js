/**
 * Merges compiled known_values with DB-discovered values.
 * Pure function — no DB, no side effects.
 *
 * @param {{ enums?: Record<string, { policy: string, values: string[] }> }|null} compiledKnownValues
 * @param {Record<string, string[]>|null} discoveredByField — { fieldKey: [value1, value2, ...] }
 * @param {Record<string, object>} fieldRules — to read enum.policy for fields with no compiled entry
 * @returns {{ enums: Record<string, { policy: string, values: string[] }>, [key: string]: * }}
 */

const BOOLEAN_ENUM_VALUES = ['yes', 'no', 'n/a'];

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase();
}

function isBooleanFieldRule(rule = {}) {
  return normalizeToken(rule?.contract?.type || rule?.type || rule?.data_type) === 'boolean';
}

function booleanEnumEntry() {
  return {
    policy: 'closed',
    values: [...BOOLEAN_ENUM_VALUES],
  };
}

export function mergeDiscoveredEnums(compiledKnownValues, discoveredByField, fieldRules) {
  const compiled = compiledKnownValues || {};
  const discovered = discoveredByField || {};
  const rules = fieldRules || {};

  // WHY: shallow-clone enums so we never mutate the caller's object
  const merged = {};
  for (const [key, entry] of Object.entries(compiled.enums || {})) {
    if (key === 'yes_no' || isBooleanFieldRule(rules[key])) {
      merged[key] = booleanEnumEntry();
      continue;
    }
    merged[key] = { policy: entry.policy, values: [...entry.values] };
  }

  for (const [fieldKey, values] of Object.entries(discovered)) {
    if (!Array.isArray(values) || values.length === 0) continue;

    if (isBooleanFieldRule(rules[fieldKey])) {
      merged[fieldKey] = booleanEnumEntry();
      continue;
    }

    if (merged[fieldKey]) {
      // WHY: dedup by lowercase to avoid "PTFE" + "ptfe" appearing twice
      const existing = new Set(merged[fieldKey].values.map(v => String(v).toLowerCase()));
      for (const v of values) {
        if (!existing.has(String(v).toLowerCase())) {
          merged[fieldKey].values.push(v);
          existing.add(String(v).toLowerCase());
        }
      }
    } else {
      const policy = rules[fieldKey]?.enum?.policy || 'open_prefer_known';
      merged[fieldKey] = { policy, values: [...values] };
    }
  }

  // WHY: preserve any non-enum properties (category, version, etc.)
  const { enums: _discarded, ...rest } = compiled;
  return { ...rest, enums: merged };
}
