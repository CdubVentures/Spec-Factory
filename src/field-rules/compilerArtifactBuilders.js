/**
 * Artifact builder functions for the compiler pipeline.
 * Builds parse templates, cross-validation rules, field groups, and audits field metadata.
 */

import {
  isObject, toArray, normalizeFieldKey, asNumber, pickGeneratedAt
} from './compilerPrimitives.js';

export function normalizePatterns(value) {
  const out = [];
  for (const item of toArray(value)) {
    if (typeof item === 'string') {
      if (item.trim()) {
        out.push({ regex: item.trim(), group: 1 });
      }
      continue;
    }
    if (!isObject(item)) {
      continue;
    }
    if (typeof item.regex === 'string' && item.regex.trim()) {
      out.push({
        regex: item.regex.trim(),
        group: Number.isFinite(Number(item.group)) ? Number(item.group) : 1,
        ...(item.convert ? { convert: String(item.convert) } : {})
      });
    }
  }
  return out;
}

export function buildParseTemplates(fieldRules = {}) {
  const fields = isObject(fieldRules.fields) ? fieldRules.fields : {};
  const templateLibrary = isObject(fieldRules.parse_templates) ? fieldRules.parse_templates : {};
  const templates = {};

  for (const [fieldKeyRaw, fieldRule] of Object.entries(fields)) {
    const fieldKey = normalizeFieldKey(fieldKeyRaw);
    if (!fieldKey || !isObject(fieldRule)) {
      continue;
    }
    const parse = isObject(fieldRule.parse) ? fieldRule.parse : {};
    const typeName = String(fieldRule?.contract?.type || 'string').trim();
    const templateDef = isObject(templateLibrary[typeName]) ? templateLibrary[typeName] : {};
    const patterns = [
      ...normalizePatterns(parse.patterns),
      ...normalizePatterns(templateDef.patterns),
      ...normalizePatterns(parse.regex ? [{ regex: parse.regex, group: parse.group || 1 }] : []),
      ...normalizePatterns(templateDef.regex ? [{ regex: templateDef.regex, group: templateDef.group || 1 }] : [])
    ];

    const contextKeywords = [
      ...toArray(parse.context_keywords),
      ...toArray(parse.keywords),
      ...toArray(fieldRule.aliases)
    ]
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const negativeKeywords = [
      ...toArray(parse.negative_keywords),
      ...toArray(parse.exclude_keywords)
    ]
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    templates[fieldKey] = {
      patterns,
      ...(typeName ? { type: typeName } : {}),
      ...(contextKeywords.length ? { context_keywords: [...new Set(contextKeywords)] } : {}),
      ...(negativeKeywords.length ? { negative_keywords: [...new Set(negativeKeywords)] } : {}),
      ...(parse.post_process ? { post_process: String(parse.post_process) } : {})
    };
  }

  return {
    category: String(fieldRules.category || '').trim(),
    version: 1,
    generated_at: pickGeneratedAt(fieldRules),
    templates,
    template_library: templateLibrary
  };
}

export function extractRangeRule(rule = {}) {
  const contractRange = isObject(rule.contract?.range) ? rule.contract.range : {};
  const validateRange = isObject(rule.validate) && String(rule.validate.kind || '').trim() === 'number_range'
    ? rule.validate
    : {};
  const min = asNumber(contractRange.min ?? validateRange.min);
  const max = asNumber(contractRange.max ?? validateRange.max);
  if (min === null && max === null) {
    return null;
  }
  return {
    min,
    max
  };
}

