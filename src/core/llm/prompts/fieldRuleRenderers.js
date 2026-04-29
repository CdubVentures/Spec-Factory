/**
 * Pure field-rule → prompt-text renderers.
 *
 * These five functions take a compiled `fieldRule` object and return the
 * text block each finder prompt injects. They are intentionally free of
 * finder-specific logic — the same renderers feed the key finder today,
 * the category-audit report, and future prompt consumers (indexing
 * pipeline, etc.) tomorrow.
 *
 * Exports:
 *   - buildPrimaryKeyHeaderBlock(fieldKey, fieldRule)
 *   - resolvePromptFieldRule(fieldRule, { knownValues, fieldKey })
 *   - buildFieldGuidanceBlock(fieldRule)
 *   - buildFieldContractBlock(fieldRule)
 *   - buildSearchHintsBlock(fieldRule, { searchHintsInjectionEnabled })
 *   - buildCrossFieldConstraintsBlock(fieldRule)
 *   - joinList (shared helper)
 *   - resolveDisplayName (shared helper)
 */

export function joinList(list, max = 16) {
  if (!Array.isArray(list) || list.length === 0) return '';
  return list.slice(0, max).map((s) => String(s).trim()).filter(Boolean).join(', ');
}

export function resolveDisplayName(fieldKey, fieldRule) {
  return String(fieldRule?.ui?.label || fieldRule?.display_name || fieldKey || '').trim();
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(list) {
  const seen = new Set();
  const out = [];
  for (const entry of list || []) {
    const value = String(entry || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function sourceToEnumKey(source) {
  const raw = String(source || '').trim();
  if (!raw) return '';
  return raw.startsWith('data_lists.') ? raw.slice('data_lists.'.length) : raw;
}

function resolveKnownEnum(fieldRule, { knownValues = null, fieldKey = '' } = {}) {
  const ruleEnum = isObject(fieldRule?.enum) ? fieldRule.enum : {};
  const inlineValues = Array.isArray(ruleEnum.values) ? uniqueStrings(ruleEnum.values) : [];
  if (inlineValues.length > 0) {
    return {
      policy: String(ruleEnum.policy || '').trim(),
      source: String(ruleEnum.source || '').trim(),
      values: inlineValues,
    };
  }

  const enums = isObject(knownValues?.enums) ? knownValues.enums : {};
  const candidates = uniqueStrings([
    sourceToEnumKey(ruleEnum.source),
    fieldRule?.field_key,
    fieldKey,
  ]);
  for (const key of candidates) {
    const known = enums[key];
    if (!isObject(known)) continue;
    return {
      policy: String(ruleEnum.policy || known.policy || '').trim(),
      source: String(ruleEnum.source || '').trim(),
      values: Array.isArray(known.values) ? uniqueStrings(known.values) : [],
    };
  }

  return {
    policy: String(ruleEnum.policy || '').trim(),
    source: String(ruleEnum.source || '').trim(),
    values: [],
  };
}

export function resolvePromptFieldRule(fieldRule, { knownValues = null, fieldKey = '' } = {}) {
  if (!isObject(fieldRule)) return {};
  const resolvedEnum = resolveKnownEnum(fieldRule, { knownValues, fieldKey });
  const next = {
    ...fieldRule,
    field_key: fieldRule.field_key || fieldKey,
  };
  if (resolvedEnum.policy || resolvedEnum.source || resolvedEnum.values.length > 0) {
    next.enum = {
      ...(isObject(fieldRule.enum) ? fieldRule.enum : {}),
      policy: resolvedEnum.policy,
      source: resolvedEnum.source,
    };
    if (resolvedEnum.values.length > 0) {
      next.enum.values = resolvedEnum.values;
    }
  }
  return next;
}

export function buildPrimaryKeyHeaderBlock(fieldKey, fieldRule) {
  if (!fieldKey) return '';
  const label = resolveDisplayName(fieldKey, fieldRule);
  return label && label !== fieldKey
    ? `Field key: ${fieldKey} (${label})`
    : `Field key: ${fieldKey}`;
}

export function buildFieldGuidanceBlock(fieldRule) {
  const note = String(fieldRule?.ai_assist?.reasoning_note || '').trim();
  if (!note) return '';
  return `Extraction guidance:\n${note}`;
}

export function buildFieldContractBlock(fieldRule) {
  const type = String(fieldRule?.contract?.type || fieldRule?.data_type || 'string').toLowerCase();
  const shape = String(fieldRule?.contract?.shape || fieldRule?.output_shape || 'scalar').toLowerCase();
  const unit = String(fieldRule?.contract?.unit || '').trim();
  const rounding = fieldRule?.contract?.rounding;
  const listRules = fieldRule?.contract?.list_rules;
  const enumPolicy = String(fieldRule?.enum?.policy || '').trim();
  const enumValues = Array.isArray(fieldRule?.enum?.values) ? fieldRule.enum.values : [];
  const aliases = Array.isArray(fieldRule?.aliases) ? fieldRule.aliases.filter(Boolean) : [];
  const variancePolicy = String(fieldRule?.variance_policy || '').trim();
  const minEvidenceRefs = Number(fieldRule?.evidence?.min_evidence_refs);

  const lines = ['Return contract:'];
  lines.push(`- Type: ${type}${shape === 'list' ? ' (list / array)' : ' (scalar)'}`);
  if (unit) lines.push(`- Unit: ${unit} (include the numeric value only; unit is known from context)`);
  if (Number.isFinite(minEvidenceRefs) && minEvidenceRefs > 0) {
    const refs = Math.floor(minEvidenceRefs);
    lines.push(`- Evidence target: ${refs} source ref${refs === 1 ? '' : 's'} for publisher gate`);
  }
  if (rounding && Number.isFinite(rounding.decimals)) {
    lines.push(`- Rounding: ${rounding.decimals} decimal(s), mode=${rounding.mode || 'nearest'}`);
  }
  if (shape === 'list' && listRules) {
    const ruleParts = [];
    if (listRules.dedupe) ruleParts.push('dedupe');
    if (listRules.sort && listRules.sort !== 'none') ruleParts.push(`sort=${listRules.sort}`);
    if (ruleParts.length) lines.push(`- List rules: ${ruleParts.join(', ')}`);
  }
  if (type === 'boolean' || type === 'bool') {
    lines.push('- Boolean values: yes | no | n/a');
  } else if (enumValues.length > 0) {
    const values = enumValues.slice(0, 24).join(' | ');
    if (enumPolicy === 'open_prefer_known') {
      lines.push(`- Preferred canonical values (open_prefer_known): ${values}`);
      lines.push('- Use a listed value whenever it fits. Emit an unlisted value only when direct evidence proves a real value that none of the listed values can represent; do not create new values from aliases, marketing phrases, formatting variants, or sibling-field wording.');
    } else if (enumPolicy === 'open') {
      lines.push(`- Known examples (open): ${values}`);
      lines.push('- New values are allowed when directly evidenced.');
    } else {
      lines.push(`- Allowed values (${enumPolicy || 'closed'}): ${values}`);
    }
  } else if (enumPolicy) {
    lines.push(`- Enum policy: ${enumPolicy} (no fixed list \u2014 use an authoritative value)`);
  }
  if (variancePolicy) {
    lines.push(`- Variance policy: ${variancePolicy} (how to resolve disagreeing sources)`);
  }
  if (aliases.length > 0) {
    lines.push(`- Aliases (recognize these in source text): ${joinList(aliases)}`);
  }
  if (shape === 'list') {
    lines.push('- Return an array; each element must independently satisfy the type rule above.');
  }
  return lines.join('\n');
}

export function buildSearchHintsBlock(fieldRule, { searchHintsInjectionEnabled } = {}) {
  if (!searchHintsInjectionEnabled) return '';
  const hints = fieldRule?.search_hints || {};
  const domainHints = joinList(hints.domain_hints);
  const queryTerms = joinList(hints.query_terms);
  if (!domainHints && !queryTerms) return '';
  const lines = ['Search hints:'];
  if (domainHints) lines.push(`- Preferred source domains: ${domainHints}`);
  if (queryTerms) lines.push(`- Search terms to try: ${queryTerms}`);
  return lines.join('\n');
}

function parseConstraintExpression(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const match = text.match(/^([A-Za-z0-9_.-]+)\s*(<=|>=|==|=|<|>)\s*([A-Za-z0-9_.-]+)$/);
  if (!match) return { raw: text };
  const [, left, operator, right] = match;
  const opMap = {
    '<=': 'lte',
    '<': 'lt',
    '>=': 'gte',
    '>': 'gt',
    '=': 'eq',
    '==': 'eq',
  };
  return { op: opMap[operator] || '', left, target: right };
}

function collectConstraints(fieldRule) {
  const structured = Array.isArray(fieldRule?.cross_field_constraints)
    ? fieldRule.cross_field_constraints
    : [];
  const legacy = Array.isArray(fieldRule?.constraints)
    ? fieldRule.constraints
    : [];
  const out = [];
  for (const c of structured) {
    if (c && typeof c === 'object') out.push(c);
  }
  for (const c of legacy) {
    if (typeof c === 'string') {
      const parsed = parseConstraintExpression(c);
      if (parsed) out.push(parsed);
    } else if (c && typeof c === 'object') {
      out.push(c);
    }
  }
  return out;
}

function renderConstraintLine(c) {
  if (!c || typeof c !== 'object') return '';
  if (c.raw) return String(c.raw || '').trim();
  const target = String(c.target || c.right || '').trim();
  switch (c.op) {
    case 'lte': return target ? `must be \u2264 \`${target}\`` : '';
    case 'lt': return target ? `must be < \`${target}\`` : '';
    case 'gte': return target ? `must be \u2265 \`${target}\`` : '';
    case 'gt': return target ? `must be > \`${target}\`` : '';
    case 'eq': return target ? `must equal \`${target}\`` : '';
    case 'requires_when_value': {
      if (!target) return '';
      const val = String(c.value || '').trim();
      return `required when \`${target}\` = "${val}"`;
    }
    case 'requires_one_of': {
      if (!Array.isArray(c.targets) || c.targets.length === 0) return '';
      return `requires one of: ${c.targets.join(', ')}`;
    }
    default: return '';
  }
}

export function buildCrossFieldConstraintsBlock(fieldRule) {
  const constraints = collectConstraints(fieldRule);
  if (constraints.length === 0) return '';
  const lines = ['Cross-field constraints:'];
  const seen = new Set();
  for (const c of constraints) {
    const rendered = renderConstraintLine(c);
    if (rendered && !seen.has(rendered)) {
      seen.add(rendered);
      lines.push(`- ${rendered}`);
    }
  }
  if (lines.length === 1) return '';
  return lines.join('\n');
}
