import { normalizeFieldList } from '../utils/fieldKeys.js';
import { resolveConsumerGate } from '../field-rules/consumerGate.js';

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
  const fromTooltipHints = toArray(tooltipHints?.[field])
    .map((value) => normalizeSearchTerm(value))
    .filter(Boolean);
  const fromTooltipMd = extractTooltipTerms(fieldRule?.ui?.tooltip_md || fieldRule?.tooltip_md || '');
  return [...new Set([...fromRule, ...defaults, ...learned, ...fromTooltipHints, ...fromTooltipMd])]
    .filter(Boolean)
    .slice(0, 12);
}

function lookupFieldRule(categoryConfig, field) {
  return categoryConfig?.fieldRules?.fields?.[field] || {};
}

const SEARCH_HINT_GATE_SPECS = [
  { key: 'search_hints.query_terms', path: ['search_hints', 'query_terms'] },
  { key: 'search_hints.domain_hints', path: ['search_hints', 'domain_hints'] },
  { key: 'search_hints.preferred_content_types', path: ['search_hints', 'preferred_content_types'] }
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

function buildFieldRuleGateCounts(categoryConfig = {}) {
  const fieldRules = categoryConfig?.fieldRules?.fields;
  if (!isObject(fieldRules)) {
    return {};
  }

  const out = {};
  for (const spec of SEARCH_HINT_GATE_SPECS) {
    let valueCount = 0;
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
      valueCount += countHintValues(readPathValue(rule, spec.path));
    }
    const status = disabledFieldCount > 0 && enabledFieldCount === 0
      ? 'off'
      : (valueCount > 0 ? 'active' : 'zero');
    out[spec.key] = {
      value_count: valueCount,
      enabled_field_count: enabledFieldCount,
      disabled_field_count: disabledFieldCount,
      status
    };
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

function toFieldTargetMap(rows = []) {
  const out = {};
  for (const row of rows) {
    for (const field of toArray(row.target_fields)) {
      if (!field) continue;
      out[field] = out[field] || [];
      if (out[field].length >= 3) continue;
      if (!out[field].includes(row.query)) {
        out[field].push(row.query);
      }
    }
  }
  return out;
}

function toDocHintRows(rows = []) {
  const byHint = new Map();
  for (const row of rows) {
    const docHint = clean(row.doc_hint || '');
    if (!docHint) continue;
    if (!byHint.has(docHint)) {
      byHint.set(docHint, []);
    }
    const list = byHint.get(docHint);
    if (list.length >= 3) continue;
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
  brandResolution = null
}) {
  const brand = clean(job?.identityLock?.brand || '');
  const model = clean(job?.identityLock?.model || '');
  const variant = clean(job?.identityLock?.variant || '');
  const category = clean(job?.category || categoryConfig?.category || 'mouse');
  const identity = { brand, model, variant, category };
  const aliasRejectLog = [];
  const queryRejectLog = [];
  const identityAliases = buildDeterministicAliases(identity, 12, aliasRejectLog);
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
    field_target_queries: toFieldTargetMap(boundedRows),
    doc_hint_queries: toDocHintRows(boundedRows),
    hint_source_counts: hintSourceCounts,
    field_rule_gate_counts: buildFieldRuleGateCounts(categoryConfig)
  };
}

export function buildTargetedQueries(options = {}) {
  const profile = buildSearchProfile(options);
  return toArray(profile?.queries).slice(0, Math.max(1, Number(options?.maxQueries || 24)));
}
