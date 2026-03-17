import {
  isObject,
  toArray,
  normalizeText,
  normalizeToken,
  normalizeFieldKey,
  isUnknownToken
} from './engineTextHelpers.js';
import { asNumber } from './normalizationFunctions.js';
import { computeCompoundRange, evaluateCompoundRange } from './compoundBoundary.js';
import { parseRange } from './engineFieldValidators.js';

export function evaluateInCondition(condition = '', fields = {}) {
  const text = String(condition || '').trim();
  const match = text.match(/^([a-zA-Z0-9_]+)\s+IN\s+\[(.+)\]$/i);
  if (!match) {
    return false;
  }
  const fieldKey = normalizeFieldKey(match[1]);
  const rawValues = String(match[2] || '')
    .split(',')
    .map((item) => normalizeToken(item.replace(/['"]/g, '').trim()))
    .filter(Boolean);
  const current = normalizeToken(fields[fieldKey]);
  return rawValues.includes(current);
}

export function crossValidate(fieldKey, value, allFields = {}, {
  crossValidationRules,
  rules,
  lookupComponent
}) {
  const key = normalizeFieldKey(fieldKey);
  if (!key || isUnknownToken(value)) {
    return { ok: true, checks_passed: [] };
  }
  const violations = [];
  const passed = [];

  for (const rule of crossValidationRules) {
    const trigger = normalizeFieldKey(rule?.trigger_field || '');
    if (trigger !== key) {
      continue;
    }

    const checkType = normalizeToken(rule?.check?.type || '');
    if (checkType === 'range') {
      const min = asNumber(rule?.check?.min);
      const max = asNumber(rule?.check?.max);
      const numeric = asNumber(value);
      if (numeric === null) {
        continue;
      }
      if ((min !== null && numeric < min) || (max !== null && numeric > max)) {
        violations.push({
          rule: rule.rule_id || 'range',
          severity: 'error',
          message: 'range violation'
        });
        continue;
      }
      passed.push(rule.rule_id || 'range');
      continue;
    }

    if (checkType === 'component_db_lookup') {
      const dbName = normalizeText(rule?.check?.db || '');
      const lookupField = normalizeFieldKey(rule?.check?.lookup_field || '');
      const compareField = normalizeFieldKey(rule?.check?.compare_field || '');
      const tolerancePercent = asNumber(rule?.check?.tolerance_percent) ?? 0;
      const triggerNumeric = asNumber(value);
      const lookupValue = lookupField ? allFields[lookupField] : null;
      if (!dbName || !lookupField || !compareField || triggerNumeric === null || isUnknownToken(lookupValue)) {
        continue;
      }
      const component = lookupComponent(dbName, lookupValue);
      if (!component) {
        continue;
      }
      const compareValue = asNumber(component?.properties?.[compareField] ?? component?.[compareField]);
      if (compareValue === null) {
        continue;
      }
      const componentMax = compareValue * (1 + (tolerancePercent / 100));
      const fieldRange = parseRange(rules[key] || {});
      const compoundRange = computeCompoundRange({
        ruleMin: fieldRange.min,
        ruleMax: fieldRange.max,
        componentMin: null,
        componentMax
      });
      const evaluation = evaluateCompoundRange(triggerNumeric, compoundRange);
      if (!evaluation.ok) {
        violations.push({
          rule: rule.rule_id || 'component_db_lookup',
          severity: 'error',
          message: `${key} exceeds ${lookupField} ${compareField}`,
          reason_code: evaluation.reason_code,
          effective_min: evaluation.effective_min,
          effective_max: evaluation.effective_max,
          actual: evaluation.actual,
          sources: evaluation.sources,
          violated_bound: evaluation.violated_bound
        });
        continue;
      }
      passed.push(rule.rule_id || 'component_db_lookup');
      continue;
    }

    if (checkType === 'group_completeness') {
      const relatedFields = toArray(rule?.related_fields).map((item) => normalizeFieldKey(item)).filter(Boolean);
      const minPresent = Number.parseInt(String(rule?.check?.minimum_present ?? relatedFields.length), 10);
      if (relatedFields.length === 0) {
        continue;
      }
      const presentCount = relatedFields.reduce((count, relatedField) => {
        return count + (isUnknownToken(allFields[relatedField]) ? 0 : 1);
      }, 0);
      if (Number.isFinite(minPresent) && presentCount < minPresent) {
        violations.push({
          rule: rule.rule_id || 'group_completeness',
          severity: 'warning',
          message: `expected at least ${minPresent} fields in group`
        });
        continue;
      }
      passed.push(rule.rule_id || 'group_completeness');
      continue;
    }

    if (checkType === 'mutual_exclusion') {
      const relatedFields = toArray(rule?.related_fields).map((item) => normalizeFieldKey(item)).filter(Boolean);
      const hasCondition = Boolean(normalizeText(rule?.condition));
      if (hasCondition && !evaluateInCondition(rule.condition, allFields)) {
        continue;
      }
      const presentConflicts = relatedFields.filter((relatedField) => !isUnknownToken(allFields[relatedField]));
      if (presentConflicts.length > 0) {
        violations.push({
          rule: rule.rule_id || 'mutual_exclusion',
          severity: 'error',
          message: `${key} conflicts with ${presentConflicts.join(', ')}`
        });
        continue;
      }
      passed.push(rule.rule_id || 'mutual_exclusion');
      continue;
    }

    if (normalizeText(rule?.condition) && normalizeText(rule?.requires_field)) {
      const conditionMet = evaluateInCondition(rule.condition, allFields);
      if (!conditionMet) {
        continue;
      }
      const requiresField = normalizeFieldKey(rule.requires_field);
      if (!requiresField || isUnknownToken(allFields[requiresField])) {
        violations.push({
          rule: rule.rule_id || 'conditional_require',
          severity: 'warning',
          message: `${requiresField} missing`
        });
        continue;
      }
      passed.push(rule.rule_id || 'conditional_require');
    }
  }

  if (violations.length > 0) {
    return {
      ok: false,
      violations,
      severity: violations.some((row) => row.severity === 'error') ? 'error' : 'warning'
    };
  }
  return {
    ok: true,
    checks_passed: passed
  };
}
