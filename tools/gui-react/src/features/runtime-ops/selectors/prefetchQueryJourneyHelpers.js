// WHY: Builds journey rows from search profile + planner + results data.
// Tier-native ordering: sent queries by execution_order, unsent by tier priority.

// WHY: Tier maps derived from the same registry as searchProfileTierHelpers.ts.
// Inline here because .js files can't import .ts under plain node --test.
// SSOT is TIER_REGISTRY in searchProfileTierHelpers.ts — keep in sync.
const TIER_MAP = { seed: 'seed', group_search: 'group', key_search: 'key' };
const HINT_SOURCE_TIER_MAP = { tier1_seed: 'seed', tier2_group: 'group', tier3_key: 'key' };
const TIER_LABELS = { seed: 'Seed', group: 'Group', key: 'Key' };

function classifyQueryTier(row) {
  const tier = String(row?.tier ?? '').trim();
  if (tier && TIER_MAP[tier]) return TIER_MAP[tier];
  const hint = String(row?.hint_source ?? '').trim();
  if (hint && HINT_SOURCE_TIER_MAP[hint]) return HINT_SOURCE_TIER_MAP[hint];
  return 'key';
}

function tierLabel(tierKey) {
  return TIER_LABELS[tierKey] ?? 'Key';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeToken(value) {
  return normalizeText(value).toLowerCase();
}

function parseTsMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? ms : 0;
}

function plannerPassDisplay(passName) {
  const token = normalizeToken(passName);
  if (!token) return 'Planner';
  if (token.startsWith('discovery_planner') || token === 'primary' || token === 'pass_primary') return 'Planner';
  return token.replace(/_/g, ' ');
}

function createRow(query) {
  return {
    query: normalizeText(query),
    planned: false,
    selected_by: 'deterministic',
    selected_by_label: 'Deterministic',
    planner_passes: [],
    target_fields: [],
    hint_sources: [],
    domain_hints: [],
    doc_hints: [],
    source_hosts: [],
    reasons: [],
    attempts: 0,
    sent_count: 0,
    result_count: 0,
    providers: [],
    sent_ts: null,
    execution_order: null,
    status: 'planned',
    // WHY: Tier metadata propagated from Search Profile query_rows.
    tier: '',
    group_key: '',
    normalized_key: '',
    repeat_count: 0,
  };
}

function ensure(map, query) {
  const token = normalizeToken(query);
  if (!token) return null;
  if (!map.has(token)) map.set(token, createRow(query));
  return map.get(token);
}

function addUnique(target, value) {
  const token = normalizeText(value);
  if (!token) return;
  if (!target.includes(token)) target.push(token);
}

function statusForRow(row) {
  if (row.sent_count > 0 && row.result_count > 0) return 'results_received';
  if (row.sent_count > 0) return 'sent';
  if (row.planned) return 'planned';
  return 'observed';
}

// WHY: Tier priority order matches the pipeline budget allocation.
const TIER_SORT_ORDER = { seed: 0, group: 1, key: 2 };

export function queryJourneyStatusLabel(status) {
  const token = normalizeToken(status);
  if (token === 'results_received') return 'Results received';
  if (token === 'sent') return 'Sent';
  if (token === 'observed') return 'Observed';
  return 'Planned';
}

export function queryJourneyStatusBadgeClass(status) {
  const token = normalizeToken(status);
  if (token === 'results_received') return 'sf-chip-success';
  if (token === 'sent') return 'sf-chip-info';
  if (token === 'observed') return 'sf-chip-accent';
  return 'sf-chip-neutral';
}

