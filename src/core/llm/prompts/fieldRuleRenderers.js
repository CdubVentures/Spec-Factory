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

  const lines = ['Return contract:'];
  lines.push(`- Type: ${type}${shape === 'list' ? ' (list / array)' : ' (scalar)'}`);
  if (unit) lines.push(`- Unit: ${unit} (include the numeric value only; unit is known from context)`);
  if (rounding && Number.isFinite(rounding.decimals)) {
    lines.push(`- Rounding: ${rounding.decimals} decimal(s), mode=${rounding.mode || 'nearest'}`);
  }
  if (shape === 'list' && listRules) {
    const ruleParts = [];
    if (listRules.dedupe) ruleParts.push('dedupe');
    if (listRules.sort && listRules.sort !== 'none') ruleParts.push(`sort=${listRules.sort}`);
    if (ruleParts.length) lines.push(`- List rules: ${ruleParts.join(', ')}`);
  }
  if (enumValues.length > 0) {
    lines.push(`- Allowed values (policy: ${enumPolicy || 'open'}): ${enumValues.slice(0, 24).join(' | ')}`);
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

function renderConstraintLine(c) {
  if (!c || typeof c !== 'object') return '';
  const target = String(c.target || '').trim();
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
  const constraints = Array.isArray(fieldRule?.cross_field_constraints)
    ? fieldRule.cross_field_constraints
    : [];
  if (constraints.length === 0) return '';
  const lines = ['Cross-field constraints:'];
  for (const c of constraints) {
    const rendered = renderConstraintLine(c);
    if (rendered) lines.push(`- ${rendered}`);
  }
  if (lines.length === 1) return '';
  return lines.join('\n');
}
