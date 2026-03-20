// Logic Box 2: Schema 2 (NeedSetOutput) → Schema 3 (SearchPlanningContext)
// Groups per-field data into per-group focus_groups[], attaches group_catalog metadata,
// aggregates hints/history with SET semantics (unresolved fields only).

import { resolvePhaseModel, roleTokenCap } from '../core/llm/client/routing.js';
import { configInt, configValue } from '../shared/settingsAccessor.js';

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
const PRIORITY_ORDER = { core: 0, secondary: 1, optional: 2 };

// GAP-4: threshold for search exhaustion
const EXHAUSTION_NO_VALUE_THRESHOLD = 3;
const EXHAUSTION_EVIDENCE_CLASSES_THRESHOLD = 3;

function toInt(value, fallback) {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

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
    searchPlannerQueryCap: configInt(config, 'searchPlannerQueryCap'),
    maxUrlsPerProduct: configInt(config, 'maxUrlsPerProduct'),
    maxCandidateUrls: configInt(config, 'maxCandidateUrls'),
    maxPagesPerDomain: configInt(config, 'maxPagesPerDomain'),
    maxRunSeconds: configInt(config, 'maxRunSeconds'),
    llmModelPlan: resolvePhaseModel(config, 'needset') || String(configValue(config, 'llmModelPlan')),
    llmProvider: String(configValue(config, 'llmProvider')),
    llmMaxOutputTokensPlan: toInt(config._resolvedNeedsetMaxOutputTokens ?? config.llmMaxOutputTokensPlan, 2048),
    searchProfileCapMap: parseCapMap(config.searchProfileCapMapJson),
    searchEngines: String(config.searchEngines || 'bing,google'),
  };
}

