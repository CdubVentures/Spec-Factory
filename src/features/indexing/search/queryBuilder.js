import { normalizeFieldList } from '../../../utils/fieldKeys.js';
import { resolveConsumerGate } from '../../../field-rules/consumerGate.js';
import {
  buildLogicalPlansFromHostPlan,
  compileLogicalPlans,
  buildScoredQueryRowsFromHostPlan
} from './queryHostPlanScorer.js';
import { selectManufacturerHosts } from './queryBrandHostResolver.js';
import {
  fieldSynonyms,
  lookupFieldRule,
  contentTypeSuffixes,
  domainHintsForField,
  hostPlanIntentTokensForField,
  buildFieldRuleGateCounts,
  buildFieldRuleHintCountsByField,
  collectHostPlanHintTokens
} from './queryFieldRuleGates.js';
import {
  classifySourceArchetypes,
  computeArchetypeCoverage,
  allocateArchetypeBudget,
  emitArchetypeQueries,
  identifyUncoveredFields,
  emitHardFieldQueries,
  intentFingerprint,
  buildArchetypeSummary,
  buildCoverageAnalysis
} from './archetypeQueryPlanner.js';
import {
  clean,
  toArray,
  resolveJobIdentity,
  normalizeSearchTerm,
  sanitizeAlias,
  buildVariantGuardTerms,
  buildModelAliasCandidates
} from './queryIdentityNormalizer.js';

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
  brandResolutionHints = [],
  fieldYieldByDomain = null
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
      if (!existing.domain_hint && domainHint) {
        existing.domain_hint = clean(domainHint);
        existing.source_host = clean(domainHint);
      }
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

  // ── Archetype pipeline: source-first query generation ──
  const sourceRegistry = categoryConfig?.sourceRegistry || {};
  const sourceHosts = toArray(categoryConfig?.sourceHosts);
  let mfrHosts = selectManufacturerHosts(categoryConfig, brand, brandResolutionHints);
  if (mfrHosts.length === 0) {
    const officialHost = brandResolutionHints.find((h) => h.includes('.'));
    if (officialHost) mfrHosts = [officialHost];
  }

  const archetypes = classifySourceArchetypes(sourceRegistry, sourceHosts, mfrHosts);
  const archetypeCoverage = computeArchetypeCoverage(archetypes, focusFields);
  const archetypeBudget = Math.max(4, Math.floor(rowCap * 0.6));
  const allocatedSlots = allocateArchetypeBudget(archetypes, archetypeBudget, {});

  // Collect all fields covered by archetypes (advisory)
  const coveredFieldSet = new Set();
  for (const a of archetypes) {
    for (const f of (a.coveredFields || [])) {
      coveredFieldSet.add(f);
    }
  }

  // Emit archetype queries
  for (const slot of allocatedSlots) {
    if (slot.slots <= 0) continue;
    const archetypeRows = emitArchetypeQueries(slot, { brand, model, variant }, product, focusFields, { fieldYieldByDomain });
    for (const row of archetypeRows) {
      addRow({
        query: row.query,
        hintSource: row.hint_source || 'archetype_planner',
        targetFields: row.target_fields,
        docHint: row.doc_hint,
        domainHint: row.domain_hint
      });
      // Propagate _meta to the stored row (if addRow accepted it)
      const stored = rows[rows.length - 1];
      if (stored && stored.query === clean(row.query) && row._meta) {
        stored._meta = row._meta;
      }
    }
  }

  // Hard-field queries for uncovered search-worthy fields
  const uncovered = identifyUncoveredFields(focusFields, coveredFieldSet, categoryConfig);
  const hardFieldRows = emitHardFieldQueries(
    uncovered.searchWorthy, { brand, model, variant }, product, categoryConfig
  );
  for (const row of hardFieldRows) {
    addRow({
      query: row.query,
      hintSource: row.hint_source || 'archetype_planner',
      targetFields: row.target_fields,
      docHint: row.doc_hint,
      domainHint: row.domain_hint
    });
    const stored = rows[rows.length - 1];
    if (stored && stored.query === clean(row.query) && row._meta) {
      stored._meta = row._meta;
    }
  }

  // Field-rules search hints + synonym fallback: per-field targeted queries
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
    ])].slice(0, 8);
    const preferredContent = contentTypesGateEnabled ? contentTypeSuffixes(fieldRule) : [];
    const ruleDomainHints = domainHintsGateEnabled ? domainHintsForField(fieldRule) : [];

    for (const term of terms) {
      const hintSource = searchHintTerms.includes(term)
        ? 'field_rules.search_hints'
        : 'deterministic';
      addRow({
        query: `${product} ${term} specification`,
        hintSource,
        targetFields: [field],
        docHint: 'spec',
        alias: product
      });
      addRow({
        query: `${product} ${term} manual pdf`,
        hintSource,
        targetFields: [field],
        docHint: 'manual_pdf',
        alias: product
      });
      for (const suffix of preferredContent.slice(0, 2)) {
        addRow({
          query: `${product} ${term} ${suffix}`,
          hintSource: 'field_rules.search_hints',
          targetFields: [field],
          docHint: suffix,
          alias: product
        });
      }
    }

    // Emit domain_hint soft-bias queries
    for (const host of ruleDomainHints.slice(0, 4)) {
      const primaryTerm = searchHintTerms[0] || field.replace(/_/g, ' ');
      addRow({
        query: `${brand} ${model} ${primaryTerm} ${host}`,
        hintSource: 'field_rules.search_hints',
        targetFields: [field],
        domainHint: host
      });
    }

    // Alias-driven queries
    for (const alias of queryAliasRows.slice(0, 4)) {
      const primaryTerm = terms[0] || field.replace(/_/g, ' ');
      addRow({
        query: `${brand} ${alias} ${primaryTerm} specification`,
        hintSource: 'deterministic',
        targetFields: [field],
        alias
      });
    }

    // Learned queries by field
    for (const row of toArray(learnedQueries?.templates_by_field?.[field]).slice(0, 4)) {
      addRow({
        query: clean(row?.query || ''),
        hintSource: 'learned',
        targetFields: [field]
      });
    }
  }

  // Learned queries by brand
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

  // Stash archetype metadata on the result for buildSearchProfile
  rows._archetypeSlots = allocatedSlots;
  rows._coveredFieldSet = coveredFieldSet;
  rows._hardFieldRows = hardFieldRows;

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
  fieldYieldByDomain = null,
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
    brandResolutionHints,
    fieldYieldByDomain
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

  // Base templates fallback guarantee: never empty
  const effectiveBaseTemplates = baseTemplates.length > 0
    ? baseTemplates
    : (brand && model)
      ? [clean(`${brand} ${model} ${variant} specifications`), clean(`${brand} ${model} ${variant} review`)]
      : [];

  // Archetype summary + coverage analysis from stashed metadata
  const archetypeSlots = queryRows._archetypeSlots || [];
  const coveredFieldSet = queryRows._coveredFieldSet || new Set();
  const hardFieldRowsMeta = queryRows._hardFieldRows || [];
  const archetypeSummary = buildArchetypeSummary(archetypeSlots);
  const coverageAnalysis = buildCoverageAnalysis(focusFields, coveredFieldSet, hardFieldRowsMeta);

  return {
    category,
    identity,
    variant_guard_terms: variantGuardTerms,
    identity_aliases: identityAliases,
    alias_reject_log: aliasRejectLog.slice(0, 120),
    query_reject_log: queryRejectLog.slice(0, 240),
    negative_terms: [],
    focus_fields: focusFields,
    base_templates: effectiveBaseTemplates,
    query_rows: boundedRows,
    queries: boundedQueries,
    targeted_queries: boundedRows.map((row) => row.query),
    field_target_queries: toFieldTargetMap(boundedRows, fieldTargetQueriesCap),
    doc_hint_queries: toDocHintRows(boundedRows, docHintQueriesCap),
    archetype_summary: archetypeSummary,
    coverage_analysis: coverageAnalysis,
    hint_source_counts: hintSourceCounts,
    field_rule_gate_counts: buildFieldRuleGateCounts(categoryConfig),
    field_rule_hint_counts_by_field: buildFieldRuleHintCountsByField(categoryConfig)
  };
}

export function buildTargetedQueries(options = {}) {
  const profile = buildSearchProfile(options);
  return toArray(profile?.queries).slice(0, Math.max(1, Number(options?.maxQueries || 24)));
}

export { collectHostPlanHintTokens } from './queryFieldRuleGates.js';

export {
  buildLogicalPlansFromHostPlan,
  compileLogicalPlans,
  buildScoredQueryRowsFromHostPlan
} from './queryHostPlanScorer.js';
