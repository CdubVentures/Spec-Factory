// Logic Box 2: NeedSet assessment (NeedSetOutput) → Search planning context (SearchPlanningContext)
// Groups per-field data into per-group focus_groups[], attaches group_catalog metadata,
// aggregates hints/history with SET semantics (unresolved fields only).

import { resolvePhaseModel, roleTokenCap } from '../../../../core/llm/client/routing.js';
import { configInt, configFloat, configValue } from '../../../../shared/settingsAccessor.js';
import { toInt } from '../../../../shared/valueNormalizers.js';
import {
  AVAILABILITY_RANKS,
  DIFFICULTY_RANKS,
  REQUIRED_LEVEL_RANKS,
  PRIORITY_BUCKET_ORDER,
  EXHAUSTION_MIN_ATTEMPTS,
  EXHAUSTION_MIN_EVIDENCE_CLASSES,
} from '../../../../shared/discoveryRankConstants.js';

// WHY: Fallback group metadata for the mouse category. These are used when
// fieldGroupsData does not provide metadata for a group key. Once all category
// contracts fully populate fieldGroupsData.groups with desc/source_target/content_target,
// these defaults can be retired. Until then, they prevent broken bundle formation.
const GROUP_DEFAULTS = {
  sensor_performance: { desc: 'Sensor and performance metrics', source_target: 'spec_sheet', content_target: 'technical_specs' },
  connectivity:       { desc: 'Connection and wireless specs',  source_target: 'product_page', content_target: 'technical_specs' },
  construction:       { desc: 'Build quality and materials',    source_target: 'product_page', content_target: 'technical_specs' },
  dimensions:         { desc: 'Physical dimensions',            source_target: 'spec_sheet',   content_target: 'technical_specs' },
  ergonomics:         { desc: 'Shape and ergonomic features',   source_target: 'product_page', content_target: 'general' },
  switches:           { desc: 'Switch specifications',          source_target: 'spec_sheet',   content_target: 'technical_specs' },
  encoder:            { desc: 'Encoder specifications',         source_target: 'spec_sheet',   content_target: 'technical_specs' },
  electronics:        { desc: 'MCU and electronics',            source_target: 'spec_sheet',   content_target: 'technical_specs' },
  buttons_features:   { desc: 'Buttons and feature set',        source_target: 'product_page', content_target: 'general' },
  controls:           { desc: 'Control mechanisms',             source_target: 'product_page', content_target: 'technical_specs' },
  general:            { desc: 'General product information',    source_target: 'product_page', content_target: 'general' },
};

const GENERIC_FALLBACK = { desc: '', source_target: 'product_page', content_target: 'general' };

const PHASE_ORDER = { now: 0, next: 1, hold: 2 };

function isCoreBucket(requiredLevel) {
  return requiredLevel === 'identity' || requiredLevel === 'critical' || requiredLevel === 'required';
}

function unionSorted(arrays) {
  const set = new Set();
  for (const arr of arrays) {
    if (Array.isArray(arr)) {
      for (const item of arr) set.add(item);
    }
  }
  return [...set].sort();
}