// GAP-7: resolve group metadata from fieldGroupsData first, then GROUP_DEFAULTS, then fallback
function resolveGroupMeta(groupKey, fieldGroupsData) {
  // Check fieldGroupsData for category-specific metadata
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

  // Fall back to GROUP_DEFAULTS (mouse hardcoded)
  const defaults = GROUP_DEFAULTS[groupKey];
  if (defaults) {
    // label resolved separately (needs displayNameMap from fieldGroupsData)
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

export function isGroupSearchWorthy({ coverageRatio, unresolvedCount, groupQueryCount, phase }, thresholds = {}) {
  const coverageThreshold = thresholds.groupSearchCoverageThreshold ?? 0.80;
  const minUnresolved = thresholds.groupSearchMinUnresolved ?? 3;
  const maxRepeats = thresholds.groupSearchMaxRepeats ?? 3;

  if (phase === 'hold') return { worthy: false, skipReason: 'group_on_hold' };
  if (coverageRatio >= coverageThreshold) return { worthy: false, skipReason: 'group_mostly_resolved' };
  if (unresolvedCount < minUnresolved) return { worthy: false, skipReason: 'too_few_missing_keys' };
  if (groupQueryCount >= maxRepeats) return { worthy: false, skipReason: 'group_search_exhausted' };
  return { worthy: true, skipReason: null };
}

const V4_AVAILABILITY_RANKS = { always: 0, expected: 1, sometimes: 2, rare: 3, editorial_only: 4 };
const V4_DIFFICULTY_RANKS = { easy: 0, medium: 1, hard: 2 };
const V4_REQUIRED_LEVEL_RANKS = { identity: 0, critical: 1, required: 2, expected: 3, optional: 4 };

// WHY: Groups with easy-to-find, easy-to-extract, un-tried fields score highest.
// Higher score = more productive to search now.
export function computeGroupProductivityScore(unresolvedFields, groupQueryCount) {
  if (!unresolvedFields || unresolvedFields.length === 0) return 0;
  let totalAvail = 0;
  let totalDiff = 0;
  let totalNeed = 0;
  for (const f of unresolvedFields) {
    // Invert ranks: available/easy fields contribute MORE to score
    totalAvail += 4 - (V4_AVAILABILITY_RANKS[f.availability] ?? 4);
    totalDiff += 2 - (V4_DIFFICULTY_RANKS[f.difficulty] ?? 2);
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

export function buildNormalizedKeyQueue(unresolvedFields) {
  const entries = (unresolvedFields || []).map((f) => ({
    normalized_key: f.normalized_key || f.field_key,
    avail: V4_AVAILABILITY_RANKS[f.availability] ?? 4,
    diff: V4_DIFFICULTY_RANKS[f.difficulty] ?? 2,
    repeat: f.repeat_count || 0,
    need: f.need_score || 0,
    req: V4_REQUIRED_LEVEL_RANKS[f.required_level] ?? 4,
  }));
  entries.sort((a, b) =>
    (a.avail - b.avail) || (a.diff - b.diff) || (a.repeat - b.repeat) || (b.need - a.need) || (a.req - b.req)
  );
  return entries.map((e) => e.normalized_key);
}

export function deriveSeedStatus(queryExecutionHistory, identity, config = {}) {
  const queries = queryExecutionHistory?.queries || [];
  const cooldownMs = config.seedCooldownMs ?? 2592000000;
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

  const sourceSeeds = {};
  const sourceNames = new Set();
  for (const q of queries) {
    if (q.tier === 'seed' && q.source_name) sourceNames.add(q.source_name);
  }
  if (identity?.official_domain) sourceNames.add(identity.official_domain);
  if (identity?.support_domain) sourceNames.add(identity.support_domain);
  for (const name of sourceNames) {
    sourceSeeds[name] = seedStatusFor((q) => q.tier === 'seed' && q.source_name === name);
  }

  const complete = queries.filter((q) => q.status === 'scrape_complete' || q.status === 'exhausted').length;
  return {
    specs_seed: specsSeed,
    source_seeds: sourceSeeds,
    query_completion_summary: {
      total_queries: queries.length,
      complete,
      incomplete: queries.length - complete,
      pending_scrapes: queries.reduce((sum, q) => sum + (q.pending_count || 0), 0),
    },
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
  return noValueAttempts >= EXHAUSTION_NO_VALUE_THRESHOLD
    && evidenceClasses.length >= EXHAUSTION_EVIDENCE_CLASSES_THRESHOLD;
}

function buildFocusGroup(groupKey, fields, catalogEntry, queryExecutionHistory) {
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
  });

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
    focusGroups.push(buildFocusGroup(key, groupFields, catalogEntry, queryExecutionHistory));
  }

  // Pass 2b: Assign phases — rank pending groups by productivity score
  // If Tier 1 seeds haven't completed (round 0), all pending groups are 'next'
  const round = rc.round ?? 0;
  const seedsStillNeeded = round === 0;
  const pendingGroups = focusGroups.filter((g) => g.phase === 'pending');
  if (pendingGroups.length > 0) {
    pendingGroups.sort((a, b) => b.productivity_score - a.productivity_score);
    // Top half = now, rest = next. If seeds still needed, all = next.
    const nowCount = seedsStillNeeded ? 0 : Math.max(1, Math.ceil(pendingGroups.length / 2));
    for (let i = 0; i < pendingGroups.length; i++) {
      pendingGroups[i].phase = i < nowCount ? 'now' : 'next';
    }
  }

  // Build field_priority_map: field_key → required_level
  const fieldPriorityMap = {};
  for (const f of fields) {
    if (f.field_key) fieldPriorityMap[f.field_key] = f.required_level || 'optional';
  }

  // Pass 3: Sort — phase (now < next < hold), then priority (core < secondary < optional), then key
  focusGroups.sort((a, b) => {
    const phaseDiff = (PHASE_ORDER[a.phase] ?? 3) - (PHASE_ORDER[b.phase] ?? 3);
    if (phaseDiff !== 0) return phaseDiff;
    const priDiff = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
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

  // V4: seed_status
  const seedStatus = deriveSeedStatus(queryExecutionHistory, ns.identity, config);

  // V4: pass_seed signals
  const passSeed = {
    passA_specs_seed: (rc.round ?? 0) === 0,
    passA_source_candidates: [ns.identity?.official_domain, ns.identity?.support_domain].filter(Boolean),
    passA_target_groups: focusGroups.filter((g) => g.phase === 'now').map((g) => g.key),
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
      round_mode: rc.round_mode || 'seed',
    },
    identity: ns.identity || null,
    needset,
    planner_limits: derivePlannerLimits(config),
    group_catalog: groupCatalog,
    focus_groups: focusGroups,
    field_priority_map: fieldPriorityMap,
    learning: learning || null,
    previous_round_fields: previousRoundFields || null,
    seed_status: seedStatus,
    pass_seed: passSeed,
  };
}
