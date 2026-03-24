import {
  clean,
  toArray,
  isObject,
  hasOwn,
  readPathValue,
  hasPathValue,
  STOPWORDS,
  normalizeSearchTerm
} from './queryIdentityNormalizer.js';
import { resolveConsumerGate } from '../../../field-rules/consumerGate.js';

const FIELD_SYNONYMS = {
  polling_rate: ['polling rate', 'report rate', 'hz'],
  dpi: ['dpi', 'cpi'],
  sensor: ['sensor', 'optical sensor'],
  click_latency: ['click latency', 'response time'],
  battery_hours: ['battery life', 'battery hours'],
  weight: ['weight', 'mass', 'grams'],
  switch: ['switch type', 'microswitch'],
  connection: ['connectivity', 'wireless', 'wired'],
  lift: ['lift off distance', 'lod']
};

const CONTENT_TYPE_SUFFIX = {
  manual: 'manual',
  manual_pdf: 'manual pdf',
  support: 'support',
  spec: 'specification',
  spec_sheet: 'specification sheet',
  spec_pdf: 'specification pdf',
  datasheet: 'datasheet',
  datasheet_pdf: 'datasheet pdf',
  product_page: 'product page',
  teardown: 'teardown',
  teardown_review: 'teardown review',
  lab_review: 'lab review',
  benchmark: 'benchmark'
};

const SEARCH_HINT_GATE_SPECS = [
  { key: 'search_hints.query_terms', name: 'query_terms', path: ['search_hints', 'query_terms'] },
  { key: 'search_hints.domain_hints', name: 'domain_hints', path: ['search_hints', 'domain_hints'] },
  { key: 'search_hints.preferred_content_types', name: 'preferred_content_types', path: ['search_hints', 'preferred_content_types'] }
];

function extractTooltipTerms(value) {
  const text = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s/_-]+/g, ' ');
  const tokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  const phrases = [];
  for (let i = 0; i < tokens.length - 1 && phrases.length < 4; i += 1) {
    if (tokens[i] === tokens[i + 1]) {
      continue;
    }
    phrases.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return [...new Set(phrases.map((item) => normalizeSearchTerm(item)).filter(Boolean))].slice(0, 4);
}

export function fieldSynonyms(field, lexicon, fieldRule = {}, tooltipHints = {}) {
  const defaults = FIELD_SYNONYMS[field] || [field];
  const learned = Object.entries(lexicon?.fields?.[field]?.synonyms || {})
    .sort((a, b) => {
      const aScore = (a[1].count || 0) * Math.log2(1 + Math.max(1, Object.keys(a[1].hosts || {}).length));
      const bScore = (b[1].count || 0) * Math.log2(1 + Math.max(1, Object.keys(b[1].hosts || {}).length));
      return bScore - aScore || a[0].localeCompare(b[0]);
    })
    .slice(0, 6)
    .map(([token]) => token)
    .filter(Boolean);
  const fromRule = toArray(fieldRule?.search_hints?.query_terms)
    .map((value) => normalizeSearchTerm(value))
    .filter(Boolean);
  const tooltipGateEnabled = resolveConsumerGate(fieldRule, 'ui.tooltip_md', 'indexlab').enabled;
  const fromTooltipHints = tooltipGateEnabled
    ? toArray(tooltipHints?.[field])
      .map((value) => normalizeSearchTerm(value))
      .filter(Boolean)
    : [];
  const fromTooltipMd = tooltipGateEnabled
    ? extractTooltipTerms(fieldRule?.ui?.tooltip_md || fieldRule?.tooltip_md || '')
    : [];
  return [...new Set([...fromRule, ...defaults, ...learned, ...fromTooltipHints, ...fromTooltipMd])]
    .filter(Boolean)
    .slice(0, 12);
}

export function lookupFieldRule(categoryConfig, field) {
  return categoryConfig?.fieldRules?.fields?.[field] || {};
}

function countHintValues(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => clean(entry))
      .filter(Boolean)
      .length;
  }
  const token = clean(value);
  return token ? 1 : 0;
}

function countEffectiveDomainHintValues(value) {
  const rows = Array.isArray(value) ? value : [value];
  return rows
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean)
    .filter((entry) => entry.includes('.'))
    .length;
}

export function buildFieldRuleGateCounts(categoryConfig = {}) {
  const fieldRules = categoryConfig?.fieldRules?.fields;
  if (!isObject(fieldRules)) {
    return {};
  }

  const out = {};
  for (const spec of SEARCH_HINT_GATE_SPECS) {
    let valueCount = 0;
    let totalValueCount = 0;
    let enabledFieldCount = 0;
    let disabledFieldCount = 0;
    for (const rule of Object.values(fieldRules)) {
      if (!isObject(rule)) continue;
      const gate = resolveConsumerGate(rule, spec.key, 'indexlab');
      const hasPath = hasPathValue(rule, spec.path);
      if (!hasPath && !gate.explicit) {
        continue;
      }
      if (!gate.enabled) {
        disabledFieldCount += 1;
        continue;
      }
      enabledFieldCount += 1;
      const hintValue = readPathValue(rule, spec.path);
      const rawCount = countHintValues(hintValue);
      const effectiveCount = spec.name === 'domain_hints'
        ? countEffectiveDomainHintValues(hintValue)
        : rawCount;
      valueCount += effectiveCount;
      totalValueCount += rawCount;
    }
    const status = disabledFieldCount > 0 && enabledFieldCount === 0
      ? 'off'
      : (valueCount > 0 ? 'active' : 'zero');
    const gateRow = {
      value_count: valueCount,
      enabled_field_count: enabledFieldCount,
      disabled_field_count: disabledFieldCount,
      status
    };
    gateRow.total_value_count = totalValueCount;
    gateRow.effective_value_count = valueCount;
    out[spec.key] = gateRow;
  }

  return out;
}

export function buildFieldRuleHintCountsByField(categoryConfig = {}) {
  const fieldRules = categoryConfig?.fieldRules?.fields;
  if (!isObject(fieldRules)) {
    return {};
  }

  const out = {};
  for (const [fieldKey, rule] of Object.entries(fieldRules)) {
    if (!isObject(rule)) continue;
    const row = {};
    for (const spec of SEARCH_HINT_GATE_SPECS) {
      const gate = resolveConsumerGate(rule, spec.key, 'indexlab');
      const hasPath = hasPathValue(rule, spec.path);
      const hintValue = gate.enabled && hasPath
        ? readPathValue(rule, spec.path)
        : undefined;
      const rawValueCount = gate.enabled && hasPath
        ? countHintValues(hintValue)
        : 0;
      const valueCount = spec.name === 'domain_hints'
        ? countEffectiveDomainHintValues(hintValue)
        : rawValueCount;
      row[spec.name] = {
        value_count: valueCount,
        status: gate.enabled
          ? (valueCount > 0 ? 'active' : 'zero')
          : 'off'
      };
      row[spec.name].total_value_count = rawValueCount;
      row[spec.name].effective_value_count = valueCount;
    }
    out[fieldKey] = row;
  }
  return out;
}

export function contentTypeSuffixes(fieldRule = {}) {
  const values = toArray(fieldRule?.search_hints?.preferred_content_types)
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const out = [];
  for (const value of values) {
    out.push(CONTENT_TYPE_SUFFIX[value] || normalizeSearchTerm(value));
  }
  return [...new Set(out.filter(Boolean))].slice(0, 4);
}

export function domainHintsForField(fieldRule = {}) {
  return toArray(fieldRule?.search_hints?.domain_hints)
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value.includes('.'));
}

