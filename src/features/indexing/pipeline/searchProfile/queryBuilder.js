import { normalizeFieldList } from '../../../../utils/fieldKeys.js';
import { resolveConsumerGate } from '../../../../field-rules/consumerGate.js';
import {
  fieldSynonyms,
  lookupFieldRule,
  contentTypeSuffixes,
  domainHintsForField,
  buildFieldRuleGateCounts,
  buildFieldRuleHintCountsByField,
} from './queryFieldRuleGates.js';
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


function fillTemplate(template, values) {
  return clean(
    String(template || '')
      .replaceAll('{brand}', values.brand || '')
      .replaceAll('{model}', values.model || '')
      .replaceAll('{variant}', values.variant || '')
      .replaceAll('{category}', values.category || '')
  );
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
  seedStatus = null,
  focusGroups = null,
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

  // WHY: Tier dispatch is the ONLY query generation path.
  // When seedStatus is absent, synthesize a round-0 default so Tier 1 always fires.
  // Budget: seeds get first dibs, then groups fill remaining, then keys fill rest.
  const effectiveSeedStatus = seedStatus || { specs_seed: { is_needed: true }, source_seeds: {} };
  const modes = determineQueryModes(effectiveSeedStatus, focusGroups || []);
  const maxQueryCap = Math.max(1, Number(maxQueries || 24));

  const tierRows = [];
  if (modes.runTier1Seeds) {
    tierRows.push(...buildTier1Queries(job, effectiveSeedStatus, brandResolution));
  }
  if (modes.runTier2Groups && tierRows.length < maxQueryCap) {
    const groupRows = buildTier2Queries(job, focusGroups);
    tierRows.push(...groupRows.slice(0, maxQueryCap - tierRows.length));
  }
  if (modes.runTier3Keys && tierRows.length < maxQueryCap) {
    const keyRows = buildTier3Queries(job, focusGroups, categoryConfig, fieldYieldByDomain);
    tierRows.push(...keyRows.slice(0, maxQueryCap - tierRows.length));
  }
  const queryRows = tierRows;

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
  for (const row of queryRows) {
    addQuery(row.query, row.hint_source || 'query_row');
  }
  if (!selectedQueries.length && brand && model) {
    addQuery(`${brand} ${model} ${variant} specifications`, 'fallback');
    addQuery(`${brand} ${model} datasheet pdf`, 'fallback');
  }

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

  // WHY: Base templates are tier1 seed queries — used by Search Planner as query history.
  const effectiveBaseTemplates = boundedRows.filter((r) => r.tier === 'seed').map((r) => r.query);

  return {
    category,
    identity,
    variant_guard_terms: variantGuardTerms,
    identity_aliases: identityAliases,
    alias_reject_log: aliasRejectLog.slice(0, 120),
    query_reject_log: queryRejectLog.slice(0, 240),
    focus_fields: focusFields,
    base_templates: effectiveBaseTemplates,
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

// ── Tier-Aware Query Generation ──

/**
 * WHY: Reports which tiers have available work. All three can be true.
 * Budget allocation (priority ordering) happens in buildSearchProfile —
 * seeds get first dibs, then groups, then keys fill remaining budget.
 * @param {object|null} seedStatus - from needset.seedStatus
 * @param {Array} focusGroups - from needset.focusGroups
 * @returns {{ runTier1Seeds: boolean, runTier2Groups: boolean, runTier3Keys: boolean }}
 */
export function determineQueryModes(seedStatus, focusGroups) {
  const groups = Array.isArray(focusGroups) ? focusGroups : [];
  const specsSeedNeeded = Boolean(seedStatus?.specs_seed?.is_needed);
  const anySourceNeeded = Object.values(seedStatus?.source_seeds || {})
    .some((s) => Boolean(s?.is_needed));

  return {
    runTier1Seeds: specsSeedNeeded || anySourceNeeded,
    runTier2Groups: groups.some((g) => g.group_search_worthy === true),
    runTier3Keys: groups.some((g) =>
      g.group_search_worthy === false &&
      Array.isArray(g.normalized_key_queue) &&
      g.normalized_key_queue.length > 0,
    ),
  };
}

/**
 * WHY: Tier 1 — broad seed queries. Cast the wide net first.
 * Uses both seed_status.source_seeds (from NeedSet history) and
 * brandResolution (from Brand Resolver phase) for source domains.
 * @returns {Array<object>} queryRow[]
 */
export function buildTier1Queries(job, seedStatus, brandResolution) {
  const identity = resolveJobIdentity(job);
  const brand = identity.brand;
  const model = identity.model;
  const variant = identity.variant;
  const product = clean([brand, model, variant].filter(Boolean).join(' '));
  const rows = [];
  const emittedSources = new Set();

  if (seedStatus?.specs_seed?.is_needed) {
    rows.push({
      query: clean(`${product} specifications`),
      hint_source: 'tier1_seed',
      tier: 'seed',
      target_fields: [],
      doc_hint: 'spec',
      alias: '',
      domain_hint: '',
      source_host: '',
    });
  }

  // Source seeds from NeedSet history
  for (const [source, info] of Object.entries(seedStatus?.source_seeds || {})) {
    if (!info?.is_needed) continue;
    const s = clean(source);
    if (!s || emittedSources.has(s.toLowerCase())) continue;
    emittedSources.add(s.toLowerCase());
    rows.push({
      query: clean(`${product} ${s}`),
      hint_source: 'tier1_seed',
      tier: 'seed',
      target_fields: [],
      doc_hint: '',
      alias: '',
      domain_hint: s,
      source_host: s,
    });
  }

  // WHY: Brand Resolver phase runs before Search Profile phase.
  // Add official/support domains as source seeds if not already covered
  // by seed_status.source_seeds.
  const brandDomains = [
    brandResolution?.officialDomain,
    brandResolution?.supportDomain,
  ].map((d) => clean(String(d || ''))).filter(Boolean);
  for (const domain of brandDomains) {
    if (emittedSources.has(domain.toLowerCase())) continue;
    emittedSources.add(domain.toLowerCase());
    rows.push({
      query: clean(`${product} ${domain}`),
      hint_source: 'tier1_seed',
      tier: 'seed',
      target_fields: [],
      doc_hint: '',
      alias: '',
      domain_hint: domain,
      source_host: domain,
    });
  }

  return rows;
}

/**
 * WHY: Tier 2 — one broad query per search-worthy group, ordered by productivity.
 * @returns {Array<object>} queryRow[]
 */
export function buildTier2Queries(job, focusGroups) {
  const identity = resolveJobIdentity(job);
  const brand = identity.brand;
  const model = identity.model;
  const variant = identity.variant;
  const product = clean([brand, model, variant].filter(Boolean).join(' '));
  const groups = Array.isArray(focusGroups) ? focusGroups : [];

  return groups
    .filter((g) => g.group_search_worthy === true)
    .sort((a, b) => (b.productivity_score || 0) - (a.productivity_score || 0))
    .map((g) => ({
      query: clean(`${product} ${g.label || ''} ${g.group_description_long || ''}`),
      hint_source: 'tier2_group',
      tier: 'group_search',
      target_fields: toArray(g.unresolved_field_keys),
      doc_hint: '',
      alias: '',
      domain_hint: '',
      source_host: '',
      group_key: g.key || '',
    }));
}

/**
 * WHY: Tier 3 — individual key queries with progressive enrichment.
 * Each round adds more context to the query based on repeat_count:
 *   0: bare {product} {key}
 *   1: + aliases
 *   2: + domain hints (prefer untried)
 *   3+: + content type hints
 * @returns {Array<object>} queryRow[]
 */
export function buildTier3Queries(job, focusGroups, categoryConfig, fieldYieldByDomain) {
  const identity = resolveJobIdentity(job);
  const brand = identity.brand;
  const model = identity.model;
  const variant = identity.variant;
  const product = clean([brand, model, variant].filter(Boolean).join(' '));
  const groups = Array.isArray(focusGroups) ? focusGroups : [];
  const rows = [];

  for (const g of groups) {
    if (g.group_search_worthy !== false) continue;
    const keys = toArray(g.normalized_key_queue);
    if (keys.length === 0) continue;

    for (const entry of keys) {
      // Backward compat: plain string keys still work
      const isEnriched = entry && typeof entry === 'object';
      const keyName = isEnriched ? entry.normalized_key : String(entry || '');
      const readable = clean(String(keyName || '').replace(/_/g, ' '));
      if (!readable) continue;

      const repeatCount = isEnriched ? (entry.repeat_count || 0) : 0;
      const parts = [product, readable];

      // Progressive enrichment based on how many times this key has been searched
      if (isEnriched && repeatCount >= 1) {
        // Round 1+: add aliases to differentiate the query
        const aliases = (entry.all_aliases || [])
          .filter((a) => clean(a) && clean(a).toLowerCase() !== readable.toLowerCase())
          .slice(0, 3);
        if (aliases.length > 0) parts.push(aliases.join(' '));
      }

      if (isEnriched && repeatCount >= 2) {
        // Round 2+: add domain hints — prefer untried domains
        const tried = new Set((entry.domains_tried_for_key || []).map((d) => d.toLowerCase()));
        const hints = (entry.domain_hints || []).filter((d) => !tried.has(d.toLowerCase()));
        const hint = hints[0] || (entry.domain_hints || [])[0] || '';
        if (hint) parts.push(hint);
      }

      if (isEnriched && repeatCount >= 3) {
        // Round 3+: add content type hints — prefer untried content types
        const triedTypes = new Set((entry.content_types_tried_for_key || []).map((t) => t.toLowerCase()));
        const availableTypes = (entry.preferred_content_types || []);
        const untriedType = availableTypes.find((t) => !triedTypes.has(t.toLowerCase()));
        const contentType = untriedType || availableTypes[0] || '';
        if (contentType) parts.push(contentType);
      }

      rows.push({
        query: clean(parts.join(' ')),
        hint_source: 'tier3_key',
        tier: 'key_search',
        target_fields: [keyName],
        doc_hint: '',
        alias: isEnriched ? (entry.all_aliases || []).join(', ') : '',
        domain_hint: isEnriched ? (entry.domain_hints || [])[0] || '' : '',
        source_host: '',
        group_key: g.key || '',
        normalized_key: keyName,
        // WHY: LLM enhancement context — Search Planner uses these to craft tier-aware prompts.
        repeat_count: repeatCount,
        all_aliases: isEnriched ? (entry.all_aliases || []) : [],
        domain_hints: isEnriched ? (entry.domain_hints || []) : [],
        preferred_content_types: isEnriched ? (entry.preferred_content_types || []) : [],
        domains_tried_for_key: isEnriched ? (entry.domains_tried_for_key || []) : [],
        content_types_tried_for_key: isEnriched ? (entry.content_types_tried_for_key || []) : [],
      });
    }
  }

  return rows;
}

