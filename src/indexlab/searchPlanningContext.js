// Logic Box 2: Schema 2 (NeedSetOutput) → Schema 3 (SearchPlanningContext)
// Groups per-field data into per-group focus_groups[], attaches group_catalog metadata,
// aggregates hints/history with SET semantics (unresolved fields only).

const GROUP_DEFAULTS = {
  sensor_performance: { desc: 'Sensor and performance metrics', source_target: 'spec_sheet', content_target: 'technical_specs', search_intent: 'exact_match', host_class: 'lab_review' },
  connectivity:       { desc: 'Connection and wireless specs',  source_target: 'product_page', content_target: 'technical_specs', search_intent: 'exact_match', host_class: 'manufacturer' },
  construction:       { desc: 'Build quality and materials',    source_target: 'product_page', content_target: 'technical_specs', search_intent: 'exact_match', host_class: 'manufacturer' },
  dimensions:         { desc: 'Physical dimensions',            source_target: 'spec_sheet',   content_target: 'technical_specs', search_intent: 'exact_match', host_class: 'manufacturer' },
  ergonomics:         { desc: 'Shape and ergonomic features',   source_target: 'product_page', content_target: 'general',         search_intent: 'broad',       host_class: 'review' },
  switches:           { desc: 'Switch specifications',          source_target: 'spec_sheet',   content_target: 'technical_specs', search_intent: 'exact_match', host_class: 'manufacturer' },
  encoder:            { desc: 'Encoder specifications',         source_target: 'spec_sheet',   content_target: 'technical_specs', search_intent: 'exact_match', host_class: 'manufacturer' },
  electronics:        { desc: 'MCU and electronics',            source_target: 'spec_sheet',   content_target: 'technical_specs', search_intent: 'exact_match', host_class: 'lab_review' },
  buttons_features:   { desc: 'Buttons and feature set',        source_target: 'product_page', content_target: 'general',         search_intent: 'broad',       host_class: 'manufacturer' },
  controls:           { desc: 'Control mechanisms',             source_target: 'product_page', content_target: 'technical_specs', search_intent: 'exact_match', host_class: 'manufacturer' },
  general:            { desc: 'General product information',    source_target: 'product_page', content_target: 'general',         search_intent: 'broad',       host_class: 'any' },
};

const GENERIC_FALLBACK = { desc: '', source_target: 'product_page', content_target: 'general', search_intent: 'broad', host_class: 'any' };

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
    discoveryMaxQueries: toInt(config.discoveryMaxQueries, 6),
    discoveryMaxDiscovered: toInt(config.discoveryMaxDiscovered, 80),
    maxUrlsPerProduct: toInt(config.maxUrlsPerProduct, 20),
    maxCandidateUrls: toInt(config.maxCandidateUrls, 50),
    maxPagesPerDomain: toInt(config.maxPagesPerDomain, 2),
    maxRunSeconds: toInt(config.maxRunSeconds, 300),
    llmModelPlan: String(config.llmModelPlan || config.phase2LlmModel || ''),
    llmPlanProvider: String(config.llmPlanProvider || config.llmProvider || ''),
    llmPlanBaseUrl: String(config.llmPlanBaseUrl || config.llmBaseUrl || ''),
    llmTokensPlan: toInt(config.llmTokensPlan, 2048),
    llmMaxOutputTokensPlan: toInt(config.llmMaxOutputTokensPlan, 2048),
    searchProfileCapMap: parseCapMap(config.searchProfileCapMapJson),
    searchProvider: String(config.searchProvider || 'dual'),
  };
}

// GAP-7: resolve group metadata from fieldGroupsData first, then GROUP_DEFAULTS, then fallback
function resolveGroupMeta(groupKey, fieldGroupsData) {
  // Check fieldGroupsData for category-specific metadata
  if (fieldGroupsData && Array.isArray(fieldGroupsData.groups)) {
    const fgdGroup = fieldGroupsData.groups.find(g => g.group_key === groupKey);
    if (fgdGroup) {
      const hasMeta = fgdGroup.desc || fgdGroup.source_target || fgdGroup.search_intent;
      if (hasMeta) {
        return {
          label: fgdGroup.display_name || groupKey,
          desc: fgdGroup.desc || '',
          source_target: fgdGroup.source_target || 'product_page',
          content_target: fgdGroup.content_target || 'general',
          search_intent: fgdGroup.search_intent || 'broad',
          host_class: fgdGroup.host_class || 'any',
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
      search_intent: meta.search_intent,
      host_class: meta.host_class,
    };
  }

  return catalog;
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

function buildFocusGroup(groupKey, fields, hasCoreGroupAnywhere, catalogEntry) {
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

  // Phase — GAP-4: fully exhausted groups go to hold
  let phase;
  if (!hasUnresolved || allFieldsExhausted) {
    phase = 'hold';
  } else if (priority === 'core') {
    phase = 'now';
  } else if (priority === 'secondary' && !hasCoreGroupAnywhere) {
    phase = 'now';
  } else if (priority === 'secondary') {
    phase = 'next';
  } else {
    phase = 'hold';
  }

  // GAP-1: inline catalog metadata
  const cat = catalogEntry || {};

  return {
    key: groupKey, // GAP-10: renamed from group_key
    label: cat.label || groupKey, // GAP-1
    desc: cat.desc || '', // GAP-1
    source_target: cat.source_target || 'product_page', // GAP-1
    content_target: cat.content_target || 'general', // GAP-1
    search_intent: cat.search_intent || 'broad', // GAP-1
    host_class: cat.host_class || 'any', // GAP-1
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
    phase,
  };
}

export function buildSearchPlanningContext({
  needSetOutput,
  config = {},
  fieldGroupsData = {},
  runContext = {},
  learning = null,
  previousRoundFields = null,
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

  // Detect whether any group has core unresolved (for phase derivation)
  let hasCoreGroupAnywhere = false;
  for (const [, groupFields] of groupBuckets) {
    for (const f of groupFields) {
      if (f.state !== 'accepted' && isCoreBucket(f.required_level)) {
        hasCoreGroupAnywhere = true;
        break;
      }
    }
    if (hasCoreGroupAnywhere) break;
  }

  // Build group_catalog from all encountered keys (GAP-7: category-aware)
  const allGroupKeys = [...groupBuckets.keys()];
  const groupCatalog = buildGroupCatalog(allGroupKeys, fieldGroupsData);

  // Pass 2: Build focus groups with catalog metadata inlined (GAP-1)
  const focusGroups = [];
  for (const [key, groupFields] of groupBuckets) {
    const catalogEntry = groupCatalog[key] || {};
    focusGroups.push(buildFocusGroup(key, groupFields, hasCoreGroupAnywhere, catalogEntry));
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

  return {
    schema_version: 'search_planning_context.v2',
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
  };
}
