import { normalizeAbsence } from './absenceNormalizer.js';
import { coerceByType } from './typeCoercion.js';
import { checkShape } from './checks/checkShape.js';
import { checkUnit } from './checks/checkUnit.js';
import { normalizeValue } from './checks/normalize.js';
import { checkFormat } from './checks/checkFormat.js';
import { enforceListRules } from './checks/enforceListRules.js';
import { applyRounding } from './checks/applyRounding.js';
import { checkEnum } from './checks/checkEnum.js';
import { checkRange } from './checks/checkRange.js';
import { shouldBlockUnkPublish } from './shouldBlockUnkPublish.js';
/**
 * Single-field validation pipeline. Composes all per-field checks in order.
 * Pure function — no DB, no LLM, no side effects.
 *
 * Type-driven: contract.type determines coercion. contract.shape determines cardinality.
 * parse.template is not read — all routing is by type.
 *
 * @param {{ fieldKey: string, value: *, fieldRule: object, knownValues?: object }} opts
 * @returns {{ valid: boolean, value: *, confidence: number, repairs: object[], rejections: object[] }}
 */
export function validateField({ fieldKey, value, fieldRule, knownValues, componentDb, consistencyMode, appDb }) {
  if (!fieldRule) {
    return result(null, null, [], []);
  }

  const shape = fieldRule?.contract?.shape || 'scalar';
  const type = fieldRule?.contract?.type || 'string';
  const unit = fieldRule?.contract?.unit || '';
  const roundingConfig = fieldRule?.contract?.rounding;
  const rangeConfig = fieldRule?.contract?.range;
  const listRules = fieldRule?.contract?.list_rules;
  let enumPolicy = knownValues?.policy || fieldRule?.enum?.policy;
  const enumValues = knownValues?.values;
  // WHY: consistencyMode treats open enums as reviewable unknowns instead of silent accepts.
  if (consistencyMode && enumPolicy === 'open' && enumValues?.length > 0) enumPolicy = 'open_prefer_known';
  const shouldPreserveEnumDisplay = shouldUseKnownEnumDisplay(enumPolicy, enumValues);
  const formatHint = fieldRule?.enum?.match?.format_hint || null;
  const blockPublishWhenUnk = shouldBlockUnkPublish(fieldRule);

  const repairs = [];
  const rejections = [];
  let current = value;

  // Step 0: Absence normalization
  const absent = normalizeAbsence(current, shape);
  if (absent !== current) {
    repairs.push({ step: 'absence', before: current, after: absent, rule: 'absence_normalize' });
    current = absent;
  }

  // Step 1: Shape check — SHORT-CIRCUIT on failure
  // WHY: Shape before coercion prevents data corruption (the [object Object] bug).
  const shapeResult = checkShape(current, shape);
  if (!shapeResult.pass) {
    rejections.push({ reason_code: 'wrong_shape', detail: { expected: shape, reason: shapeResult.reason } });
    return result(current, unit || null, repairs, rejections);
  }

  // Step 2: Unit verification (BEFORE type coercion — needs unit suffix still in string)
  // WHY: For list-shaped fields, unit check runs per-element so each element gets
  // synonym resolution and conversion (e.g., "1 kHz" → 1000 for Hz fields).
  if (unit) {
    if (shape === 'list' && Array.isArray(current)) {
      const checked = [];
      for (const el of current) {
        const unitResult = checkUnit(el, unit, appDb);
        if (!unitResult.pass) {
          rejections.push({ reason_code: 'wrong_unit', detail: unitResult.detail });
          return result(current, unit || null, repairs, rejections);
        }
        if (unitResult.value !== el) {
          repairs.push({ step: 'unit', before: el, after: unitResult.value, rule: unitResult.rule || 'strip_same_unit' });
        }
        checked.push(unitResult.value !== undefined ? unitResult.value : el);
      }
      current = checked;
    } else {
      const unitResult = checkUnit(current, unit, appDb);
      if (!unitResult.pass) {
        rejections.push({ reason_code: 'wrong_unit', detail: unitResult.detail });
        return result(current, unit || null, repairs, rejections);
      }
      if (unitResult.value !== current) {
        repairs.push({ step: 'unit', before: current, after: unitResult.value, rule: unitResult.rule || 'strip_same_unit' });
        current = unitResult.value;
      }
    }
  }

  // Step 3: Type coercion — driven by contract.type
  if (shape === 'list' && Array.isArray(current)) {
    const coerced = [];
    for (const el of current) {
      const r = coerceByType(el, type);
      if (r.repaired !== undefined) {
        repairs.push({ step: 'type_coerce', before: el, after: r.repaired, rule: r.rule });
        coerced.push(r.repaired);
      } else if (!r.pass) {
        rejections.push({ reason_code: 'wrong_type', detail: { expected: type, reason: r.reason, element: el } });
        coerced.push(el);
      } else {
        coerced.push(r.value ?? el);
      }
    }
    current = coerced;
  } else {
    const typeResult = coerceByType(current, type);
    if (typeResult.repaired !== undefined) {
      repairs.push({ step: 'type_coerce', before: current, after: typeResult.repaired, rule: typeResult.rule });
      current = typeResult.repaired;
    } else if (!typeResult.pass) {
      rejections.push({ reason_code: 'wrong_type', detail: { expected: type, reason: typeResult.reason } });
    }
  }

  // Step 4: String normalization (trim, lowercase, hyphens, token_map)
  // WHY: List elements need the same normalization chain as scalars so
  // self-healing works (e.g. ['Black','White'] → ['black','white']).
  if (shape === 'list' && Array.isArray(current)) {
    const normalized = current.map(el =>
      typeof el === 'string'
        ? normalizeStringForPolicy(el, fieldRule, shouldPreserveEnumDisplay)
        : el
    );
    if (JSON.stringify(normalized) !== JSON.stringify(current)) {
      repairs.push({ step: 'normalize', before: current, after: normalized, rule: shouldPreserveEnumDisplay ? 'trim_display' : 'normalize_chain' });
      current = normalized;
    }
  } else if (typeof current === 'string') {
    const normalized = normalizeStringForPolicy(current, fieldRule, shouldPreserveEnumDisplay);
    if (normalized !== current) {
      repairs.push({ step: 'normalize', before: current, after: normalized, rule: shouldPreserveEnumDisplay ? 'trim_display' : 'normalize_chain' });
      current = normalized;
    }
  }

  // Step 5: Format check
  const formatResult = checkFormat(current, type, formatHint);
  if (!formatResult.pass) {
    rejections.push({ reason_code: 'format_mismatch', detail: { reason: formatResult.reason } });
  }

  // Step 6: List rules (list-shaped fields only)
  if (shape === 'list' && Array.isArray(current) && listRules) {
    const listResult = enforceListRules(current, listRules);
    for (const rep of listResult.repairs) {
      repairs.push({ step: 'list_rules', before: current, after: listResult.values, rule: rep.rule });
    }
    current = listResult.values;
  }

  // Step 7: Rounding (numeric fields only)
  if (roundingConfig) {
    const roundResult = applyRounding(current, roundingConfig);
    if (roundResult.repaired) {
      repairs.push({ step: 'rounding', before: current, after: roundResult.value, rule: 'rounding' });
    }
    current = roundResult.value;
  }

  // Step 8: Enum check
  if (enumPolicy && enumValues) {
    const enumResult = checkEnum(current, enumPolicy, enumValues);
    if (enumResult.repaired !== undefined) {
      repairs.push({ step: 'enum_alias', before: current, after: enumResult.repaired, rule: 'alias_resolve' });
      current = enumResult.repaired;
    }
    if (!enumResult.pass) {
      rejections.push({ reason_code: 'enum_value_not_allowed', detail: { unknown: enumResult.unknown, policy: enumPolicy } });
    } else if (enumResult.needsReview) {
      // WHY: open_prefer_known unknowns stay publish-blocking until reviewed or added to known values.
      rejections.push({ reason_code: 'unknown_enum_prefer_known', detail: { unknown: enumResult.unknown, policy: enumPolicy } });
    }
  }

  // Step 9: Range check (numeric fields only)
  if (rangeConfig) {
    const rangeResult = checkRange(current, rangeConfig);
    if (!rangeResult.pass) {
      rejections.push({ reason_code: 'out_of_range', detail: rangeResult.detail });
    }
  }

  // Step 10: Publish gate — reject absent values for fields that block publishing
  if (blockPublishWhenUnk && current === null) {
    rejections.push({ reason_code: 'unk_blocks_publish', detail: { value: current, field: fieldKey } });
  }

  return result(current, unit || null, repairs, rejections, null, null);
}

function result(value, unit, repairs, rejections) {
  return {
    valid: rejections.length === 0,
    value,
    unit,
    confidence: 1.0,
    repairs,
    rejections,
  };
}

function shouldUseKnownEnumDisplay(enumPolicy, enumValues) {
  return Boolean(enumPolicy && enumPolicy !== 'open' && Array.isArray(enumValues) && enumValues.length > 0);
}

function normalizeStringForPolicy(value, fieldRule, shouldPreserveEnumDisplay) {
  if (!shouldPreserveEnumDisplay) {
    return normalizeValue(value, fieldRule);
  }
  return value.trim();
}
