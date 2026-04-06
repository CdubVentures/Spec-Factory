import { projectFieldRulesForConsumer, resolveConsumerGate } from '../../../../field-rules/consumerGate.js';

import { isObject, normalizeText } from '../../../../shared/primitives.js';
export { isObject, normalizeText };

export function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

export function readPathValue(target, pathSegments = []) {
  let cursor = target;
  for (const segment of pathSegments) {
    if (!isObject(cursor) || !hasOwn(cursor, segment)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

export function hasPathValue(target, pathSegments = []) {
  if (!pathSegments.length) return false;
  let cursor = target;
  for (const segment of pathSegments) {
    if (!isObject(cursor) || !hasOwn(cursor, segment)) {
      return false;
    }
    cursor = cursor[segment];
  }
  return true;
}

export function countRuleValues(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry))
      .filter(Boolean)
      .length;
  }
  return normalizeText(value) ? 1 : 0;
}

export function countEffectiveDomainRuleValues(value) {
  const rows = Array.isArray(value) ? value : [value];
  return rows
    .map((entry) => normalizeText(entry).toLowerCase())
    .filter((entry) => entry.includes('.'))
    .length;
}

export const FIELD_RULE_GATE_SPECS = [
  { key: 'search_hints.query_terms', name: 'query_terms', path: ['search_hints', 'query_terms'] },
  { key: 'search_hints.domain_hints', name: 'domain_hints', path: ['search_hints', 'domain_hints'] },
  { key: 'search_hints.content_types', name: 'content_types', path: ['search_hints', 'content_types'] },
];

export function buildFieldRuleGateCountsFromRules(fieldRulesPayload = {}) {
  const fields = fieldRulesPayload?.fields || fieldRulesPayload?.rules?.fields;
  if (!isObject(fields)) {
    return {};
  }

  const out = {};
  for (const spec of FIELD_RULE_GATE_SPECS) {
    let valueCount = 0;
    let totalValueCount = 0;
    let enabledFieldCount = 0;
    let disabledFieldCount = 0;
    for (const rule of Object.values(fields)) {
      if (!isObject(rule)) continue;
      const gate = resolveConsumerGate(rule, spec.key, 'indexlab');
      const hasPath = hasPathValue(rule, spec.path);
      if (!hasPath && !gate.explicit) {
        continue;
      }
      if (!gate.enabled) {
        disabledFieldCount += 1;
        continue;
      }
      enabledFieldCount += 1;
      const hintValue = readPathValue(rule, spec.path);
      const rawCount = countRuleValues(hintValue);
      const effectiveCount = spec.name === 'domain_hints'
        ? countEffectiveDomainRuleValues(hintValue)
        : rawCount;
      valueCount += effectiveCount;
      totalValueCount += rawCount;
    }
    const status = disabledFieldCount > 0 && enabledFieldCount === 0
      ? 'off'
      : (valueCount > 0 ? 'active' : 'zero');
    const gateRow = {
      value_count: valueCount,
      total_value_count: totalValueCount,
      effective_value_count: valueCount,
      enabled_field_count: enabledFieldCount,
      disabled_field_count: disabledFieldCount,
      status,
    };
    out[spec.key] = gateRow;
  }
  return out;
}

export function buildFieldRuleHintCountsByFieldFromRules(fieldRulesPayload = {}) {
  const fields = fieldRulesPayload?.fields || fieldRulesPayload?.rules?.fields;
  if (!isObject(fields)) {
    return {};
  }

  const out = {};
  for (const [fieldKey, rule] of Object.entries(fields)) {
    if (!isObject(rule)) continue;
    const row = {};
    for (const spec of FIELD_RULE_GATE_SPECS) {
      const gate = resolveConsumerGate(rule, spec.key, 'indexlab');
      const hasPath = hasPathValue(rule, spec.path);
      const hintValue = gate.enabled && hasPath
        ? readPathValue(rule, spec.path)
        : undefined;
      const rawValueCount = gate.enabled && hasPath
        ? countRuleValues(hintValue)
        : 0;
      const valueCount = spec.name === 'domain_hints'
        ? countEffectiveDomainRuleValues(hintValue)
        : rawValueCount;
      row[spec.name] = {
        value_count: valueCount,
        total_value_count: rawValueCount,
        effective_value_count: valueCount,
        status: gate.enabled
          ? (valueCount > 0 ? 'active' : 'zero')
          : 'off',
      };
    }
    out[fieldKey] = row;
  }
  return out;
}

export function hasFieldRuleGateCounts(profile = {}) {
  if (!isObject(profile)) return false;
  const counts = profile.field_rule_gate_counts;
  if (!isObject(counts)) return false;
  return Object.keys(counts).length > 0;
}

export function hasFieldRuleHintCountsByField(profile = {}) {
  if (!isObject(profile)) return false;
  const counts = profile.field_rule_hint_counts_by_field;
  if (!isObject(counts)) return false;
  return Object.keys(counts).length > 0;
}

export async function hydrateFieldRuleGateCounts({
  searchProfile,
  fieldRulesPayload,
}) {
  if (
    !isObject(searchProfile)
    || (hasFieldRuleGateCounts(searchProfile) && hasFieldRuleHintCountsByField(searchProfile))
  ) {
    return searchProfile;
  }
  if (!isObject(fieldRulesPayload)) {
    return searchProfile;
  }

  const needsGateCounts = !hasFieldRuleGateCounts(searchProfile);
  const needsByFieldCounts = !hasFieldRuleHintCountsByField(searchProfile);
  const gateCounts = needsGateCounts ? buildFieldRuleGateCountsFromRules(fieldRulesPayload) : null;
  const byFieldCounts = needsByFieldCounts ? buildFieldRuleHintCountsByFieldFromRules(fieldRulesPayload) : null;
  if (
    (gateCounts && Object.keys(gateCounts).length > 0)
    || (byFieldCounts && Object.keys(byFieldCounts).length > 0)
  ) {
    return {
      ...searchProfile,
      ...(gateCounts && Object.keys(gateCounts).length > 0 ? { field_rule_gate_counts: gateCounts } : {}),
      ...(byFieldCounts && Object.keys(byFieldCounts).length > 0 ? { field_rule_hint_counts_by_field: byFieldCounts } : {}),
    };
  }
  return searchProfile;
}

// WHY: Reads compiled field rules from field_studio_map (the single SSOT)
// and projects for the indexlab consumer.
export async function loadRuntimeFieldRulesPayload({ specDb }) {
  if (!specDb) return null;
  const compiledRules = specDb.getCompiledRules();
  if (!isObject(compiledRules)) return null;
  return projectFieldRulesForConsumer(compiledRules, 'indexlab');
}
