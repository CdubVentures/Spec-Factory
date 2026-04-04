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
  const baseModel = clean(identity.base_model || '');
  const model = clean(baseModel || identity.model || '');
  const variant = clean(identity.variant || '');
  const variantToken = baseModel ? variant : '';
  const cap = Math.max(1, Number(maxAliases) || 12);

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
  const productFull = clean([brand, model, variantToken].filter(Boolean).join(' '));
  if (productFull) {
    push(productFull, 'deterministic', 1);
  }
  const brandModel = clean([brand, model].filter(Boolean).join(' '));
  if (brandModel) {
    push(brandModel, 'deterministic', 0.95);
  }
  for (const modelAlias of buildModelAliasCandidates({ base_model: baseModel, model, variant: variantToken })) {
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
      .replaceAll('{product}', values.product || '')
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
  tierHierarchyOrder = '',
  keySearchEnrichmentOrder = '',
}) {
  const resolvedIdentity = resolveJobIdentity(job);
  const brand = resolvedIdentity.brand;
  const baseModel = resolvedIdentity.base_model;
  const model = resolvedIdentity.model;
  const variant = resolvedIdentity.variant;
  const queryModel = baseModel || model;
  const queryVariant = baseModel ? variant : '';
  const category = clean(job?.category || categoryConfig?.category || 'mouse');
  const identity = { brand, base_model: baseModel, model, variant, category };
  const aliasRejectLog = [];
  const queryRejectLog = [];
  const identityAliases = buildDeterministicAliases(identity, aliasValidationCap, aliasRejectLog);
  const variantGuardTerms = buildVariantGuardTerms(identity);

  const baseTemplates = toArray(categoryConfig?.searchTemplates)
    .map((template) => fillTemplate(template, {
      brand,
      model: queryModel,
      variant: queryVariant,
      category,
      product: clean([brand, queryModel, queryVariant].filter(Boolean).join(' '))
    }))
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

  // WHY: tierHierarchyOrder controls budget priority for ALL 5 query groups.
  // Each group fills remaining budget in hierarchy order. Omitting a group
  // from the order skips it entirely.
  const effectiveTierOrder = parseTierOrder(tierHierarchyOrder);
  const seedTierOrder = effectiveTierOrder.filter(
    (id) => id === 'brand_seeds' || id === 'spec_seeds' || id === 'source_seeds',
  );

  const tierRows = [];
  for (const tierId of effectiveTierOrder) {
    if (tierRows.length >= maxQueryCap) break;
    const remaining = maxQueryCap - tierRows.length;

    if (tierId === 'brand_seeds' || tierId === 'spec_seeds' || tierId === 'source_seeds') {
      // WHY: Seed tiers are emitted via buildTier1Queries only on first encounter.
      // All seed sub-groups share the emittedSources dedup set, so they must be
      // dispatched together. We trigger the full seed batch on the first seed tier
      // in the hierarchy, then skip subsequent seed tiers (already emitted).
      if (modes.runTier1Seeds && tierId === seedTierOrder[0]) {
        const seedRows = buildTier1Queries(job, effectiveSeedStatus, brandResolution, {
          tierOrder: seedTierOrder,
          specSeeds: categoryConfig?.specSeeds || null,
        });
        tierRows.push(...seedRows.slice(0, remaining));
      }
      // Subsequent seed tiers: already emitted in the batch above — skip.
    } else if (tierId === 'group_searches') {
      if (modes.runTier2Groups) {
        const groupRows = buildTier2Queries(job, focusGroups);
        tierRows.push(...groupRows.slice(0, remaining));
      }
    } else if (tierId === 'key_searches') {
      if (modes.runTier3Keys) {
        const keyRows = buildTier3Queries(job, focusGroups, categoryConfig, fieldYieldByDomain, {
          enrichmentOrder: parseEnrichmentOrder(keySearchEnrichmentOrder),
        });
        tierRows.push(...keyRows.slice(0, remaining));
      }
    }
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
  if (!selectedQueries.length && brand && queryModel) {
    addQuery(`${brand} ${queryModel} ${queryVariant} specifications`, 'fallback');
    addQuery(`${brand} ${queryModel} datasheet pdf`, 'fallback');
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
    alias_reject_log: aliasRejectLog,
    query_reject_log: queryRejectLog,
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

// WHY: All 5 query groups across Tier 1/2/3. tierHierarchyOrder controls their
// budget priority. Default: seeds first (brand → spec → source), then groups, then keys.
const KNOWN_TIER_IDS = ['brand_seeds', 'spec_seeds', 'source_seeds', 'group_searches', 'key_searches'];
const DEFAULT_TIER_ORDER = ['brand_seeds', 'spec_seeds', 'source_seeds', 'group_searches', 'key_searches'];

/**
 * Parse a CSV tier order string into a validated array of tier IDs.
 * Unknown IDs are dropped, duplicates removed. Falls back to default on empty input.
 */
export function parseTierOrder(csv) {
  const raw = String(csv ?? '').trim();
  if (!raw) return [...DEFAULT_TIER_ORDER];
  const seen = new Set();
  const result = [];
  for (const token of raw.split(',')) {
    const id = token.trim();
    if (KNOWN_TIER_IDS.includes(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result.length > 0 ? result : [...DEFAULT_TIER_ORDER];
}

// ── Tier 1 emit helpers ──

function emitBrandSeedQueries(rows, emittedSources, product, brandResolution) {
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
}

function emitSpecSeedQueries(rows, product, seedStatus, specSeeds, identity) {
  if (!seedStatus?.specs_seed?.is_needed) return;
  const templates = Array.isArray(specSeeds) && specSeeds.length > 0
    ? specSeeds
    : ['{product} specifications'];
  const queryModel = identity.base_model || identity.model;
  const queryVariant = identity.base_model ? identity.variant : '';
  const values = {
    product,
    brand: identity.brand,
    model: queryModel,
    variant: queryVariant,
    category: identity.category,
  };
  for (const template of templates) {
    const query = fillTemplate(template, values);
    if (!query) continue;
    rows.push({
      query,
      hint_source: 'tier1_seed',
      tier: 'seed',
      target_fields: [],
      doc_hint: 'spec',
      alias: '',
      domain_hint: '',
      source_host: '',
    });
  }
}

function emitSourceSeedQueries(rows, emittedSources, product, seedStatus) {
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
}

/**
 * WHY: Tier 1 — broad seed queries. Cast the wide net first.
 * Order controlled by options.tierOrder (from tierHierarchyOrder setting).
 * Default: brand_seeds → spec_seeds → source_seeds.
 * @param {object} job
 * @param {object} seedStatus
 * @param {object|null} brandResolution
 * @param {object} [options]
 * @param {string[]} [options.tierOrder] - ordered array of tier IDs
 * @param {string[]|null} [options.specSeeds] - per-category spec seed templates
 * @returns {Array<object>} queryRow[]
 */
export function buildTier1Queries(job, seedStatus, brandResolution, options = {}) {
  const { tierOrder = DEFAULT_TIER_ORDER, specSeeds = null } = options;
  const resolved = resolveJobIdentity(job);
  const identity = { ...resolved, category: clean(job?.category || '') };
  const queryModel = identity.base_model || identity.model;
  const queryVariant = identity.base_model ? identity.variant : '';
  const product = clean([identity.brand, queryModel, queryVariant].filter(Boolean).join(' '));
  const rows = [];
  const emittedSources = new Set();

  const emitters = {
    brand_seeds: () => emitBrandSeedQueries(rows, emittedSources, product, brandResolution),
    spec_seeds: () => emitSpecSeedQueries(rows, product, seedStatus, specSeeds, identity),
    source_seeds: () => emitSourceSeedQueries(rows, emittedSources, product, seedStatus),
  };

  for (const tierId of tierOrder) {
    emitters[tierId]?.();
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
  const model = identity.base_model || identity.model;
  const variant = identity.base_model ? identity.variant : '';
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

// ── Key Search Enrichment ──

const KNOWN_ENRICHMENTS = ['aliases', 'domain_hints', 'content_types'];
const DEFAULT_ENRICHMENT_ORDER = ['aliases', 'domain_hints', 'content_types'];

/**
 * Parse a CSV enrichment order string into a validated array of enrichment IDs.
 * Same pattern as parseTierOrder.
 */
export function parseEnrichmentOrder(csv) {
  const raw = String(csv ?? '').trim();
  if (!raw) return [...DEFAULT_ENRICHMENT_ORDER];
  const seen = new Set();
  const result = [];
  for (const token of raw.split(',')) {
    const id = token.trim();
    if (KNOWN_ENRICHMENTS.includes(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result.length > 0 ? result : [...DEFAULT_ENRICHMENT_ORDER];
}

function applyAliasEnrichment(parts, entry, readable) {
  const aliases = (entry.all_aliases || [])
    .filter((a) => clean(a) && clean(a).toLowerCase() !== readable.toLowerCase())
    .slice(0, 3);
  if (aliases.length > 0) parts.push(aliases.join(' '));
}

function applyDomainHintEnrichment(parts, entry) {
  const tried = new Set((entry.domains_tried_for_key || []).map((d) => d.toLowerCase()));
  const hints = (entry.domain_hints || []).filter((d) => !tried.has(d.toLowerCase()));
  const hint = hints[0] || (entry.domain_hints || [])[0] || '';
  if (hint) parts.push(hint);
}

function applyContentTypeEnrichment(parts, entry) {
  const triedTypes = new Set((entry.content_types_tried_for_key || []).map((t) => t.toLowerCase()));
  const availableTypes = (entry.preferred_content_types || []);
  const untriedType = availableTypes.find((t) => !triedTypes.has(t.toLowerCase()));
  const contentType = untriedType || availableTypes[0] || '';
  if (contentType) parts.push(contentType);
}

/**
 * WHY: Tier 3 — individual key queries with progressive enrichment.
 * Enrichment order controlled by options.enrichmentOrder (from keySearchEnrichmentOrder setting).
 * Default: aliases → domain_hints → content_types.
 * At repeat_count=N, the first N enrichments from the order are applied cumulatively.
 * @returns {Array<object>} queryRow[]
 */
export function buildTier3Queries(job, focusGroups, categoryConfig, fieldYieldByDomain, options = {}) {
  const { enrichmentOrder = DEFAULT_ENRICHMENT_ORDER } = options;
  const identity = resolveJobIdentity(job);
  const brand = identity.brand;
  const model = identity.base_model || identity.model;
  const variant = identity.base_model ? identity.variant : '';
  const product = clean([brand, model, variant].filter(Boolean).join(' '));
  const groups = Array.isArray(focusGroups) ? focusGroups : [];
  const rows = [];

  const enrichers = {
    aliases: (parts, entry, readable) => applyAliasEnrichment(parts, entry, readable),
    domain_hints: (parts, entry) => applyDomainHintEnrichment(parts, entry),
    content_types: (parts, entry) => applyContentTypeEnrichment(parts, entry),
  };

  for (const g of groups) {
    if (g.group_search_worthy !== false) continue;
    const keys = toArray(g.normalized_key_queue);
    if (keys.length === 0) continue;

    for (const entry of keys) {
      const isEnriched = entry && typeof entry === 'object';
      const keyName = isEnriched ? entry.normalized_key : String(entry || '');
      const readable = clean(String(keyName || '').replace(/_/g, ' '));
      if (!readable) continue;

      const repeatCount = isEnriched ? (entry.repeat_count || 0) : 0;
      const parts = [product, readable];

      // WHY: Progressive enrichment — apply enrichments in configured order,
      // one per repeat level. repeat=1 applies enrichment[0], repeat=2 applies [0]+[1], etc.
      for (let i = 0; i < enrichmentOrder.length; i++) {
        if (!isEnriched || repeatCount < (i + 1)) break;
        enrichers[enrichmentOrder[i]]?.(parts, entry, readable);
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