export function buildQueryJourneyRows({
  queryRows = [],
  searchPlans = [],
  searchResults = [],
  searchResultDetails = [],
} = {}) {
  const byQuery = new Map();

  for (const row of Array.isArray(queryRows) ? queryRows : []) {
    const query = normalizeText(row?.query);
    if (!query) continue;
    const next = ensure(byQuery, query);
    if (!next) continue;
    next.planned = true;
    next.attempts = Math.max(next.attempts, Number.parseInt(String(row?.attempts || 0), 10) || 0);
    next.result_count = Math.max(next.result_count, Number.parseInt(String(row?.result_count || 0), 10) || 0);
    for (const targetField of Array.isArray(row?.target_fields) ? row.target_fields : []) {
      addUnique(next.target_fields, targetField);
    }
    for (const provider of Array.isArray(row?.providers) ? row.providers : []) {
      addUnique(next.providers, provider);
    }
    addUnique(next.hint_sources, row?.hint_source);
    addUnique(next.domain_hints, row?.domain_hint);
    addUnique(next.doc_hints, row?.doc_hint);
    addUnique(next.source_hosts, row?.source_host);
    // WHY: Propagate tier metadata from Search Profile rows.
    if (row?.tier && !next.tier) next.tier = normalizeText(row.tier);
    if (row?.group_key && !next.group_key) next.group_key = normalizeText(row.group_key);
    if (row?.normalized_key && !next.normalized_key) next.normalized_key = normalizeText(row.normalized_key);
    if (typeof row?.repeat_count === 'number' && !next.repeat_count) next.repeat_count = row.repeat_count;
  }

  for (const plan of Array.isArray(searchPlans) ? searchPlans : []) {
    const passLabel = plannerPassDisplay(plan?.pass_name);
    const generated = Array.isArray(plan?.queries_generated) ? plan.queries_generated : [];
    for (const query of generated) {
      const next = ensure(byQuery, query);
      if (!next) continue;
      next.planned = true;
      addUnique(next.planner_passes, passLabel);
      const targets = plan?.query_target_map && typeof plan.query_target_map === 'object'
        ? plan.query_target_map[String(query)]
        : [];
      for (const targetField of Array.isArray(targets) ? targets : []) {
        addUnique(next.target_fields, targetField);
      }
    }
  }

  for (const result of Array.isArray(searchResults) ? searchResults : []) {
    const next = ensure(byQuery, result?.query);
    if (!next) continue;
    next.sent_count += 1;
    next.result_count += Number.parseInt(String(result?.result_count || 0), 10) || 0;
    addUnique(next.providers, result?.provider);
    const ts = normalizeText(result?.ts);
    if (ts) {
      if (!next.sent_ts || parseTsMs(ts) < parseTsMs(next.sent_ts)) next.sent_ts = ts;
    }
  }

  for (const detail of Array.isArray(searchResultDetails) ? searchResultDetails : []) {
    const next = ensure(byQuery, detail?.query);
    if (!next) continue;
    addUnique(next.providers, detail?.provider);
    if (next.result_count <= 0) {
      next.result_count = Math.max(0, Array.isArray(detail?.results) ? detail.results.length : 0);
    }
  }

  const withTs = Array.from(byQuery.values())
    .filter((row) => row.sent_ts)
    .sort((a, b) => parseTsMs(a.sent_ts) - parseTsMs(b.sent_ts) || a.query.localeCompare(b.query));
  withTs.forEach((row, index) => {
    row.execution_order = index + 1;
  });

  const rows = Array.from(byQuery.values()).map((row) => {
    const tierKey = classifyQueryTier(row);
    const label = tierLabel(tierKey);
    row.selected_by = row.planner_passes.length > 0 ? 'planner' : tierKey;
    row.selected_by_label = row.planner_passes.length > 0
      ? `${label} + Planner`
      : label;
    row.status = statusForRow(row);
    return row;
  });

  // WHY: Sent queries first by execution order, unsent by tier priority.
  return rows.sort((a, b) => {
    if (a.execution_order != null && b.execution_order != null) {
      return a.execution_order - b.execution_order;
    }
    if (a.execution_order != null) return -1;
    if (b.execution_order != null) return 1;
    const tierA = TIER_SORT_ORDER[classifyQueryTier(a)] ?? 4;
    const tierB = TIER_SORT_ORDER[classifyQueryTier(b)] ?? 4;
    if (tierA !== tierB) return tierA - tierB;
    return a.query.localeCompare(b.query);
  });
}