function parseCapMap(json) {
  if (!json || typeof json !== 'string') return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function derivePlannerLimits(config) {
  return {
    discoveryEnabled: true,
    searchProfileQueryCap: configInt(config, 'searchProfileQueryCap'),
    domainClassifierUrlCap: configInt(config, 'domainClassifierUrlCap'),
    serpSelectorMaxKeep: configInt(config, 'serpSelectorMaxKeep'),
    maxPagesPerDomain: configInt(config, 'maxPagesPerDomain'),
    llmModelPlan: resolvePhaseModel(config, 'needset') || String(configValue(config, 'llmModelPlan')),
    llmProvider: String(configValue(config, 'llmProvider')),
    llmMaxOutputTokensPlan: toInt(config._resolvedNeedsetMaxOutputTokens ?? config.llmMaxOutputTokensPlan, 2048),
    searchProfileCapMap: parseCapMap(config.searchProfileCapMapJson),
    searchEngines: String(config.searchEngines || 'bing,google'),
  };
}

// WHY: Resolve group metadata from the category contract's fieldGroupsData only.
// No hardcoded fallbacks — if the category doesn't define a group, use GENERIC_FALLBACK.
function resolveGroupMeta(groupKey, fieldGroupsData) {
  if (fieldGroupsData && Array.isArray(fieldGroupsData.groups)) {
    const fgdGroup = fieldGroupsData.groups.find(g => g.group_key === groupKey);
    if (fgdGroup) {
      const hasMeta = fgdGroup.desc || fgdGroup.source_target;
      if (hasMeta) {
        return {
          label: fgdGroup.display_name || groupKey,
          desc: fgdGroup.desc || '',
          source_target: fgdGroup.source_target || 'product_page',
          content_target: fgdGroup.content_target || 'general',
        };
      }
    }
  }

  // Fall back to GROUP_DEFAULTS for known categories
  const defaults = GROUP_DEFAULTS[groupKey];
  if (defaults) {
    return { ...defaults };
  }

  return { ...GENERIC_FALLBACK };
}

function buildGroupCatalog(groupKeys, fieldGroupsData) {
  const catalog = {};
  const displayNameMap = new Map();

  if (fieldGroupsData && Array.isArray(fieldGroupsData.groups)) {
    for (const g of fieldGroupsData.groups) {
      if (g.group_key && g.display_name) {
        displayNameMap.set(g.group_key, g.display_name);
      }
    }
  }

  for (const key of groupKeys) {
    const meta = resolveGroupMeta(key, fieldGroupsData);
    const label = displayNameMap.get(key) || meta.label || key;
    catalog[key] = {
      label,
      desc: meta.desc,
      source_target: meta.source_target,
      content_target: meta.content_target,
    };
  }

  return catalog;
}

// ── V4 helpers ──

const STOP_WORDS = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'for', 'in', 'to', 'with']);

export function buildGroupDescriptionShort(catalogDesc) {
  if (!catalogDesc) return '';
  const tokens = String(catalogDesc).toLowerCase().split(/\s+/).filter((t) => t && !STOP_WORDS.has(t));
  return tokens.slice(0, 10).join(' ');
}

export function buildGroupDescriptionLong(catalogDesc, unresolvedNormalizedKeys = []) {
  const base = buildGroupDescriptionShort(catalogDesc);
  const keys = (unresolvedNormalizedKeys || []).slice(0, 6);
  const combined = [base, ...keys].filter(Boolean).join(' ');
  return combined.split(/\s+/).slice(0, 20).join(' ');
}

export function buildGroupFingerprintFine(groupKey, unresolvedNormalizedKeys = []) {
  const sorted = [...(unresolvedNormalizedKeys || [])].sort();
  return `${groupKey}::${sorted.join(',')}`;
}

export function computeGroupQueryCount(groupKey, queryExecutionHistory) {
  if (!queryExecutionHistory || !Array.isArray(queryExecutionHistory.queries)) return 0;
  return queryExecutionHistory.queries.filter(
    (q) => q.tier === 'group_search' && q.group_key === groupKey
  ).length;
}

export function isGroupSearchWorthy({ coverageRatio, unresolvedCount, groupQueryCount, phase }, thresholds = {}, config = null) {
  const coverageThreshold = thresholds.groupSearchCoverageThreshold ?? configFloat(config, 'needsetGroupSearchCoverageThreshold') ?? 0.80;
  const minUnresolved = thresholds.groupSearchMinUnresolved ?? configInt(config, 'needsetGroupSearchMinUnresolved') ?? 3;
  const maxRepeats = thresholds.groupSearchMaxRepeats ?? configInt(config, 'needsetGroupSearchMaxRepeats') ?? 3;

  if (phase === 'hold') return { worthy: false, skipReason: 'group_on_hold' };
  if (coverageRatio >= coverageThreshold) return { worthy: false, skipReason: 'group_mostly_resolved' };
  if (unresolvedCount < minUnresolved) return { worthy: false, skipReason: 'too_few_missing_keys' };
  if (groupQueryCount >= maxRepeats) return { worthy: false, skipReason: 'group_search_exhausted' };
  return { worthy: true, skipReason: null };
}


