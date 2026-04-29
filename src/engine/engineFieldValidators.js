import {
  isObject,
  normalizeFieldKey,
  normalizeToken,
  normalizeKnownValueMatchKey,
} from './engineTextHelpers.js';
import { buildRuleEnumSpec } from './engineEnumIndex.js';
import { asNumber } from './normalizationFunctions.js';
import {
  ruleType as parseRuleType,
  ruleShape as parseRuleShape
} from './ruleAccessors.js';

function parseRange(rule = {}) {
  const contract = isObject(rule.contract) ? rule.contract : {};
  const validate = isObject(rule.validate) ? rule.validate : {};
  const min = asNumber(contract?.range?.min ?? validate?.min);
  const max = asNumber(contract?.range?.max ?? validate?.max);
  return { min, max };
}

export { parseRange };

export function validateRange(fieldKey, numericValue, { rules }) {
  const key = normalizeFieldKey(fieldKey);
  const rule = rules[key];
  if (!rule) {
    return { ok: true };
  }
  const value = asNumber(numericValue);
  if (value === null) {
    return { ok: false, reason_code: 'number_required' };
  }
  const range = parseRange(rule);
  if (range.min !== null && value < range.min) {
    return {
      ok: false,
      reason_code: 'out_of_range',
      range_min: range.min,
      range_max: range.max,
      actual: value
    };
  }
  if (range.max !== null && value > range.max) {
    return {
      ok: false,
      reason_code: 'out_of_range',
      range_min: range.min,
      range_max: range.max,
      actual: value
    };
  }
  return { ok: true };
}

export function validateShapeAndUnits(fieldKey, normalized, { rules }) {
  const key = normalizeFieldKey(fieldKey);
  const rule = rules[key];
  if (!rule) {
    return { ok: true };
  }
  const shape = parseRuleShape(rule);
  const type = parseRuleType(rule);
  if (shape === 'list' && !Array.isArray(normalized)) {
    return { ok: false, reason_code: 'shape_mismatch', expected_shape: 'list', actual_shape: 'scalar' };
  }
  if (shape === 'scalar' && Array.isArray(normalized)) {
    return { ok: false, reason_code: 'shape_mismatch', expected_shape: 'scalar', actual_shape: 'list' };
  }
  if (shape === 'scalar' && isObject(normalized)) {
    return { ok: false, reason_code: 'shape_mismatch', expected_shape: 'scalar', actual_shape: 'object' };
  }
  if ((type === 'number' || type === 'integer') && shape === 'list') {
    const values = Array.isArray(normalized) ? normalized : [];
    if (values.some((item) => asNumber(item) === null)) {
      return { ok: false, reason_code: 'number_required', expected_shape: shape, actual_shape: typeof normalized };
    }
    return { ok: true };
  }
  if ((type === 'number' || type === 'integer') && asNumber(normalized) === null) {
    return { ok: false, reason_code: 'number_required', expected_shape: shape, actual_shape: typeof normalized };
  }
  return { ok: true };
}

export function enforceEnumPolicy(fieldKey, normalized, { rules, enumIndex }) {
  const key = normalizeFieldKey(fieldKey);
  const rule = rules[key] || {};
  const fromRule = normalizeToken(rule.enum_policy || rule?.enum?.policy || '');
  const enumSpec = enumIndex.get(key) || buildRuleEnumSpec(rule);
  const policy = fromRule || normalizeToken(enumSpec?.policy || 'open') || 'open';
  const isClosedPolicy = policy === 'closed' || policy === 'closed_with_curation';
  const hasKnownMatches = enumSpec
    && (enumSpec.index.size > 0 || enumSpec.ambiguous?.size > 0);
  if (!hasKnownMatches) {
    if (isClosedPolicy) {
      return {
        ok: false,
        reason_code: 'enum_value_not_allowed',
        needs_curation: false
      };
    }
    return {
      ok: true,
      canonical_value: normalized,
      was_aliased: false,
      needs_curation: false
    };
  }

  const values = Array.isArray(normalized) ? normalized : [normalized];
  const canonicalized = [];
  let wasAliased = false;
  let needsCuration = false;

  for (const rawValue of values) {
    const token = normalizeKnownValueMatchKey(rawValue);
    if (enumSpec?.ambiguous?.has(token)) {
      if (isClosedPolicy) {
        return {
          ok: false,
          reason_code: 'enum_value_not_allowed',
          needs_curation: false
        };
      }
      canonicalized.push(rawValue);
      needsCuration = true;
      continue;
    }
    if (enumSpec.index.has(token)) {
      const canonical = enumSpec.index.get(token);
      canonicalized.push(canonical);
      wasAliased = wasAliased || String(canonical ?? '').trim() !== String(rawValue ?? '').trim();
      continue;
    }
    if (isClosedPolicy) {
      return {
        ok: false,
        reason_code: 'enum_value_not_allowed',
        needs_curation: false
      };
    }
    canonicalized.push(rawValue);
    needsCuration = true;
  }

  return {
    ok: true,
    canonical_value: Array.isArray(normalized) ? canonicalized : canonicalized[0],
    was_aliased: wasAliased,
    needs_curation: needsCuration
  };
}
