import { normalizeFieldList } from '../../../utils/fieldKeys.js';
import { resolveConsumerGate } from '../../../field-rules/consumerGate.js';
import { compileQuery, compileQueryBatch } from '../discovery/queryCompiler.js';

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function readPathValue(target, segments = []) {
  let cursor = target;
  for (const segment of segments) {
    if (!isObject(cursor) || !hasOwn(cursor, segment)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function hasPathValue(target, segments = []) {
  if (!segments.length) return false;
  let cursor = target;
  for (const segment of segments) {
    if (!isObject(cursor) || !hasOwn(cursor, segment)) {
      return false;
    }
    cursor = cursor[segment];
  }
  return true;
}

function resolveJobIdentity(job = {}) {
  const identityLock = isObject(job?.identityLock) ? job.identityLock : {};
  return {
    brand: clean(identityLock.brand || job?.brand || ''),
    model: clean(identityLock.model || job?.model || ''),
    variant: clean(identityLock.variant || job?.variant || '')
  };
}

const STOPWORDS = new Set([
  'according',
  'after',
  'before',
  'common',
  'contract',
  'define',
  'evidence',
  'field',
  'from',
  'list',
  'normalize',
  'output',
  'prefer',
  'proval',
  'provable',
  'reason',
  'required',
  'sorted',
  'value',
  'values',
  'when',
  'with'
]);

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

const BRAND_HOST_HINTS = {
  logitech: ['logitech', 'logitechg', 'logi'],
  razer: ['razer'],
  steelseries: ['steelseries'],
  alienware: ['alienware', 'dell'],
  dell: ['dell', 'alienware'],
  asus: ['asus', 'rog'],
  zowie: ['zowie', 'benq'],
  benq: ['benq', 'zowie'],
  hp: ['hp', 'hyperx'],
  hyperx: ['hyperx', 'hp'],
  lenovo: ['lenovo', 'legion'],
  msi: ['msi'],
  acer: ['acer', 'predator'],
  finalmouse: ['finalmouse'],
  lamzu: ['lamzu'],
  pulsar: ['pulsar'],
  corsair: ['corsair'],
  glorious: ['glorious'],
  endgame: ['endgamegear', 'endgame-gear']
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

const CONTENT_TYPE_TO_HOST_PLAN_INTENT = Object.freeze({
  manual: 'manual',
  manual_pdf: 'manual',
  support: 'manual',
  spec: 'spec',
  spec_sheet: 'spec',
  spec_pdf: 'spec',
  specification: 'spec',
  specifications: 'spec',
  datasheet: 'datasheet',
  datasheet_pdf: 'datasheet',
  review: 'review',
  lab_review: 'review',
  benchmark: 'benchmark',
  teardown: 'teardown',
  teardown_review: 'teardown',
  product_page: 'product_page',
  firmware: 'firmware',
  software: 'software',
  driver: 'driver',
});

const V2_SCORING_WEIGHTS = Object.freeze({
  base_score: 12,
  needset_coverage: 3.5,
  field_affinity: 2.5,
  diversity: 1.5,
  host_health: 1.5,
  operator_risk: 1.0,
});

const TIER_BONUS_BY_NUMERIC = Object.freeze({
  1: 1.5,
  2: 1.0,
  3: 0.5,
  4: 0.2,
  5: 0.1,
});

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function manufacturerHostHintsForBrand(brand) {
  const hints = new Set(tokenize(brand));
  const brandSlug = slug(brand);
  for (const [key, aliases] of Object.entries(BRAND_HOST_HINTS)) {
    if (brandSlug.includes(key) || hints.has(key)) {
      for (const alias of aliases) {
        hints.add(alias);
      }
    }
  }
  return [...hints];
}

const TLD_STOPWORDS = new Set(['com', 'net', 'org', 'io', 'co', 'dev', 'gg', 'xyz', 'info']);

function selectManufacturerHosts(categoryConfig, brand, extraHints = []) {
  const hints = manufacturerHostHintsForBrand(brand);
  for (const hint of toArray(extraHints)) {
    hints.push(...tokenize(hint).filter((t) => !TLD_STOPWORDS.has(t)));
  }
  const rows = toArray(categoryConfig?.sourceHosts)
    .filter((row) => String(row?.tierName || row?.role || '').toLowerCase() === 'manufacturer')
    .map((row) => String(row?.host || '').trim().toLowerCase())
    .filter(Boolean);
  if (!hints.length) {
    return rows.slice(0, 4);
  }
  return rows.filter((host) => hints.some((hint) => host.includes(hint))).slice(0, 6);
}

function normalizeSearchTerm(value) {
  return clean(String(value || '').replace(/_/g, ' '));
}

function splitAlphaDigit(value) {
  return clean(
    String(value || '')
      .replace(/([a-z])([0-9])/gi, '$1 $2')
      .replace(/([0-9])([a-z])/gi, '$1 $2')
  );
}

function sanitizeAlias(value) {
  return clean(String(value || '').toLowerCase());
}

const GENERIC_GUARD_TOKENS = new Set([
  'gaming',
  'mouse',
  'mice',
  'wireless',
  'wired',
  'edition',
  'black',
  'white',
  'mini',
  'ultra',
  'pro',
  'plus',
  'core',
  'version',
  'series',
  'usb',
  'rgb'
]);

function compactToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function extractIdentityTokens(value, { minLength = 2 } = {}) {
  return [...new Set(
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= Math.max(1, minLength))
  )];
}

function extractDigitGroups(value) {
  return [...new Set(
    String(value || '')
      .toLowerCase()
      .match(/\d{2,}/g) || []
  )];
}

function buildVariantGuardTerms(identity = {}) {
  const brand = clean(identity.brand || '').toLowerCase();
  const model = clean(identity.model || '').toLowerCase();
  const variant = clean(identity.variant || '').toLowerCase();
  const product = clean([brand, model, variant].filter(Boolean).join(' '));
  const modelVariant = clean([model, variant].filter(Boolean).join(' '));
  const productCompact = compactToken(product);
  const brandCompact = compactToken(brand);
  const modelCompact = compactToken(modelVariant || model);
  const tokens = [...new Set([
    ...extractIdentityTokens(modelVariant || model, { minLength: 2 }),
    ...extractIdentityTokens(variant, { minLength: 2 })
  ])]
    .filter((token) => !GENERIC_GUARD_TOKENS.has(token))
    .slice(0, 10);
  const digitGroups = extractDigitGroups(modelVariant || model).slice(0, 6);

  return [...new Set([
    product,
    clean([brand, model].filter(Boolean).join(' ')),
    modelVariant || model,
    brandCompact,
    modelCompact,
    productCompact,
    ...tokens,
    ...digitGroups
  ].map((value) => clean(value).toLowerCase()).filter(Boolean))]
    .slice(0, 16);
}

function buildModelAliasCandidates(identity = {}) {
  const model = clean(identity.model || '');
  const variant = clean(identity.variant || '');
  const base = clean([model, variant].filter(Boolean).join(' '));
  if (!base) {
    return [];
  }

  const compact = sanitizeAlias(base).replace(/[^a-z0-9]+/g, '');
  const spaced = splitAlphaDigit(compact);
  const hyphen = spaced.replace(/\s+/g, '-');
  const raw = sanitizeAlias(base);
  const spacedRaw = splitAlphaDigit(raw);
  const hyphenRaw = sanitizeAlias(spacedRaw.replace(/\s+/g, '-'));

  return [...new Set([compact, spaced, hyphen, raw, spacedRaw, hyphenRaw].filter(Boolean))];
}

export function buildDeterministicAliases(identity = {}, maxAliases = 12, rejectLog = null) {
  const brand = clean(identity.brand || '');
  const model = clean(identity.model || '');
  const variant = clean(identity.variant || '');
  const cap = Math.max(1, Math.min(12, Number(maxAliases) || 12));

  const out = [];
  const seen = new Set();
  const addReject = ({ alias = '', source = 'deterministic', reason = '', stage = 'deterministic_alias', detail = '' }) => {
    if (!Array.isArray(rejectLog) || !reason) {
      return;
    }
    rejectLog.push({
      alias: sanitizeAlias(alias),
      source: clean(source || 'deterministic'),
      reason: clean(reason),
      stage: clean(stage),
      detail: clean(detail)
    });
  };
  const push = (alias, source = 'deterministic', weight = 1) => {
    const normalized = sanitizeAlias(alias);
    if (!normalized) {
      addReject({ alias, source, reason: 'empty_alias' });
      return;
    }
    if (seen.has(normalized)) {
      addReject({ alias: normalized, source, reason: 'duplicate_alias' });
      return;
    }
    if (out.length >= cap) {
      addReject({
        alias: normalized,
        source,
        reason: 'alias_cap_reached',
        detail: `cap:${cap}`
      });
      return;
    }
    seen.add(normalized);
    out.push({
      alias: normalized,
      source,
      weight
    });
  };

  if (brand) {
    push(brand, 'deterministic', 0.8);
  }
  const productFull = clean([brand, model, variant].filter(Boolean).join(' '));
  if (productFull) {
    push(productFull, 'deterministic', 1);
  }
  const brandModel = clean([brand, model].filter(Boolean).join(' '));
  if (brandModel) {
    push(brandModel, 'deterministic', 0.95);
  }
  for (const modelAlias of buildModelAliasCandidates({ model, variant })) {
    push(modelAlias, 'deterministic', 0.9);
    if (brand) {
      push(`${brand} ${modelAlias}`, 'deterministic', 1);
    }
  }

  return out;
}

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

function fieldSynonyms(field, lexicon, fieldRule = {}, tooltipHints = {}) {
  const defaults = FIELD_SYNONYMS[field] || [field];
  const learned = Object.entries(lexicon?.fields?.[field]?.synonyms || {})
    .sort((a, b) => (b[1].count || 0) - (a[1].count || 0))
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

function lookupFieldRule(categoryConfig, field) {
  return categoryConfig?.fieldRules?.fields?.[field] || {};
}

const SEARCH_HINT_GATE_SPECS = [
  { key: 'search_hints.query_terms', name: 'query_terms', path: ['search_hints', 'query_terms'] },
  { key: 'search_hints.domain_hints', name: 'domain_hints', path: ['search_hints', 'domain_hints'] },
  { key: 'search_hints.preferred_content_types', name: 'preferred_content_types', path: ['search_hints', 'preferred_content_types'] }
];

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
    .filter((entry) => entry.includes('.'))
    .length;
}

function buildFieldRuleGateCounts(categoryConfig = {}) {
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

function buildFieldRuleHintCountsByField(categoryConfig = {}) {
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

function contentTypeSuffixes(fieldRule = {}) {
  const values = toArray(fieldRule?.search_hints?.preferred_content_types)
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const out = [];
  for (const value of values) {
    out.push(CONTENT_TYPE_SUFFIX[value] || normalizeSearchTerm(value));
  }
  return [...new Set(out.filter(Boolean))].slice(0, 4);
}

function domainHintsForField(fieldRule = {}) {
  return toArray(fieldRule?.search_hints?.domain_hints)
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value.includes('.'));
}

function hostPlanIntentTokensForField(fieldRule = {}) {
  const values = toArray(fieldRule?.search_hints?.preferred_content_types)
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const intents = [];
  for (const value of values) {
    const mapped = CONTENT_TYPE_TO_HOST_PLAN_INTENT[value];
    if (mapped) {
      intents.push(mapped);
    }
  }
  return [...new Set(intents)];
}

export function collectHostPlanHintTokens({ categoryConfig, focusFields = [] } = {}) {
  const tokens = [];
  for (const field of toArray(focusFields)) {
    const fieldRule = lookupFieldRule(categoryConfig, field);
    if (!fieldRule) continue;

    const domainHintsGateEnabled = resolveConsumerGate(fieldRule, 'search_hints.domain_hints', 'indexlab').enabled;
    if (domainHintsGateEnabled) {
      for (const value of toArray(fieldRule?.search_hints?.domain_hints)) {
        const token = String(value || '').trim().toLowerCase();
        if (token) tokens.push(token);
      }
    }

    const contentTypesGateEnabled = resolveConsumerGate(fieldRule, 'search_hints.preferred_content_types', 'indexlab').enabled;
    if (contentTypesGateEnabled) {
      tokens.push(...hostPlanIntentTokensForField(fieldRule));
    }
  }
  return [...new Set(tokens.filter(Boolean))];
}

function toFieldTargetMap(rows = [], perFieldCap = 3) {
  const cap = Math.max(1, Number(perFieldCap || 3));
  const out = {};
  for (const row of rows) {
    for (const field of toArray(row.target_fields)) {
      if (!field) continue;
      out[field] = out[field] || [];
      if (out[field].length >= cap) continue;
      if (!out[field].includes(row.query)) {
        out[field].push(row.query);
      }
    }
  }
  return out;
}

function toDocHintRows(rows = [], perHintCap = 3) {
  const cap = Math.max(1, Number(perHintCap || 3));
  const byHint = new Map();
  for (const row of rows) {
    const docHint = clean(row.doc_hint || '');
    if (!docHint) continue;
    if (!byHint.has(docHint)) {
      byHint.set(docHint, []);
    }
    const list = byHint.get(docHint);
    if (list.length >= cap) continue;
    if (!list.includes(row.query)) {
      list.push(row.query);
    }
  }
  return [...byHint.entries()].map(([doc_hint, queries]) => ({
    doc_hint,
    queries
  }));
}

function buildQueryRows({
  job,
  categoryConfig,
  focusFields = [],
  tooltipHints = {},
  lexicon = {},
  learnedQueries = {},
  identityAliases = [],
  maxRows = 72,
  rejectLog = [],
  brandResolutionHints = []
}) {
  const brand = clean(job?.identityLock?.brand || '');
  const model = clean(job?.identityLock?.model || '');
  const variant = clean(job?.identityLock?.variant || '');
  const product = clean([brand, model, variant].filter(Boolean).join(' '));
  const rowCap = Math.max(1, Number(maxRows || 72));
  const rows = [];
  const seen = new Map();
  const addReject = ({
    query = '',
    source = 'deterministic',
    reason = '',
    stage = 'query_row_builder',
    detail = ''
  }) => {
    if (!Array.isArray(rejectLog) || !reason) {
      return;
    }
    rejectLog.push({
      query: clean(query),
      source: clean(source || 'deterministic'),
      reason: clean(reason),
      stage: clean(stage),
      detail: clean(detail)
    });
  };
  const addRow = ({
    query,
    hintSource = 'deterministic',
    targetFields = [],
    docHint = '',
    alias = '',
    domainHint = ''
  }) => {
    const normalizedQuery = clean(query);
    const source = clean(hintSource || 'deterministic');
    if (!normalizedQuery || !brand) {
      addReject({
        query: normalizedQuery || String(query || ''),
        source,
        reason: !normalizedQuery ? 'empty_query' : 'missing_brand_identity'
      });
      return;
    }
    const token = normalizedQuery.toLowerCase();
    if (seen.has(token)) {
      const index = seen.get(token);
      const existing = rows[index];
      existing.target_fields = [...new Set([
        ...toArray(existing.target_fields),
        ...toArray(targetFields)
      ])];
      existing.hint_source = existing.hint_source || hintSource;
      if (!existing.doc_hint && docHint) existing.doc_hint = docHint;
      addReject({
        query: normalizedQuery,
        source,
        reason: 'duplicate_query_merged'
      });
      return;
    }
    if (rows.length >= rowCap) {
      addReject({
        query: normalizedQuery,
        source,
        reason: 'query_row_cap_reached',
        detail: `cap:${rowCap}`
      });
      return;
    }
    rows.push({
      query: normalizedQuery,
      hint_source: hintSource,
      target_fields: [...new Set(toArray(targetFields).filter(Boolean))],
      doc_hint: clean(docHint),
      alias: clean(alias),
      domain_hint: clean(domainHint),
      source_host: clean(domainHint)
    });
    seen.set(token, rows.length - 1);
  };

  const aliasRows = toArray(identityAliases)
    .map((row) => clean(row?.alias || ''))
    .filter(Boolean)
    .slice(0, 8);
  const queryAliasRows = aliasRows.filter((alias) => {
    const token = alias.toLowerCase();
    return (
      (token.includes(model.toLowerCase()) || token.includes(variant.toLowerCase())) &&
      !token.includes(brand.toLowerCase())
    );
  });

  for (const field of focusFields) {
    const fieldRule = lookupFieldRule(categoryConfig, field);
    const queryTermsGateEnabled = resolveConsumerGate(fieldRule, 'search_hints.query_terms', 'indexlab').enabled;
    const domainHintsGateEnabled = resolveConsumerGate(fieldRule, 'search_hints.domain_hints', 'indexlab').enabled;
    const contentTypesGateEnabled = resolveConsumerGate(fieldRule, 'search_hints.preferred_content_types', 'indexlab').enabled;
    const searchHintTerms = (queryTermsGateEnabled ? toArray(fieldRule?.search_hints?.query_terms) : [])
      .map((value) => normalizeSearchTerm(value))
      .filter(Boolean);
    const fallbackSynonyms = fieldSynonyms(field, lexicon, fieldRule, tooltipHints)
      .map((value) => normalizeSearchTerm(value))
      .filter(Boolean);
    const terms = [...new Set([
      ...searchHintTerms,
      ...fallbackSynonyms
    ])].slice(0, 12);
    const preferredContent = contentTypesGateEnabled ? contentTypeSuffixes(fieldRule) : [];
    const ruleDomainHints = domainHintsGateEnabled ? domainHintsForField(fieldRule) : [];
    let manufacturerHosts = selectManufacturerHosts(categoryConfig, brand, [...ruleDomainHints, ...brandResolutionHints]);
    if (manufacturerHosts.length === 0) {
      const officialHost = brandResolutionHints.find((h) => h.includes('.'));
      if (officialHost) manufacturerHosts = [officialHost];
    }
    const hosts = [...new Set([...manufacturerHosts, ...ruleDomainHints])].slice(0, 8);

    const perTypeCap = Math.max(2, Math.ceil(8 / Math.max(1, focusFields.length)));
    const templateCounts = new Map();
    const canEmit = (templateType) => {
      const key = `${field}:${templateType}`;
      const count = templateCounts.get(key) || 0;
      if (count >= perTypeCap) return false;
      templateCounts.set(key, count + 1);
      return true;
    };

    for (const term of terms) {
      const hintSource = searchHintTerms.includes(term)
        ? 'field_rules.search_hints'
        : 'deterministic';
      if (canEmit('spec')) {
        addRow({
          query: `${product} ${term} specification`,
          hintSource,
          targetFields: [field],
          docHint: 'spec',
          alias: product
        });
      }
      if (canEmit('manual_pdf')) {
        addRow({
          query: `${product} ${term} manual pdf`,
          hintSource,
          targetFields: [field],
          docHint: 'manual_pdf',
          alias: product
        });
      }
      for (const suffix of preferredContent) {
        if (canEmit(`content:${suffix}`)) {
          addRow({
            query: `${product} ${term} ${suffix}`,
            hintSource: 'field_rules.search_hints',
            targetFields: [field],
            docHint: suffix,
            alias: product
          });
        }
      }
      for (const host of hosts) {
        if (canEmit(`site:${host}`)) {
          addRow({
            query: `site:${host} ${brand} ${model} ${term}`,
            hintSource: 'field_rules.search_hints',
            targetFields: [field],
            domainHint: host
          });
        }
      }
      for (const alias of queryAliasRows.slice(0, 4)) {
        if (canEmit('alias')) {
          addRow({
            query: `${brand} ${alias} ${term} specification`,
            hintSource,
            targetFields: [field],
            alias
          });
        }
      }
    }

    for (const row of toArray(learnedQueries?.templates_by_field?.[field]).slice(0, 4)) {
      addRow({
        query: clean(row?.query || ''),
        hintSource: 'learned',
        targetFields: [field]
      });
    }
  }

  const brandKey = brand.toLowerCase();
  for (const row of toArray(learnedQueries?.templates_by_brand?.[brandKey]).slice(0, 6)) {
    addRow({
      query: clean(row?.query || ''),
      hintSource: 'learned',
      targetFields: focusFields
    });
  }

  if (!focusFields.length) {
    addRow({
      query: `${product} specifications`,
      hintSource: 'deterministic',
      docHint: 'spec'
    });
    addRow({
      query: `${product} datasheet pdf`,
      hintSource: 'deterministic',
      docHint: 'datasheet_pdf'
    });
  }

  return rows;
}

function fillTemplate(template, values) {
  return clean(
    String(template || '')
      .replaceAll('{brand}', values.brand || '')
      .replaceAll('{model}', values.model || '')
      .replaceAll('{variant}', values.variant || '')
      .replaceAll('{category}', values.category || '')
  );
}

function groupByTargetField(rows) {
  const byField = new Map();
  const noField = [];
  for (const row of rows) {
    const fields = toArray(row.target_fields).filter(Boolean);
    if (fields.length === 0) {
      noField.push(row);
      continue;
    }
    const primary = fields[0];
    if (!byField.has(primary)) byField.set(primary, []);
    byField.get(primary).push(row);
  }
  if (noField.length > 0) {
    byField.set('__untagged__', noField);
  }
  return byField;
}

function roundRobinInterleave(byField) {
  const buckets = [...byField.values()];
  if (buckets.length <= 1) return buckets[0] || [];
  const result = [];
  const indices = buckets.map(() => 0);
  let remaining = true;
  while (remaining) {
    remaining = false;
    for (let b = 0; b < buckets.length; b++) {
      if (indices[b] < buckets[b].length) {
        result.push(buckets[b][indices[b]]);
        indices[b] += 1;
        if (indices[b] < buckets[b].length) remaining = true;
      }
    }
    if (!remaining) break;
  }
  return result;
}

export function buildSearchProfile({
  job,
  categoryConfig,
  missingFields = [],
  tooltipHints = {},
  lexicon = {},
  learnedQueries = {},
  maxQueries = 24,
  brandResolution = null,
  aliasValidationCap = 12,
  fieldTargetQueriesCap = 3,
  docHintQueriesCap = 3,
}) {
  const resolvedIdentity = resolveJobIdentity(job);
  const brand = resolvedIdentity.brand;
  const model = resolvedIdentity.model;
  const variant = resolvedIdentity.variant;
  const category = clean(job?.category || categoryConfig?.category || 'mouse');
  const identity = { brand, model, variant, category };
  const aliasRejectLog = [];
  const queryRejectLog = [];
  const identityAliases = buildDeterministicAliases(identity, aliasValidationCap, aliasRejectLog);
  const variantGuardTerms = buildVariantGuardTerms(identity);

  const baseTemplates = toArray(categoryConfig?.searchTemplates)
    .map((template) => fillTemplate(template, { brand, model, variant, category }))
    .filter(Boolean);
  const focusFields = normalizeFieldList(toArray(missingFields), {
    fieldOrder: categoryConfig?.fieldOrder || []
  }).filter(Boolean);
  const brandResolutionHints = toArray(brandResolution?.aliases)
    .map((a) => String(a || '').trim().toLowerCase())
    .filter(Boolean);
  if (brandResolution?.officialDomain) {
    const official = String(brandResolution.officialDomain).trim().toLowerCase();
    if (official && !brandResolutionHints.includes(official)) {
      brandResolutionHints.unshift(official);
    }
  }
  const queryRows = buildQueryRows({
    job,
    categoryConfig,
    focusFields,
    tooltipHints,
    lexicon,
    learnedQueries,
    identityAliases,
    maxRows: Math.max(24, Number(maxQueries || 24) * 3),
    rejectLog: queryRejectLog,
    brandResolutionHints
  });

  const querySet = new Set();
  const selectedQueries = [];
  const addQuery = (query, source = 'query_selection') => {
    const normalized = clean(query).toLowerCase();
    const cleanedQuery = clean(query);
    if (!normalized) {
      queryRejectLog.push({
        query: cleanedQuery,
        source: clean(source),
        reason: 'empty_query',
        stage: 'query_selection',
        detail: ''
      });
      return;
    }
    if (querySet.has(normalized)) {
      queryRejectLog.push({
        query: cleanedQuery,
        source: clean(source),
        reason: 'duplicate_query',
        stage: 'query_selection',
        detail: ''
      });
      return;
    }
    querySet.add(normalized);
    selectedQueries.push(cleanedQuery);
  };
  for (const query of baseTemplates) {
    addQuery(query, 'base_template');
  }
  const interleaved = roundRobinInterleave(groupByTargetField(queryRows));
  for (const row of interleaved) {
    addQuery(row.query, row.hint_source || 'query_row');
  }
  if (!selectedQueries.length && brand && model) {
    addQuery(`${brand} ${model} ${variant} specifications`, 'fallback');
    addQuery(`${brand} ${model} datasheet pdf`, 'fallback');
  }

  const maxQueryCap = Math.max(1, Number(maxQueries || 24));
  const boundedQueries = selectedQueries.slice(0, maxQueryCap);
  if (selectedQueries.length > boundedQueries.length) {
    for (const query of selectedQueries.slice(maxQueryCap)) {
      queryRejectLog.push({
        query: clean(query),
        source: 'query_selection',
        reason: 'max_query_cap',
        stage: 'query_selection',
        detail: `cap:${maxQueryCap}`
      });
    }
  }
  const boundedRows = queryRows.filter((row) => boundedQueries.includes(row.query));
  const hintSourceCounts = {};
  for (const row of boundedRows) {
    const token = clean(row.hint_source || 'deterministic');
    hintSourceCounts[token] = (hintSourceCounts[token] || 0) + 1;
  }

  return {
    category,
    identity,
    variant_guard_terms: variantGuardTerms,
    identity_aliases: identityAliases,
    alias_reject_log: aliasRejectLog.slice(0, 120),
    query_reject_log: queryRejectLog.slice(0, 240),
    negative_terms: [],
    focus_fields: focusFields,
    base_templates: baseTemplates,
    query_rows: boundedRows,
    queries: boundedQueries,
    targeted_queries: boundedRows.map((row) => row.query),
    field_target_queries: toFieldTargetMap(boundedRows, fieldTargetQueriesCap),
    doc_hint_queries: toDocHintRows(boundedRows, docHintQueriesCap),
    hint_source_counts: hintSourceCounts,
    field_rule_gate_counts: buildFieldRuleGateCounts(categoryConfig),
    field_rule_hint_counts_by_field: buildFieldRuleHintCountsByField(categoryConfig)
  };
}

export function buildTargetedQueries(options = {}) {
  const profile = buildSearchProfile(options);
  return toArray(profile?.queries).slice(0, Math.max(1, Number(options?.maxQueries || 24)));
}

// -- v2 integration: logical plan generation from EffectiveHostPlan --

const INTENT_TO_FILETYPE = {
  datasheet: 'pdf',
  manual: 'pdf',
  spec: 'pdf',
  specification: 'pdf',
  firmware: 'zip',
};

/**
 * Build logical query plans from an EffectiveHostPlan.
 * Each searchable host gets a logical plan shaped for QueryCompiler input.
 */
export function buildLogicalPlansFromHostPlan(effectiveHostPlan, identity, focusFields) {
  if (!effectiveHostPlan || effectiveHostPlan.blocked) return [];

  const searchableGroups = (effectiveHostPlan.host_groups || []).filter(g => g.searchable);
  const product = clean(`${identity?.brand || ''} ${identity?.model || ''}`);
  if (!product.trim()) return [];

  const caps = effectiveHostPlan.provider_caps || {};
  const supportsSite = caps.supports_site || false;
  const supportsFiletype = caps.supports_filetype || false;

  const intents = effectiveHostPlan.content_intents || [];
  const docHint = intents.length > 0 ? intents[0] : '';
  const filetype = supportsFiletype && intents.length > 0
    ? (INTENT_TO_FILETYPE[intents[0]] || null)
    : null;

  const plans = [];
  for (const group of searchableGroups) {
    plans.push({
      product,
      terms: toArray(focusFields).map(f => clean(f)).filter(Boolean),
      site_target: supportsSite ? group.host : null,
      filetype,
      doc_hint: docHint,
      exact_phrases: [],
      exclude_terms: [],
      time_pref: null,
      hard_site: false,
      host_pref: group.host,
    });
  }
  return plans;
}

/**
 * Compile logical plans through QueryCompiler.
 */
export function compileLogicalPlans(logicalPlans, providerName) {
  return compileQueryBatch(logicalPlans, providerName);
}

function toFieldCoverageSets(policy = {}) {
  const coverage = policy?.field_coverage || {};
  return {
    high: new Set(toArray(coverage?.high).map((value) => String(value || '').trim()).filter(Boolean)),
    medium: new Set(toArray(coverage?.medium).map((value) => String(value || '').trim()).filter(Boolean)),
    low: new Set(toArray(coverage?.low).map((value) => String(value || '').trim()).filter(Boolean)),
  };
}

function computeCoverageSignals(policy = {}, focusFields = []) {
  const fields = toArray(focusFields).map((value) => String(value || '').trim()).filter(Boolean);
  if (fields.length === 0) {
    return { needsetCoverage: 0, fieldAffinity: 0 };
  }
  const coverage = toFieldCoverageSets(policy);
  let covered = 0;
  let affinityPoints = 0;
  for (const field of fields) {
    if (coverage.high.has(field)) {
      covered += 1;
      affinityPoints += 1.0;
      continue;
    }
    if (coverage.medium.has(field)) {
      covered += 1;
      affinityPoints += 0.6;
      continue;
    }
    if (coverage.low.has(field)) {
      covered += 1;
      affinityPoints += 0.3;
    }
  }
  return {
    needsetCoverage: covered / fields.length,
    fieldAffinity: affinityPoints / fields.length,
  };
}

function computeDiversityPenalty(hostGroup = {}, searchableGroups = []) {
  const groups = toArray(searchableGroups);
  if (groups.length <= 1) return 0;
  const sameTierCount = groups.filter((group) => String(group?.tier || '') === String(hostGroup?.tier || '')).length;
  if (sameTierCount <= 1) return 0;
  return -V2_SCORING_WEIGHTS.diversity * ((sameTierCount - 1) / Math.max(1, groups.length - 1));
}

function computeHostHealthPenalty(hostGroup = {}, policy = {}) {
  if (String(hostGroup?.health_action || '') === 'excluded') {
    return -V2_SCORING_WEIGHTS.host_health;
  }
  if (String(hostGroup?.health_action || '') === 'downranked') {
    return -(V2_SCORING_WEIGHTS.host_health * 0.75);
  }
  const successRate = Number(policy?.health?.success_rate_7d);
  const blockRate = Number(policy?.health?.block_rate_7d);
  if (Number.isFinite(successRate) && successRate < 0.5) {
    return -(V2_SCORING_WEIGHTS.host_health * 0.5);
  }
  if (Number.isFinite(blockRate) && blockRate > 0.3) {
    return -(V2_SCORING_WEIGHTS.host_health * 0.5);
  }
  return 0;
}

function computeOperatorRiskPenalty(compiled = {}) {
  const warnings = toArray(compiled?.warnings).map((value) => String(value || '').trim());
  if (warnings.some((warning) => warning.startsWith('provider_none'))) {
    return -V2_SCORING_WEIGHTS.operator_risk;
  }
  const unsupportedCount = warnings.filter((warning) => warning.includes('unsupported')).length;
  if (unsupportedCount === 0) return 0;
  return -Math.min(V2_SCORING_WEIGHTS.operator_risk, unsupportedCount * 0.5);
}

function buildFallbackQueryText(logicalPlan = {}) {
  return clean([
    logicalPlan.product,
    ...toArray(logicalPlan.terms),
    logicalPlan.doc_hint,
    logicalPlan.host_pref,
    logicalPlan.filetype,
  ].filter(Boolean).join(' '));
}

function sumScoreBreakdown(scoreBreakdown = {}) {
  return [
    'base_score',
    'frontier_penalty',
    'identity_bonus',
    'variant_guard_penalty',
    'multi_model_penalty',
    'tier_bonus',
    'host_health_penalty',
    'operator_risk_penalty',
    'field_affinity_bonus',
    'diversity_penalty',
    'needset_coverage_bonus',
  ].reduce((total, key) => total + Number(scoreBreakdown?.[key] || 0), 0);
}

export function buildScoredQueryRowsFromHostPlan(effectiveHostPlan, identity, focusFields) {
  if (!effectiveHostPlan || effectiveHostPlan.blocked) return [];

  const logicalPlans = buildLogicalPlansFromHostPlan(effectiveHostPlan, identity, focusFields);
  const searchableGroups = toArray(effectiveHostPlan.host_groups).filter((group) => group?.searchable);
  const providerName = String(effectiveHostPlan?.provider_caps?.name || 'none').trim() || 'none';
  const deduped = new Map();

  for (const logicalPlan of logicalPlans) {
    const host = String(logicalPlan?.host_pref || logicalPlan?.site_target || '').trim().toLowerCase();
    const hostGroup = searchableGroups.find((group) => String(group?.host || '').trim().toLowerCase() === host) || null;
    const policy = effectiveHostPlan?.policy_map?.[host] || null;
    const compiled = compileQuery(logicalPlan, providerName);
    const compiledQuery = String(compiled?.query || '').trim();
    const query = compiledQuery || buildFallbackQueryText(logicalPlan);
    if (!query) {
      continue;
    }

    const { needsetCoverage, fieldAffinity } = computeCoverageSignals(policy, focusFields);
    const score_breakdown = {
      base_score: V2_SCORING_WEIGHTS.base_score,
      frontier_penalty: 0,
      identity_bonus: 0,
      variant_guard_penalty: 0,
      multi_model_penalty: 0,
      tier_bonus: Number(TIER_BONUS_BY_NUMERIC[Number(policy?.tier_numeric || 99)] || 0),
      host_health_penalty: Number(computeHostHealthPenalty(hostGroup, policy).toFixed(3)),
      operator_risk_penalty: Number(computeOperatorRiskPenalty(compiled).toFixed(3)),
      field_affinity_bonus: Number((fieldAffinity * V2_SCORING_WEIGHTS.field_affinity).toFixed(3)),
      diversity_penalty: Number(computeDiversityPenalty(hostGroup, searchableGroups).toFixed(3)),
      needset_coverage_bonus: Number((needsetCoverage * V2_SCORING_WEIGHTS.needset_coverage).toFixed(3)),
      tier_source: policy ? 'host_policy' : 'legacy',
    };
    const score = Number(sumScoreBreakdown(score_breakdown).toFixed(3));
    const row = {
      query,
      sources: ['v2.host_plan'],
      hint_source: 'v2.host_plan',
      target_fields: toArray(focusFields).map((value) => String(value || '').trim()).filter(Boolean),
      doc_hint: String(logicalPlan?.doc_hint || '').trim(),
      domain_hint: String(logicalPlan?.site_target || host || '').trim(),
      source_host: host,
      providers: providerName === 'none' ? [] : [providerName],
      warnings: toArray(compiled?.warnings),
      score,
      score_breakdown,
      provider_compiled: compiledQuery.length > 0,
      host_plan_origin: String(hostGroup?.origin || '').trim(),
      host_plan_tier: String(hostGroup?.tier || policy?.tier || '').trim(),
    };

    const dedupeKey = query.toLowerCase();
    const existing = deduped.get(dedupeKey);
    if (!existing || score > existing.score) {
      deduped.set(dedupeKey, row);
      continue;
    }
    existing.target_fields = [...new Set([...toArray(existing.target_fields), ...toArray(row.target_fields)])];
    existing.warnings = [...new Set([...toArray(existing.warnings), ...toArray(row.warnings)])];
    if (!existing.source_host && row.source_host) existing.source_host = row.source_host;
    if (!existing.domain_hint && row.domain_hint) existing.domain_hint = row.domain_hint;
  }

  return [...deduped.values()]
    .sort((left, right) => right.score - left.score || left.query.localeCompare(right.query));
}
