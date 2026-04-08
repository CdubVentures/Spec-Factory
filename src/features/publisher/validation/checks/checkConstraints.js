/**
 * Cross-field constraint evaluation (Step 10).
 * Evaluates all cross-validation rules against the full resolved field set.
 * Dispatches by rule structure: conditional, range, group_completeness, component_db_lookup.
 *
 * @param {Record<string, *>} fields - All resolved field values for the product
 * @param {{ rules: object[] }|null} crossRules - from cross_validation_rules.json
 * @param {Record<string, { items: object[] }>} [componentDbs] - keyed by component type
 * @returns {{ failures: { rule_id: string, constraint: string, pass: boolean, action: string, detail?: object }[] }}
 */
export function checkConstraints(fields, crossRules, componentDbs) {
  if (!crossRules || !crossRules.rules || crossRules.rules.length === 0) {
    return { failures: [] };
  }

  const failures = [];

  for (const rule of crossRules.rules) {
    const result = evaluateRule(rule, fields, componentDbs);
    if (result) failures.push(result);
  }

  return { failures };
}

function evaluateRule(rule, fields, componentDbs) {
  // Conditional requirement: condition + requires_field
  if (rule.condition && rule.requires_field) {
    return evaluateConditional(rule, fields);
  }

  // Check-based rules
  if (rule.check) {
    // Group completeness evaluates field presence, not values — don't skip on unk
    if (rule.check.type === 'group_completeness') {
      return evaluateGroupCompleteness(rule, fields);
    }

    const triggerValue = fields[rule.trigger_field];
    if (triggerValue === undefined || triggerValue === 'unk') return null;

    if (rule.check.type === 'range') {
      return evaluateRange(rule, triggerValue);
    }

    if (rule.check.type === 'component_db_lookup') {
      return evaluateComponentDbLookup(rule, fields, componentDbs);
    }
  }

  return null;
}

// --- Conditional requirement ---

function evaluateConditional(rule, fields) {
  const triggerValue = fields[rule.trigger_field];
  if (triggerValue === undefined) return null;

  if (!evaluateConditionString(rule.condition, fields)) return null;

  const requiredValue = fields[rule.requires_field];
  if (requiredValue !== undefined && requiredValue !== 'unk') return null;

  return {
    rule_id: rule.rule_id,
    constraint: rule.condition,
    pass: false,
    action: rule.on_fail || 'flag_for_review',
    detail: { requires_field: rule.requires_field, trigger_value: triggerValue },
  };
}

// WHY: Simple condition parser for the cross-validation DSL.
// Supports: "field IN ['val1','val2']", "field NOT_IN ['val1']", "field == 'val'", "field != 'val'"
function evaluateConditionString(conditionStr, fields) {
  const inMatch = conditionStr.match(/^(\w+)\s+IN\s+\[(.+)\]$/);
  if (inMatch) {
    const fieldValue = fields[inMatch[1]];
    const allowed = parseValueList(inMatch[2]);
    return allowed.includes(fieldValue);
  }

  const notInMatch = conditionStr.match(/^(\w+)\s+NOT_IN\s+\[(.+)\]$/);
  if (notInMatch) {
    const fieldValue = fields[notInMatch[1]];
    const disallowed = parseValueList(notInMatch[2]);
    return !disallowed.includes(fieldValue);
  }

  const eqMatch = conditionStr.match(/^(\w+)\s*==\s*'(.+)'$/);
  if (eqMatch) return fields[eqMatch[1]] === eqMatch[2];

  const neqMatch = conditionStr.match(/^(\w+)\s*!=\s*'(.+)'$/);
  if (neqMatch) return fields[neqMatch[1]] !== neqMatch[2];

  return false;
}

function parseValueList(raw) {
  return raw.split(',').map(v => v.trim().replace(/^'|'$/g, ''));
}

// --- Range plausibility ---

function evaluateRange(rule, triggerValue) {
  if (typeof triggerValue !== 'number' || !Number.isFinite(triggerValue)) return null;

  const { min, max, on_fail } = rule.check;

  if (typeof min === 'number' && triggerValue < min) {
    return {
      rule_id: rule.rule_id,
      constraint: `${rule.trigger_field} >= ${min}`,
      pass: false,
      action: on_fail || 'reject_candidate',
      detail: { min, max, actual: triggerValue },
    };
  }

  if (typeof max === 'number' && triggerValue > max) {
    return {
      rule_id: rule.rule_id,
      constraint: `${rule.trigger_field} <= ${max}`,
      pass: false,
      action: on_fail || 'reject_candidate',
      detail: { min, max, actual: triggerValue },
    };
  }

  return null;
}

// --- Group completeness ---

function evaluateGroupCompleteness(rule, fields) {
  const allFields = [rule.trigger_field, ...(rule.related_fields || [])];
  const present = allFields.filter(f => {
    const v = fields[f];
    return v !== undefined && v !== 'unk';
  });

  const minRequired = rule.check.minimum_present || allFields.length;

  if (present.length >= minRequired) return null;

  return {
    rule_id: rule.rule_id,
    constraint: `group_completeness(${allFields.join(', ')}) >= ${minRequired}`,
    pass: false,
    action: rule.check.on_fail || 'flag_for_review',
    detail: { required: minRequired, present: present.length, fields: allFields },
  };
}

// --- Component DB lookup ---

function evaluateComponentDbLookup(rule, fields, componentDbs) {
  if (!componentDbs || !rule.check.db || !rule.check.lookup_field) return null;

  const db = componentDbs[rule.check.db];
  if (!db || !db.items) return null;

  const componentName = fields[rule.check.lookup_field];
  if (!componentName || componentName === 'unk') return null;

  const nameLower = String(componentName).toLowerCase();
  const entity = db.items.find(e => e.name === componentName || e.name.toLowerCase() === nameLower);
  if (!entity) return null;

  // Parse compare expression: "field <= db[lookup].properties.prop"
  const compare = rule.check.compare || '';
  const compareMatch = compare.match(/^(\w+)\s*(<=|>=|<|>)\s*\w+\[\w+\]\.properties\.(\w+)$/);
  if (!compareMatch) return null;

  const [, fieldName, op, propKey] = compareMatch;
  const fieldValue = typeof fields[fieldName] === 'number' ? fields[fieldName] : Number(fields[fieldName]);
  const propValue = entity.properties?.[propKey];

  if (!Number.isFinite(fieldValue) || !Number.isFinite(propValue)) return null;

  // Apply tolerance
  const tolerance = Number(rule.check.tolerance_percent || 0) / 100;
  const limit = op === '<=' || op === '<' ? propValue * (1 + tolerance) : propValue * (1 - tolerance);

  const pass = op === '<=' ? fieldValue <= limit
    : op === '<' ? fieldValue < limit
    : op === '>=' ? fieldValue >= limit
    : fieldValue > limit;

  if (pass) return null;

  return {
    rule_id: rule.rule_id,
    constraint: compare,
    pass: false,
    action: rule.check.on_fail || 'flag_for_review',
    detail: { field: fieldName, value: fieldValue, property: propKey, limit: propValue, tolerance_percent: rule.check.tolerance_percent },
  };
}