// WHY: Groups with easy-to-find, easy-to-extract, un-tried fields score highest.
// Higher score = more productive to search now.
export function computeGroupProductivityScore(unresolvedFields, groupQueryCount) {
  if (!unresolvedFields || unresolvedFields.length === 0) return 0;
  let totalAvail = 0;
  let totalDiff = 0;
  let totalNeed = 0;
  for (const f of unresolvedFields) {
    // Invert ranks: available/easy fields contribute MORE to score
    totalAvail += 4 - (AVAILABILITY_RANKS[f.availability] ?? 4);
    totalDiff += 2 - (DIFFICULTY_RANKS[f.difficulty] ?? 2);
    totalNeed += f.need_score || 0;
  }
  const fieldCount = unresolvedFields.length;
  const avgAvail = totalAvail / fieldCount;
  const avgDiff = totalDiff / fieldCount;
  const avgNeed = totalNeed / fieldCount;
  const repeatPenalty = Math.min(groupQueryCount || 0, 5) * 10;
  // More unresolved fields = more productive per broad search (capped at 10)
  const volumeBonus = Math.min(fieldCount, 10) * 2;
  return (avgAvail * 30) + (avgDiff * 20) + (avgNeed * 0.5) + volumeBonus - repeatPenalty;
}

// WHY: Returns enriched objects so Tier 3 can progressively enrich queries
// based on repeat_count, aliases, domain hints, and content types.
export function buildNormalizedKeyQueue(unresolvedFields) {
  const entries = (unresolvedFields || []).map((f) => {
    const idx = f.idx || {};
    return {
      normalized_key: f.normalized_key || f.field_key,
      repeat_count: f.repeat_count || 0,
      all_aliases: Array.isArray(f.all_aliases) ? f.all_aliases : [],
      alias_shards: Array.isArray(f.alias_shards) ? f.alias_shards : [],
      domain_hints: Array.isArray(idx.domain_hints) ? idx.domain_hints : [],
      preferred_content_types: Array.isArray(idx.preferred_content_types) ? idx.preferred_content_types : [],
      domains_tried_for_key: Array.isArray(f.domains_tried_for_key) ? f.domains_tried_for_key : [],
      content_types_tried_for_key: Array.isArray(f.content_types_tried_for_key) ? f.content_types_tried_for_key : [],
      // Sort keys for ranking
      _avail: AVAILABILITY_RANKS[f.availability] ?? 4,
      _diff: DIFFICULTY_RANKS[f.difficulty] ?? 2,
      _need: f.need_score || 0,
      _req: REQUIRED_LEVEL_RANKS[f.required_level] ?? 4,
    };
  });
  entries.sort((a, b) =>
    (a._avail - b._avail) || (a._diff - b._diff) || (a.repeat_count - b.repeat_count) || (b._need - a._need) || (a._req - b._req)
  );
  return entries;
}

