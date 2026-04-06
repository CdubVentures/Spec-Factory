import { isObject, normalizeFieldKey, normalizeToken } from './engineTextHelpers.js';
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

function coerceCanonicalLikeRaw(rawValue, canonical) {
  if (typeof rawValue === 'number' && typeof canonical === 'string') {
    const numeric = asNumber(canonical);
    if (numeric !== null) {
      return numeric;
    }
  }
  return canonical;
}

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
  const objectSchema = isObject(rule?.contract?.object_schema) ? rule.contract.object_schema : {};
  if (shape === 'list' && !Array.isArray(normalized)) {
    return { ok: false, reason_code: 'shape_mismatch', expected_shape: 'list', actual_shape: 'scalar' };
  }
  if (shape === 'scalar' && Array.isArray(normalized)) {
    return { ok: false, reason_code: 'shape_mismatch', expected_shape: 'scalar', actual_shape: 'list' };
  }
  if (shape === 'scalar' && isObject(normalized)) {
    return { ok: false, reason_code: 'shape_mismatch', expected_shape: 'scalar', actual_shape: 'object' };
  }
  if (type === 'object') {
    const validateObjectEntry = (entry) => {
      if (!isObject(entry)) {
        return false;
      }
      for (const [property, spec] of Object.entries(objectSchema)) {
        const expectedType = normalizeToken(spec?.type || '');
        const optional = Boolean(spec?.optional);
        const value = entry[property];
        if ((value === undefined || value === null || value === '') && optional) {
          continue;
        }
        if (value === undefined || value === null || value === '') {
          return false;
        }
        if (expectedType === 'number' && asNumber(value) === null) {
          return false;
        }
        if (expectedType === 'string' && typeof value !== 'string') {
          return false;
        }
        if (Array.isArray(spec?.allowed) && spec.allowed.length > 0) {
          const token = normalizeToken(value);
          const allowed = new Set(spec.allowed.map((row) => normalizeToken(row)));
          if (!allowed.has(token)) {
            return false;
          }
        }
      }
      return true;
    };

    if (shape === 'list') {
      const values = Array.isArray(normalized) ? normalized : [];
      if (values.some((entry) => !validateObjectEntry(entry))) {
        return { ok: false, reason_code: 'shape_mismatch', expected_shape: 'list<object>', actual_shape: typeof normalized };
      }
      return { ok: true };
    }

    if (!validateObjectEntry(normalized)) {
      return { ok: false, reason_code: 'shape_mismatch', expected_shape: 'object', actual_shape: typeof normalized };
    }
    return { ok: true };
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
  if (!enumSpec || enumSpec.index.size === 0) {
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
    const token = normalizeToken(rawValue);
    if (typeof rawValue === 'string' && rawValue.includes('+')) {
      const atoms = rawValue
        .split('+')
        .map((part) => normalizeToken(part))
        .filter(Boolean);
      if (atoms.length > 1 && atoms.every((atom) => enumSpec.index.has(atom))) {
        const canonicalAtoms = atoms.map((atom) => enumSpec.index.get(atom));
        canonicalized.push(canonicalAtoms.join('+'));
        wasAliased = wasAliased || canonicalAtoms.some((canonical, index) => normalizeToken(canonical) !== atoms[index]);
        continue;
      }
    }
    if (enumSpec.index.has(token)) {
      const canonical = enumSpec.index.get(token);
      canonicalized.push(coerceCanonicalLikeRaw(rawValue, canonical));
      wasAliased = wasAliased || normalizeToken(canonical) !== token;
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
