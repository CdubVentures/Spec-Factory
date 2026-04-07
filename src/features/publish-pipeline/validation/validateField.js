import { normalizeAbsence } from './absenceNormalizer.js';
import { dispatchTemplate } from './templateDispatch.js';
import { checkShape } from './checks/checkShape.js';
import { checkType } from './checks/checkType.js';
import { checkUnit } from './checks/checkUnit.js';
import { normalizeValue } from './checks/normalize.js';
import { checkFormat } from './checks/checkFormat.js';
import { enforceListRules } from './checks/enforceListRules.js';
import { applyRounding } from './checks/applyRounding.js';
import { checkEnum } from './checks/checkEnum.js';
import { checkRange } from './checks/checkRange.js';
import { resolveComponent } from './checks/resolveComponent.js';

/**
 * Single-field validation pipeline. Composes all per-field checks in order.
 * Pure function — no DB, no LLM, no side effects.
 *
 * @param {{ fieldKey: string, value: *, fieldRule: object, knownValues?: object, componentDb?: object }} opts
 * @returns {{ valid: boolean, value: *, confidence: number, repairs: object[], rejections: object[], unknownReason: string|null, repairPrompt: object|null }}
 */
export function validateField({ fieldKey, value, fieldRule, knownValues, componentDb }) {
  if (!fieldRule) {
    return result('unk', [], [], null, null);
  }

  const shape = fieldRule?.contract?.shape || 'scalar';
  const type = fieldRule?.contract?.type || 'string';
  const unit = fieldRule?.contract?.unit || '';
  const template = fieldRule?.parse?.template || 'text_field';
  const unitAccepts = fieldRule?.parse?.unit_accepts;
  const roundingConfig = fieldRule?.contract?.rounding;
  const rangeConfig = fieldRule?.contract?.range;
  const listRules = fieldRule?.contract?.list_rules;
  const enumPolicy = knownValues?.policy || fieldRule?.enum?.policy;
  const enumValues = knownValues?.values;

  const repairs = [];
  const rejections = [];
  let current = value;

  // Step 0: Absence normalization
  const absent = normalizeAbsence(current, shape);
  if (absent !== current) {
    repairs.push({ step: 'absence', before: current, after: absent, rule: 'absence_normalize' });
    current = absent;
  }

  // Step 1: Template dispatch (specialized normalizers)
  const dispatched = dispatchTemplate(template, current);
  if (dispatched !== null) {
    if (dispatched !== current) {
      repairs.push({ step: 'template_dispatch', before: current, after: dispatched, rule: `dispatch:${template}` });
    }
    current = dispatched;
  }

  // Step 2: Shape check — SHORT-CIRCUIT on failure
  const shapeResult = checkShape(current, shape);
  if (!shapeResult.pass) {
    rejections.push({ reason_code: 'wrong_shape', detail: { expected: shape, reason: shapeResult.reason } });
    return result(current, repairs, rejections, null, null);
  }

  // Step 3: Unit verification (BEFORE type check — needs the unit suffix still present in string)
  if (unit && dispatched === null) {
    const unitResult = checkUnit(current, unit, unitAccepts);
    if (!unitResult.pass) {
      rejections.push({ reason_code: 'wrong_unit', detail: unitResult.detail });
      return result(current, repairs, rejections, null, null);
    }
    if (unitResult.value !== current) {
      repairs.push({ step: 'unit', before: current, after: unitResult.value, rule: unitResult.rule || 'strip_same_unit' });
      current = unitResult.value;
    }
  }

  // Step 4: Type check (only for fallthrough templates — dispatched values already typed)
  if (dispatched === null) {
    const typeResult = checkType(current, type, template);
    if (typeResult.repaired !== undefined) {
      repairs.push({ step: 'type_coerce', before: current, after: typeResult.repaired, rule: typeResult.rule });
      current = typeResult.repaired;
    } else if (!typeResult.pass) {
      rejections.push({ reason_code: 'wrong_type', detail: { expected: type, reason: typeResult.reason } });
    }
  }

  // Step 5: String normalization (trim, lowercase, hyphens, token_map)
  if (typeof current === 'string' && current !== 'unk') {
    const normalized = normalizeValue(current, fieldRule);
    if (normalized !== current) {
      repairs.push({ step: 'normalize', before: current, after: normalized, rule: 'normalize_chain' });
      current = normalized;
    }
  }

  // Step 6: Format check
  const formatResult = checkFormat(current, template);
  if (!formatResult.pass) {
    rejections.push({ reason_code: 'format_mismatch', detail: { reason: formatResult.reason } });
  }

  // Step 7: List rules (list-shaped fields only)
  if (shape === 'list' && Array.isArray(current) && listRules) {
    const listResult = enforceListRules(current, listRules);
    if (listResult.repairs.length > 0) {
      for (const rep of listResult.repairs) {
        repairs.push({ step: 'list_rules', before: current, after: listResult.values, rule: rep.rule });
      }
    }
    current = listResult.values;
  }

  // Step 8: Rounding (numeric fields only)
  if (roundingConfig) {
    const roundResult = applyRounding(current, roundingConfig);
    if (roundResult.repaired) {
      repairs.push({ step: 'rounding', before: current, after: roundResult.value, rule: 'rounding' });
    }
    current = roundResult.value;
  }

  // Step 9: Enum check
  if (enumPolicy && enumValues) {
    const enumResult = checkEnum(current, enumPolicy, enumValues);
    if (!enumResult.pass) {
      rejections.push({ reason_code: 'enum_value_not_allowed', detail: { unknown: enumResult.unknown, policy: enumPolicy } });
    }
  }

  // Step 10: Range check (numeric fields only)
  if (rangeConfig) {
    const rangeResult = checkRange(current, rangeConfig);
    if (!rangeResult.pass) {
      rejections.push({ reason_code: 'out_of_range', detail: rangeResult.detail });
    }
  }

  // Step 11: Component resolution (component_reference fields only)
  if (template === 'component_reference' && componentDb) {
    const compResult = resolveComponent(current, fieldKey, componentDb);
    if (compResult.canonical && compResult.repaired) {
      repairs.push({ step: 'component', before: current, after: compResult.canonical, rule: 'component_resolve' });
      current = compResult.canonical;
    } else if (!compResult.pass) {
      rejections.push({ reason_code: 'not_in_component_db', detail: { value: current, reason: compResult.reason } });
    }
  }

  return result(current, repairs, rejections, null, null);
}

function result(value, repairs, rejections, unknownReason, repairPrompt) {
  return {
    valid: rejections.length === 0,
    value,
    confidence: 1.0,
    repairs,
    rejections,
    unknownReason,
    repairPrompt,
  };
}
