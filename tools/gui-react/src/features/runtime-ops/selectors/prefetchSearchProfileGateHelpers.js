function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const FIELD_RULE_GATE_KEY_ORDER = [
  'search_hints.query_terms',
  'search_hints.domain_hints',
  'search_hints.preferred_content_types',
];

const FIELD_RULE_GATE_LABELS = {
  'search_hints.query_terms': 'Query Terms',
  'search_hints.domain_hints': 'Domain Hints',
  'search_hints.preferred_content_types': 'Content Types',
};

function normalizeGateStatus({ valueCount = 0, enabledFieldCount = 0, disabledFieldCount = 0, status = '' }) {
  const token = String(status || '').trim().toLowerCase();
  if (token === 'off') return 'off';
  if (token === 'active' || token === 'on') {
    return valueCount > 0 ? 'active' : 'zero';
  }
  if (disabledFieldCount > 0 && enabledFieldCount === 0) {
    return 'off';
  }
  return valueCount > 0 ? 'active' : 'zero';
}

export function normalizeFieldRuleGateCounts(gateCounts = {}) {
  if (!gateCounts || typeof gateCounts !== 'object') {
    return [];
  }

  const hasKnownRows = FIELD_RULE_GATE_KEY_ORDER.some((key) => {
    const row = gateCounts[key];
    return row && typeof row === 'object';
  });
  if (!hasKnownRows) {
    return [];
  }

  return FIELD_RULE_GATE_KEY_ORDER.map((key) => {
    const row = gateCounts[key];
    const normalizedRow = row && typeof row === 'object' ? row : {};
    const valueCount = Math.max(0, toInt(normalizedRow.value_count, 0));
    const effectiveValueCount = Math.max(0, toInt(normalizedRow.effective_value_count, valueCount));
    const totalValueCount = Math.max(
      effectiveValueCount,
      Math.max(0, toInt(normalizedRow.total_value_count, effectiveValueCount)),
    );
    const enabledFieldCount = Math.max(0, toInt(normalizedRow.enabled_field_count, 0));
    const disabledFieldCount = Math.max(0, toInt(normalizedRow.disabled_field_count, 0));
    return {
      key,
      label: FIELD_RULE_GATE_LABELS[key] || key,
      valueCount,
      totalValueCount,
      effectiveValueCount,
      enabledFieldCount,
      disabledFieldCount,
      status: normalizeGateStatus({
        valueCount,
        enabledFieldCount,
        disabledFieldCount,
        status: normalizedRow.status,
      }),
    };
  });
}

function normalizeRowGateStatus(valueCount, statusToken = '') {
  const token = String(statusToken || '').trim().toLowerCase();
  if (token === 'off') return 'off';
  if (token === 'active' || token === 'on') {
    return valueCount > 0 ? 'active' : 'zero';
  }
  return valueCount > 0 ? 'active' : 'zero';
}

export function resolveFieldRuleHintCountForRowGate({
  perFieldHintCounts,
  gateKey = '',
  fallbackGate,
} = {}) {
  const key = String(gateKey || '').trim();
  const rowValue = perFieldHintCounts && typeof perFieldHintCounts === 'object'
    ? perFieldHintCounts[key]
    : null;
  if (rowValue && typeof rowValue === 'object') {
    const value = Math.max(0, toInt(rowValue.value_count, 0));
    const effective = Math.max(0, toInt(rowValue.effective_value_count, value));
    const total = Math.max(effective, Math.max(0, toInt(rowValue.total_value_count, effective)));
    const status = normalizeRowGateStatus(value, rowValue.status);
    return { status, value, total, effective };
  }

  const fallbackStatus = String(fallbackGate?.status || '').trim().toLowerCase();
  if (fallbackStatus === 'off') {
    return { status: 'off', value: 0, total: 0, effective: 0 };
  }
  return { status: 'zero', value: 0, total: 0, effective: 0 };
}

export function sourceHostFromRow(row = {}) {
  const fromSourceHost = String(row?.source_host || '').trim();
  if (fromSourceHost) return fromSourceHost;

  const fromDomainHint = String(row?.domain_hint || '').trim();
  if (fromDomainHint) return fromDomainHint;

  const match = String(row?.query || '')
    .toLowerCase()
    .match(/\bsite:\s*([a-z0-9.-]+)/i);
  return match ? match[1].trim() : '';
}

export function isRuntimeSource(row = {}) {
  return String(row?.hint_source || '')
    .trim()
    .toLowerCase()
    .startsWith('runtime_bridge');
}

export function shouldUseProfileCounts(row = {}) {
  return Boolean(row?.__from_plan_profile) || isRuntimeSource(row) || !row?.hint_source;
}

export function hasFieldRuleSourceFromCounts(counts, target) {
  if (!counts || typeof counts !== 'object') {
    return false;
  }
  const targetSource = target ? String(target || '').toLowerCase() : 'field_rules.';
  for (const [source, value] of Object.entries(counts)) {
    const sourceToken = String(source || '').toLowerCase().trim();
    if (!sourceToken || !Number.isFinite(Number(value)) || Number(value) <= 0) {
      continue;
    }
    if (target ? sourceToken === targetSource : sourceToken.startsWith('field_rules.')) {
      return true;
    }
  }
  return false;
}

