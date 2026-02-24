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
  if (token === 'primary' || token === 'pass_primary' || token === 'discovery_planner_primary') return 'Primary';
  if (token.includes('fast')) return 'Fast';
  if (token.includes('reason')) return 'Reason';
  if (token.includes('validate')) return 'Validate';
  return token.replace(/_/g, ' ');
}

function createRow(query) {
  return {
    query: normalizeText(query),
    planned: false,
    selected_by: 'deterministic',
    selected_by_label: 'Deterministic',
    selected_by_tooltip: '',
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
    order_metric: 0,
    order_metric_label: '',
    order_justification: '',
    status: 'planned',
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

function compactReasons(row) {
  const out = [];
  if (row.planner_passes.length > 0) out.push(`Planner pass: ${row.planner_passes.join(', ')}`);
  if (row.hint_sources.length > 0) out.push(`Source: ${row.hint_sources.join(', ')}`);
  if (row.source_hosts.length > 0 || row.domain_hints.length > 0 || /\bsite:\s*[a-z0-9.-]+/i.test(row.query)) out.push('Domain/site constrained');
  if (row.doc_hints.length > 0) out.push(`Doc hint: ${row.doc_hints.join(', ')}`);
  if (row.target_fields.length > 0) out.push(`Targets ${row.target_fields.length} field${row.target_fields.length > 1 ? 's' : ''}`);
  if (out.length === 0) out.push('Profile-derived query');
  return out.slice(0, 5);
}

function computePlannedPriorityScore(row) {
  const passTokens = row.planner_passes.map((value) => normalizeToken(value));
  const hasValidate = passTokens.some((value) => value.includes('validate'));
  const hasReason = passTokens.some((value) => value.includes('reason'));
  const hasPrimary = passTokens.some((value) => value.includes('primary'));
  const hasFast = passTokens.some((value) => value.includes('fast'));
  const hasFieldRules = row.hint_sources.some((source) => normalizeToken(source).startsWith('field_rules.'));
  const hasDomainConstraint = row.source_hosts.length > 0 || row.domain_hints.length > 0 || /\bsite:\s*[a-z0-9.-]+/i.test(row.query);
  const score = (
    (hasValidate ? 28 : 0)
    + (hasReason ? 20 : 0)
    + (hasPrimary ? 14 : 0)
    + (hasFast ? 8 : 0)
    + Math.min(24, row.target_fields.length * 4)
    + Math.min(10, row.attempts * 2)
    + (hasFieldRules ? 8 : 0)
    + (hasDomainConstraint ? 6 : 0)
  );
  return Math.max(0, score);
}

function selectedByTooltip(row) {
  if (row.selected_by === 'planner') {
    const passText = row.planner_passes.length > 0 ? row.planner_passes.join(', ') : 'planner pass';
    return `Selected by the LLM search planner (${passText}) to improve coverage for missing fields and add better search angles.`;
  }
  return 'Selected by deterministic search-profile rules (identity, field hints, and query templates), not by the LLM planner.';
}

function orderJustification(row, firstSentMs) {
  if (row.execution_order != null && row.sent_ts) {
    const sentMs = parseTsMs(row.sent_ts);
    const deltaSec = sentMs > 0 && firstSentMs > 0 ? Math.max(0, (sentMs - firstSentMs) / 1000) : 0;
    row.order_metric = Math.round(deltaSec * 10) / 10;
    row.order_metric_label = `T+${row.order_metric.toFixed(1)}s`;
    row.order_justification = row.execution_order === 1
      ? `${row.order_metric_label}. First query sent in runtime execution order.`
      : `${row.order_metric_label}. Sent later based on runtime timestamp ordering (query #${row.execution_order}).`;
    return;
  }

  const priorityScore = computePlannedPriorityScore(row);
  row.order_metric = priorityScore;
  row.order_metric_label = `P${priorityScore}`;
  row.order_justification = `${row.order_metric_label}. Not sent yet. Ranked by planned priority score from pass type, target coverage, and constraints.`;
}

export function queryJourneyStatusLabel(status) {
  const token = normalizeToken(status);
  if (token === 'results_received') return 'Results received';
  if (token === 'sent') return 'Sent';
  if (token === 'observed') return 'Observed';
  return 'Planned';
}

export function queryJourneyStatusBadgeClass(status) {
  const token = normalizeToken(status);
  if (token === 'results_received') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200';
  if (token === 'sent') return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  if (token === 'observed') return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
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
  const firstSentMs = withTs.length > 0 ? parseTsMs(withTs[0].sent_ts) : 0;

  const rows = Array.from(byQuery.values()).map((row) => {
    row.selected_by = row.planner_passes.length > 0 ? 'planner' : 'deterministic';
    row.selected_by_label = row.selected_by === 'planner'
      ? `Planner (${row.planner_passes.join(', ')})`
      : 'Deterministic';
    row.selected_by_tooltip = selectedByTooltip(row);
    row.status = statusForRow(row);
    row.reasons = compactReasons(row);
    orderJustification(row, firstSentMs);
    return row;
  });

  return rows.sort((a, b) => {
    if (a.execution_order != null && b.execution_order != null) {
      return a.execution_order - b.execution_order;
    }
    if (a.execution_order != null) return -1;
    if (b.execution_order != null) return 1;
    if (a.order_metric !== b.order_metric) return b.order_metric - a.order_metric;
    return a.query.localeCompare(b.query);
  });
}