export function deriveSeedStatus(queryExecutionHistory, identity, config = {}, categorySourceHosts = []) {
  const queries = queryExecutionHistory?.queries || [];
  const cooldownMs = config.seedCooldownMs ?? (configInt(config, 'needsetSeedCooldownDays') ?? 30) * 86400000;
  const now = Date.now();

  function seedStatusFor(matchFn) {
    const matches = queries.filter(matchFn);
    if (matches.length === 0) {
      return { is_needed: true, last_status: 'never_run', last_completed_at_ms: null, cooldown_until_ms: null, new_fields_closed_last_run: 0 };
    }
    const latest = matches.reduce((a, b) => ((b.completed_at_ms || 0) > (a.completed_at_ms || 0) ? b : a), matches[0]);
    const isDone = latest.status === 'scrape_complete' || latest.status === 'exhausted';
    const fieldsOk = (latest.new_fields_closed || 0) >= 1;
    const completedAt = latest.completed_at_ms || null;
    const cooldownUntil = (isDone && fieldsOk && completedAt) ? completedAt + cooldownMs : null;
    const onCooldown = cooldownUntil !== null && now < cooldownUntil;
    return {
      is_needed: !(isDone && fieldsOk && onCooldown),
      last_status: latest.status || 'never_run',
      last_completed_at_ms: completedAt,
      cooldown_until_ms: cooldownUntil,
      new_fields_closed_last_run: latest.new_fields_closed || 0,
    };
  }

  const specsSeed = seedStatusFor((q) => q.tier === 'seed' && !q.source_name);

  // WHY: brand_seed tracks the product's manufacturer as its own tier,
  // prioritized above specification. NeedSet knows the brand NAME only —
  // the .com comes from brand resolver (runs in parallel).
  const brandName = String(identity?.manufacturer || identity?.brand || '').trim();
  const brandSeed = brandName
    ? { is_needed: true, brand_name: brandName }
    : { is_needed: false, brand_name: '' };

  // WHY: Source seeds come from two places:
  // 1. Category source hosts (e.g. rtings.com, techpowerup.com) — known before any run
  // 2. Previously executed seed queries — from queryExecutionHistory
  // Identity domains (official_domain, support_domain) are NOT included here —
  // they belong to brand_seed, not source_seeds.
  const sourceSeeds = {};
  const sourceNames = new Set();
  for (const q of queries) {
    if (q.tier === 'seed' && q.source_name) sourceNames.add(q.source_name);
  }
  for (const entry of (categorySourceHosts || [])) {
    const host = String(entry?.host || '').trim();
    if (host) sourceNames.add(host);
  }
  for (const name of sourceNames) {
    sourceSeeds[name] = seedStatusFor((q) => q.tier === 'seed' && q.source_name === name);
  }

  const complete = queries.filter((q) => q.status === 'scrape_complete' || q.status === 'exhausted').length;
  return {
    specs_seed: specsSeed,
    brand_seed: brandSeed,
    source_seeds: sourceSeeds,
    query_completion_summary: {
      total_queries: queries.length,
      complete,
      incomplete: queries.length - complete,
      pending_scrapes: queries.reduce((sum, q) => sum + (q.pending_count || 0), 0),
    },
  };
}

// WHY: Budget-aware tier allocation — mirrors queryBuilder's priority order
// (seeds first, groups second, keys third) so NeedSet can report accurate
// dashboard numbers and phase assignments before Search Profile runs.
export function computeTierAllocation(seedStatus, focusGroups, queryBudget) {
  const budget = Math.max(0, Number(queryBudget) || 0);
  const groups = Array.isArray(focusGroups) ? focusGroups : [];
  let remaining = budget;

  // Tier 1: seeds — brand first (highest priority), then specs, then sources
  const tier1Seeds = [];
  if (seedStatus?.brand_seed?.is_needed) {
    tier1Seeds.push({ type: 'brand', source_name: null, is_needed: true });
  }
  if (seedStatus?.specs_seed?.is_needed) {
    tier1Seeds.push({ type: 'specs', source_name: null, is_needed: true });
  }
  for (const [source, info] of Object.entries(seedStatus?.source_seeds || {})) {
    if (info?.is_needed) {
      tier1Seeds.push({ type: 'source', source_name: source, is_needed: true });
    }
  }
  const tier1SeedCount = Math.min(tier1Seeds.length, remaining);
  remaining -= tier1SeedCount;

  // Tier 2: search-worthy groups sorted by productivity
  const worthyGroups = groups
    .filter((g) => g.group_search_worthy === true)
    .sort((a, b) => (b.productivity_score || 0) - (a.productivity_score || 0));
  const tier2GroupCount = Math.min(worthyGroups.length, remaining);
  remaining -= tier2GroupCount;
  const overflowGroupCount = Math.max(0, worthyGroups.length - tier2GroupCount);

  const tier2Groups = worthyGroups.map((g, i) => ({
    group_key: g.key,
    productivity_score: g.productivity_score || 0,
    allocated: i < tier2GroupCount,
  }));

  // Tier 3: individual keys from non-worthy groups
  const nonWorthyWithKeys = groups.filter(
    (g) => g.group_search_worthy === false &&
      Array.isArray(g.normalized_key_queue) &&
      g.normalized_key_queue.length > 0,
  );
  let tier3KeyCount = 0;
  let overflowKeyCount = 0;
  const tier3Keys = [];
  for (const g of nonWorthyWithKeys) {
    const keyCount = g.normalized_key_queue.length;
    const allocatable = Math.min(keyCount, remaining);
    tier3Keys.push({
      group_key: g.key,
      key_count: keyCount,
      allocated_count: allocatable,
    });
    tier3KeyCount += allocatable;
    overflowKeyCount += keyCount - allocatable;
    remaining -= allocatable;
  }

  return {
    budget,
    tier1_seed_count: tier1SeedCount,
    tier2_group_count: tier2GroupCount,
    tier3_key_count: tier3KeyCount,
    tier1_seeds: tier1Seeds.slice(0, tier1SeedCount),
    tier2_groups: tier2Groups,
    tier3_keys: tier3Keys,
    overflow_group_count: overflowGroupCount,
    overflow_key_count: overflowKeyCount,
  };
}