export function sumHintSourceCounts(counts, targetPrefixOrExact = 'field_rules.') {
  if (!counts || typeof counts !== 'object') return 0;
  const target = String(targetPrefixOrExact || '').toLowerCase().trim();
  if (!target) return 0;

  let sum = 0;
  const exact = !target.endsWith('.');
  for (const [source, value] of Object.entries(counts)) {
    const sourceToken = String(source || '').toLowerCase().trim();
    if (!sourceToken) continue;
    if (exact ? sourceToken !== target : !sourceToken.startsWith(target)) continue;
    const n = Math.max(0, toInt(value, 0));
    sum += n;
  }
  return sum;
}

export function isFieldRulesSource(row = {}) {
  const source = String(row?.hint_source || '').toLowerCase();
  return source.startsWith('field_rules.');
}

export function isQueryTermsSource(row = {}) {
  const source = String(row?.hint_source || '').toLowerCase();
  return source === 'field_rules.search_hints';
}

export function fieldRulesCountForSource(row = {}, hintSourceCounts = {}) {
  const source = String(row?.hint_source || '').trim().toLowerCase();
  if (!source || !source.startsWith('field_rules.')) {
    return 0;
  }
  if (!hintSourceCounts || typeof hintSourceCounts !== 'object') {
    return 0;
  }
  for (const [key, value] of Object.entries(hintSourceCounts)) {
    if (String(key || '').trim().toLowerCase() !== source) continue;
    return Math.max(0, toInt(value, 0));
  }
  return 0;
}

export function getQueryGateFlags(row = {}, hintSourceCounts = {}) {
  const queryTerms = isQueryTermsSource(row);
  const fieldRules = isFieldRulesSource(row);
  return {
    queryTerms,
    domainHints: Boolean(row?.domain_hint),
    contentTypes: Boolean(row?.doc_hint),
    fieldRules,
    contract: fieldRules,
    sourceHost: Boolean(sourceHostFromRow(row)),
  };
}

export function querySourceLabel(row = {}) {
  const source = String(row?.hint_source || '').trim();
  if (source) return source;
  return 'runtime_bridge';
}

export function querySourceChipClass(source) {
  const normalized = String(source || '').toLowerCase();
  if (normalized.startsWith('field_rules.')) {
    return 'sf-chip-accent';
  }
  if (normalized.startsWith('runtime_bridge')) {
    return 'sf-chip-neutral';
  }
  return 'sf-chip-warning';
}

export function buildGateSummary(queryRows = [], hintSourceCounts = {}) {
  const rows = Array.isArray(queryRows) ? queryRows : [];
  let queryTermsCount = 0;
  let domainHintsCount = 0;
  let contentTypesCount = 0;
  let fieldRulesCount = 0;
  let sourceHostCount = 0;
  let fieldRuleSourceRows = 0;
  let runtimeSourceRows = 0;

  for (const row of rows) {
    const flags = getQueryGateFlags(row, hintSourceCounts);
    if (flags.queryTerms) queryTermsCount += 1;
    if (flags.domainHints) domainHintsCount += 1;
    if (flags.contentTypes) contentTypesCount += 1;
    if (flags.fieldRules) fieldRulesCount += 1;
    if (flags.sourceHost) sourceHostCount += 1;
    const source = querySourceLabel(row).toLowerCase();
    if (source.startsWith('field_rules.')) {
      fieldRuleSourceRows += 1;
    } else if (source.startsWith('runtime_bridge')) {
      runtimeSourceRows += 1;
    }
  }

  const fieldRuleKeyCounts = Object.entries(hintSourceCounts || {})
    .map(([source, count]) => ({ source: String(source || '').trim(), count: Math.max(0, toInt(count, 0)) }))
    .filter((row) => row.source.toLowerCase().startsWith('field_rules.') && row.count > 0)
    .sort((a, b) => b.count - a.count);
  const indexedFieldRulesCount = fieldRuleKeyCounts.reduce((sum, row) => sum + Math.max(0, toInt(row.count, 0)), 0);
  fieldRulesCount = Math.max(fieldRulesCount, indexedFieldRulesCount);

  return {
    queryTermsCount,
    domainHintsCount,
    contentTypesCount,
    fieldRulesCount,
    contractCount: fieldRulesCount,
    sourceHostCount,
    queryTermsOn: queryTermsCount > 0,
    domainHintsOn: domainHintsCount > 0,
    contentTypesOn: contentTypesCount > 0,
    fieldRulesOn: fieldRulesCount > 0,
    contractOn: fieldRulesCount > 0,
    sourceHostOn: sourceHostCount > 0,
    fieldRuleSourceRows,
    runtimeSourceRows,
    total: rows.length,
    fieldRuleKeyCounts,
  };
}

export const isContractSource = isFieldRulesSource;