export function buildCrossValidationRules(fieldRules = {}) {
  const fields = isObject(fieldRules.fields) ? fieldRules.fields : {};
  const out = [];

  for (const [fieldKeyRaw, rule] of Object.entries(fields)) {
    const fieldKey = normalizeFieldKey(fieldKeyRaw);
    if (!fieldKey || !isObject(rule)) {
      continue;
    }
    const range = extractRangeRule(rule);
    if (!range) {
      continue;
    }
    out.push({
      rule_id: `${fieldKey}_plausibility`,
      description: `${fieldKey} must stay within configured plausible range`,
      trigger_field: fieldKey,
      check: {
        type: 'range',
        ...(range.min !== null ? { min: range.min } : {}),
        ...(range.max !== null ? { max: range.max } : {}),
        on_fail: 'reject_candidate'
      }
    });
  }

  const keySet = new Set(Object.keys(fields).map((key) => normalizeFieldKey(key)));
  if (keySet.has('connection') && keySet.has('battery_hours')) {
    out.push({
      rule_id: 'wireless_battery_required',
      description: 'Wireless products should provide battery_hours',
      trigger_field: 'connection',
      condition: "connection IN ['wireless','hybrid','bluetooth']",
      requires_field: 'battery_hours',
      on_fail: 'set_unknown_with_reason',
      unknown_reason: 'not_found_after_search'
    });
  }

  if (keySet.has('sensor') && keySet.has('dpi')) {
    out.push({
      rule_id: 'sensor_dpi_consistency',
      description: 'Claimed DPI should be consistent with sensor capabilities',
      trigger_field: 'dpi',
      depends_on: ['sensor'],
      check: {
        type: 'component_db_lookup',
        db: 'sensors',
        lookup_field: 'sensor',
        compare: 'dpi <= sensors[sensor].properties.max_dpi',
        on_fail: 'flag_for_review',
        tolerance_percent: 5
      }
    });
  }

  const dimKeySet = [
    ['length', 'width', 'height'],
    ['lngth', 'width', 'height']
  ].find((triplet) => triplet.every((item) => keySet.has(item)));
  if (dimKeySet) {
    out.push({
      rule_id: 'dimensions_consistency',
      description: 'Dimensions should be captured as a complete triplet',
      trigger_field: dimKeySet[0],
      related_fields: [dimKeySet[1], dimKeySet[2]],
      check: {
        type: 'group_completeness',
        minimum_present: 3,
        on_fail: 'flag_for_review'
      }
    });
  }

  const seen = new Set();
  const deduped = [];
  for (const row of out) {
    const ruleId = String(row.rule_id || '').trim();
    if (!ruleId || seen.has(ruleId)) {
      continue;
    }
    seen.add(ruleId);
    deduped.push(row);
  }

  return {
    category: String(fieldRules.category || '').trim(),
    version: 1,
    generated_at: pickGeneratedAt(fieldRules),
    rules: deduped
  };
}

export function buildFieldGroups({ category, generatedAt, uiFieldCatalog = {}, fieldRules = {} }) {
  const uiRows = toArray(uiFieldCatalog.fields);
  const fields = isObject(fieldRules.fields) ? fieldRules.fields : {};
  const groups = new Map();

  for (const row of uiRows) {
    if (!isObject(row)) {
      continue;
    }
    const fieldKey = normalizeFieldKey(row.key || row.canonical_key || '');
    if (!fieldKey) {
      continue;
    }
    const display = String(row.group || row.section || 'general').trim() || 'general';
    const groupKey = normalizeFieldKey(display) || 'general';
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        group_key: groupKey,
        display_name: display,
        field_keys: []
      });
    }
    groups.get(groupKey).field_keys.push(fieldKey);
  }

  if (groups.size === 0) {
    for (const [fieldKeyRaw, rule] of Object.entries(fields)) {
      const fieldKey = normalizeFieldKey(fieldKeyRaw);
      if (!fieldKey || !isObject(rule)) {
        continue;
      }
      const display = String(rule.ui?.group || rule.group || 'general').trim() || 'general';
      const groupKey = normalizeFieldKey(display) || 'general';
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          group_key: groupKey,
          display_name: display,
          field_keys: []
        });
      }
      groups.get(groupKey).field_keys.push(fieldKey);
    }
  }

  const normalizedGroups = [...groups.values()]
    .map((group) => ({
      ...group,
      field_keys: [...new Set(group.field_keys)].sort((a, b) => a.localeCompare(b)),
      count: [...new Set(group.field_keys)].length
    }))
    .sort((a, b) => a.group_key.localeCompare(b.group_key));

  const groupIndex = {};
  for (const group of normalizedGroups) {
    groupIndex[group.group_key] = group.field_keys;
  }

  return {
    category,
    version: 1,
    generated_at: generatedAt,
    groups: normalizedGroups,
    group_index: groupIndex
  };
}

export function auditFieldMetadata(fieldRules = {}) {
  const results = {
    errors: [],
    warnings: [],
    complete_count: 0,
    incomplete_count: 0
  };
  const fields = isObject(fieldRules?.fields) ? fieldRules.fields : {};
  for (const [fieldKeyRaw, rule] of Object.entries(fields)) {
    const fieldKey = normalizeFieldKey(fieldKeyRaw);
    if (!fieldKey || !isObject(rule)) {
      continue;
    }
    const missing = [];
    const requiredLevel = String(rule.required_level || rule.priority?.required_level || '').trim();
    const availability = String(rule.availability || rule.priority?.availability || '').trim();
    const difficulty = String(rule.difficulty || rule.priority?.difficulty || '').trim();
    const dataType = String(rule.data_type || rule.contract?.type || rule.type || '').trim();
    const outputShape = String(rule.output_shape || rule.contract?.shape || rule.shape || '').trim();

    if (!requiredLevel) missing.push('required_level');
    if (!availability) missing.push('availability');
    if (!difficulty) missing.push('difficulty');
    if (!dataType) missing.push('data_type');
    if (!outputShape) missing.push('output_shape');

    if (missing.length > 0) {
      results.errors.push(`field '${fieldKey}' missing metadata: ${missing.join(', ')}`);
      results.incomplete_count += 1;
      continue;
    }
    results.complete_count += 1;
  }
  return results;
}