function classifyField(field) {
  if (field.state === 'accepted') return 'satisfied';
  if (field.state === 'weak') return 'weak';
  if (field.state === 'conflict') return 'conflict';
  return 'unresolved';
}

function isSearchExhausted(field) {
  const hist = field.history || {};
  const noValueAttempts = toInt(hist.no_value_attempts, 0);
  const evidenceClasses = Array.isArray(hist.evidence_classes_tried) ? hist.evidence_classes_tried : [];
  return noValueAttempts >= EXHAUSTION_MIN_ATTEMPTS
    && evidenceClasses.length >= EXHAUSTION_MIN_EVIDENCE_CLASSES;
}

function buildFocusGroup(groupKey, fields, catalogEntry, queryExecutionHistory, config = null) {
  const satisfiedFieldKeys = [];
  const unresolvedFieldKeys = [];
  const weakFieldKeys = [];
  const conflictFieldKeys = [];
  const searchExhaustedFieldKeys = [];

  let coreUnresolvedCount = 0;
  let secondaryUnresolvedCount = 0;
  let optionalUnresolvedCount = 0;
  let exactMatchCount = 0;
  let noValueAttempts = 0;
  let duplicateAttemptsSuppressed = 0;
  let urlsExaminedCount = 0;
  let queryCount = 0;

  // GAP-6: Only collect union sets from non-accepted fields
  const queryTermsSets = [];
  const domainHintsSets = [];
  const preferredContentTypesSets = [];
  const existingQueriesSets = [];
  const domainsTriedSets = [];
  const hostClassesTriedSets = [];
  const evidenceClassesTriedSets = [];
  const aliasesSets = []; // GAP-3

  for (const field of fields) {
    const cls = classifyField(field);
    if (cls === 'satisfied') satisfiedFieldKeys.push(field.field_key);
    else if (cls === 'weak') weakFieldKeys.push(field.field_key);
    else if (cls === 'conflict') conflictFieldKeys.push(field.field_key);
    else unresolvedFieldKeys.push(field.field_key);

    // Count unresolved by required_level
    if (field.state !== 'accepted') {
      if (isCoreBucket(field.required_level)) coreUnresolvedCount++;
      else if (field.required_level === 'expected') secondaryUnresolvedCount++;
      else optionalUnresolvedCount++;
    }

    // Exact match
    if (field.exact_match_required && field.state !== 'accepted') {
      exactMatchCount++;
    }

    // Scalar sums from history
    const hist = field.history || {};
    noValueAttempts += toInt(hist.no_value_attempts, 0);
    duplicateAttemptsSuppressed += toInt(hist.duplicate_attempts_suppressed, 0);
    urlsExaminedCount += toInt(hist.urls_examined_count, 0); // GAP-8
    queryCount += toInt(hist.query_count, 0); // GAP-8

    // GAP-4: search exhaustion per field
    if (field.state !== 'accepted' && isSearchExhausted(field)) {
      searchExhaustedFieldKeys.push(field.field_key);
    }

    // GAP-6: Only aggregate union sets from non-accepted fields
    if (field.state !== 'accepted') {
      const idx = field.idx || {};
      queryTermsSets.push(idx.query_terms);
      domainHintsSets.push(idx.domain_hints);
      preferredContentTypesSets.push(idx.preferred_content_types);
      aliasesSets.push(idx.aliases); // GAP-3
      existingQueriesSets.push(hist.existing_queries);
      domainsTriedSets.push(hist.domains_tried);
      hostClassesTriedSets.push(hist.host_classes_tried);
      evidenceClassesTriedSets.push(hist.evidence_classes_tried);
    }
  }

  const fieldKeys = fields.map(f => f.field_key).sort();
  const hasUnresolved = unresolvedFieldKeys.length > 0 || weakFieldKeys.length > 0 || conflictFieldKeys.length > 0;

  // Priority
  let priority;
  if (coreUnresolvedCount > 0) priority = 'core';
  else if (secondaryUnresolvedCount > 0) priority = 'secondary';
  else priority = 'optional';

  // GAP-4: count non-accepted fields for exhaustion check
  const nonAcceptedCount = unresolvedFieldKeys.length + weakFieldKeys.length + conflictFieldKeys.length;
  const allFieldsExhausted = nonAcceptedCount > 0 && searchExhaustedFieldKeys.length >= nonAcceptedCount;

  // Phase: hold for resolved/exhausted, 'pending' for everything else (assigned to now/next after ranking)
  const phase = (!hasUnresolved || allFieldsExhausted) ? 'hold' : 'pending';

  // GAP-1: inline catalog metadata
  const cat = catalogEntry || {};

  // V4: collect unresolved field objects for normalized_key_queue and descriptions
  const unresolvedFields = fields.filter((f) => f.state !== 'accepted');

  // V4: group search worthiness
  const totalCount = fields.length;
  const resolvedCount = satisfiedFieldKeys.length;
  const coverageRatio = totalCount > 0 ? resolvedCount / totalCount : 1;
  const nonAcceptedFieldCount = unresolvedFieldKeys.length + weakFieldKeys.length + conflictFieldKeys.length;
  const groupQC = computeGroupQueryCount(groupKey, queryExecutionHistory);
  const productivityScore = computeGroupProductivityScore(unresolvedFields, groupQC);
  const worthiness = isGroupSearchWorthy({
    coverageRatio,
    unresolvedCount: nonAcceptedFieldCount,
    groupQueryCount: groupQC,
    phase,
  }, {}, config);

  return {
    key: groupKey, // GAP-10: renamed from group_key
    label: cat.label || groupKey, // GAP-1
    desc: cat.desc || '', // GAP-1
    source_target: cat.source_target || 'product_page', // GAP-1
    content_target: cat.content_target || 'general', // GAP-1
    field_keys: fieldKeys,
    satisfied_field_keys: satisfiedFieldKeys.sort(),
    unresolved_field_keys: unresolvedFieldKeys.sort(),
    weak_field_keys: weakFieldKeys.sort(),
    conflict_field_keys: conflictFieldKeys.sort(),
    search_exhausted_field_keys: searchExhaustedFieldKeys.sort(), // GAP-4
    search_exhausted_count: searchExhaustedFieldKeys.length, // GAP-4
    core_unresolved_count: coreUnresolvedCount,
    secondary_unresolved_count: secondaryUnresolvedCount,
    optional_unresolved_count: optionalUnresolvedCount,
    exact_match_count: exactMatchCount,
    no_value_attempts: noValueAttempts,
    duplicate_attempts_suppressed: duplicateAttemptsSuppressed,
    urls_examined_count: urlsExaminedCount, // GAP-8
    query_count: queryCount, // GAP-8
    query_terms_union: unionSorted(queryTermsSets),
    domain_hints_union: unionSorted(domainHintsSets),
    preferred_content_types_union: unionSorted(preferredContentTypesSets),
    existing_queries_union: unionSorted(existingQueriesSets),
    domains_tried_union: unionSorted(domainsTriedSets),
    host_classes_tried_union: unionSorted(hostClassesTriedSets),
    evidence_classes_tried_union: unionSorted(evidenceClassesTriedSets),
    aliases_union: unionSorted(aliasesSets), // GAP-3
    priority,
    phase, // 'hold' or 'pending' — converted to 'now'/'next' after ranking
    productivity_score: productivityScore,
    // V4 extensions
    group_description_short: buildGroupDescriptionShort(cat.desc),
    group_description_long: buildGroupDescriptionLong(
      cat.desc,
      unresolvedFields.map((f) => f.normalized_key || f.field_key)
    ),
    total_field_count: fields.length,
    resolved_field_count: satisfiedFieldKeys.length,
    coverage_ratio: fields.length > 0 ? satisfiedFieldKeys.length / fields.length : 1,
    group_query_count: computeGroupQueryCount(groupKey, queryExecutionHistory),
    group_key_retry_count: unresolvedFields.reduce((sum, f) => sum + (toInt(f.repeat_count, 0)), 0),
    group_search_worthy: worthiness.worthy,
    skip_reason: worthiness.skipReason,
    group_fingerprint_coarse: groupKey,
    group_fingerprint_fine: buildGroupFingerprintFine(
      groupKey,
      unresolvedFields.map((f) => f.normalized_key || f.field_key)
    ),
    normalized_key_queue: buildNormalizedKeyQueue(unresolvedFields),
    group_search_terms: unionSorted(queryTermsSets),
    content_type_candidates: unionSorted(preferredContentTypesSets),
    domains_tried_for_group: unionSorted(domainsTriedSets),
  };
}

export function buildSearchPlanningContext({
  needSetOutput,
  config = {},
  fieldGroupsData = {},
  categorySourceHosts = [],
  runContext = {},
  learning = null,
  previousRoundFields = null,
  queryExecutionHistory = null,
} = {}) {
  const ns = needSetOutput || {};
  const fields = Array.isArray(ns.fields) ? ns.fields : [];
  const rc = runContext || {};

  // Pass 1: Group fields by group_key
  const groupBuckets = new Map();
  for (const field of fields) {
    const key = (field.group_key && String(field.group_key).trim()) || '_ungrouped';
    if (!groupBuckets.has(key)) groupBuckets.set(key, []);
    groupBuckets.get(key).push(field);
  }

  // Build group_catalog from all encountered keys (GAP-7: category-aware)
  const allGroupKeys = [...groupBuckets.keys()];
  const groupCatalog = buildGroupCatalog(allGroupKeys, fieldGroupsData);

  // Pass 2: Build focus groups with catalog metadata inlined (GAP-1)
  const focusGroups = [];
  for (const [key, groupFields] of groupBuckets) {
    const catalogEntry = groupCatalog[key] || {};
    focusGroups.push(buildFocusGroup(key, groupFields, catalogEntry, queryExecutionHistory, config));
  }

  // Pass 2b: Budget-aware phase assignment
  // WHY: Phase must reflect the actual query budget so the dashboard shows
  // what will really execute, not aspirational counts.
  const round = rc.round ?? 0;
  const seedsStillNeeded = round === 0;
  const plannerLimits = derivePlannerLimits(config);
  const queryBudget = plannerLimits.searchProfileQueryCap || 10;

  // Pre-compute seed count for budget-aware group allocation
  const preSeedStatus = deriveSeedStatus(queryExecutionHistory, ns.identity, config, categorySourceHosts);
  let seedSlots = 0;
  if (preSeedStatus?.brand_seed?.is_needed) seedSlots++;
  if (preSeedStatus?.specs_seed?.is_needed) seedSlots++;
  for (const info of Object.values(preSeedStatus?.source_seeds || {})) {
    if (info?.is_needed) seedSlots++;
  }
  const groupBudget = Math.max(0, queryBudget - seedSlots);

  // WHY: Build phase overrides without mutating focusGroup objects.
  // pendingByProductivity is a sorted copy — original focusGroups order is untouched.
  const phaseOverrides = new Map();
  const pendingByProductivity = focusGroups
    .filter((g) => g.phase === 'pending')
    .sort((a, b) => b.productivity_score - a.productivity_score);

  if (pendingByProductivity.length > 0) {
    if (seedsStillNeeded) {
      // Round 0: all pending groups defer to 'next' — seeds take priority
      for (const g of pendingByProductivity) phaseOverrides.set(g.key, 'next');
    } else {
      // Round 1+: budget-aware — only worthy groups that fit the budget become 'now'
      // Non-worthy groups stay 'next' — their individual keys fire as Tier 3
      // but the group itself doesn't get a broad Tier 2 search.
      const worthyPending = pendingByProductivity.filter((g) => g.group_search_worthy === true);
      const nonWorthyPending = pendingByProductivity.filter((g) => g.group_search_worthy !== true);
      const nowGroupCount = Math.min(worthyPending.length, groupBudget);
      for (let i = 0; i < worthyPending.length; i++) {
        phaseOverrides.set(worthyPending[i].key, i < nowGroupCount ? 'now' : 'next');
      }
      for (const g of nonWorthyPending) phaseOverrides.set(g.key, 'next');
    }
  }

  // Apply overrides immutably — original focusGroups objects are never modified
  const phasedGroups = focusGroups.map((g) =>
    phaseOverrides.has(g.key) ? { ...g, phase: phaseOverrides.get(g.key) } : g
  );

  // Build field_priority_map: field_key → required_level
  const fieldPriorityMap = {};
  for (const f of fields) {
    if (f.field_key) fieldPriorityMap[f.field_key] = f.required_level || 'optional';
  }

  // Pass 3: Sort — phase (now < next < hold), then priority (core < secondary < optional), then key
  phasedGroups.sort((a, b) => {
    const phaseDiff = (PHASE_ORDER[a.phase] ?? 3) - (PHASE_ORDER[b.phase] ?? 3);
    if (phaseDiff !== 0) return phaseDiff;
    const priDiff = (PRIORITY_BUCKET_ORDER[a.priority] ?? 3) - (PRIORITY_BUCKET_ORDER[b.priority] ?? 3);
    if (priDiff !== 0) return priDiff;
    return a.key.localeCompare(b.key); // GAP-10: key not group_key
  });

  // Build needset block (slim — no heavy fields passthrough)
  const plannerSeed = ns.planner_seed || {};
  const needset = {
    summary: ns.summary || {},
    blockers: ns.blockers || {},
    missing_critical_fields: plannerSeed.missing_critical_fields || [],
    unresolved_fields: plannerSeed.unresolved_fields || [],
    existing_queries: plannerSeed.existing_queries || [],
  };

  // V4: seed_status (reuse pre-computed if same inputs, otherwise derive fresh)
  const seedStatus = preSeedStatus;

  // V4: tier_allocation — budget-aware slot distribution
  const tierAllocation = computeTierAllocation(seedStatus, phasedGroups, queryBudget);

  // V4: pass_seed signals — expanded with B queue
  const passSeed = {
    passA_specs_seed: seedStatus?.specs_seed?.is_needed ?? (round === 0),
    passA_source_candidates: [ns.identity?.official_domain, ns.identity?.support_domain].filter(Boolean),
    passA_target_groups: phasedGroups.filter((g) => g.phase === 'now').map((g) => g.key),
    passB_group_queue: phasedGroups
      .filter((g) => g.group_search_worthy === true && g.phase !== 'hold')
      .map((g) => g.key),
    passB_key_queue: phasedGroups
      .filter((g) => g.group_search_worthy === false &&
        Array.isArray(g.normalized_key_queue) && g.normalized_key_queue.length > 0)
      .flatMap((g) => g.normalized_key_queue.map((e) =>
        (e && typeof e === 'object') ? e.normalized_key : e
      )),
  };

  return {
    schema_version: 'search_planning_context.v2.1',
    run: {
      run_id: rc.run_id || '',
      category: rc.category || '',
      product_id: rc.product_id || '',
      brand: rc.brand || '',
      model: rc.model || '',
      base_model: rc.base_model || '', // GAP-5
      aliases: Array.isArray(rc.aliases) ? rc.aliases : [], // GAP-5
      round: rc.round ?? 0,
    },
    identity: ns.identity || null,
    needset,
    planner_limits: plannerLimits,
    group_catalog: groupCatalog,
    focus_groups: phasedGroups,
    field_priority_map: fieldPriorityMap,
    learning: learning || null,
    previous_round_fields: previousRoundFields || null,
    seed_status: seedStatus,
    pass_seed: passSeed,
    tier_allocation: tierAllocation,
  };
}
