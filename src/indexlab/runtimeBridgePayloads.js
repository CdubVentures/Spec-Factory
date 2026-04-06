// WHY: Payload builders and normalizers extracted from runtimeBridge.js
// Pure functions that shape event data for the runtime bridge.


import { toIso, asInt, asFloat } from './runtimeBridgeCoercers.js';
import { SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE } from '../features/indexing/api/contracts/prefetchContract.js';

export function toIdentityEvidenceRow(row = {}, index = 0) {
  const reasonCodes = Array.isArray(row?.reason_codes)
    ? row.reason_codes
    : (Array.isArray(row?.reasonCodes) ? row.reasonCodes : []);
  return {
    source_id: String(row?.source_id || row?.sourceId || `source_${String(index + 1).padStart(3, '0')}`).trim(),
    url: String(row?.url || '').trim(),
    host: String(row?.host || '').trim(),
    root_domain: String(row?.root_domain || row?.rootDomain || '').trim(),
    role: String(row?.role || '').trim(),
    tier: asInt(row?.tier, 0),
    candidate_brand: String(row?.candidate_brand || row?.candidateBrand || '').trim(),
    candidate_model: String(row?.candidate_model || row?.candidateModel || '').trim(),
    identity_score: asFloat(row?.identity_score ?? row?.identityScore, 0),
    identity_confidence: asFloat(
      row?.identity_confidence ?? row?.identityConfidence ?? row?.identity_score ?? row?.identityScore,
      0,
    ),
    reason_codes: Array.isArray(reasonCodes) ? reasonCodes : [],
  };
}

export function toIdentityContradictionRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      source: String(row?.source || '').trim(),
      conflict: String(row?.conflict || '').trim(),
    }))
    .filter((row) => row.source || row.conflict);
}

export function toFirstConflictTrigger(trigger = null) {
  if (!trigger || typeof trigger !== 'object') {
    return null;
  }
  return {
    source: String(trigger.source || '').trim(),
    conflict: String(trigger.conflict || '').trim(),
    contributors: (Array.isArray(trigger.contributors) ? trigger.contributors : [])
      .map((row, index) => toIdentityEvidenceRow(row, index))
      .filter((row) => row.source_id || row.url),
  };
}

export function toNeedSetSnapshot(row = {}, ts = '') {
  const safeTs = toIso(ts || row.ts || new Date().toISOString());
  return {
    run_id: String(row.runId || row.run_id || '').trim(),
    category: String(row.category || row.cat || '').trim(),
    product_id: String(row.productId || row.product_id || '').trim(),
    generated_at: safeTs,
    total_fields: asInt(row.total_fields, 0),
    summary: row.summary && typeof row.summary === 'object' ? row.summary : null,
    blockers: row.blockers && typeof row.blockers === 'object' ? row.blockers : { missing: 0, weak: 0, conflict: 0 },
    focus_fields: Array.isArray(row.focus_fields) ? row.focus_fields : [],
    bundles: Array.isArray(row.bundles) ? row.bundles : [],
    profile_mix: row.profile_mix && typeof row.profile_mix === 'object' ? row.profile_mix : null,
    profile_influence: row.profile_influence && typeof row.profile_influence === 'object' ? row.profile_influence : null,
    deltas: Array.isArray(row.deltas) ? row.deltas : [],
    rows: Array.isArray(row.rows) ? row.rows : [],
    debug: row.debug && typeof row.debug === 'object' ? row.debug : null,
    schema_version: row.schema_version || null,
    round: asInt(row.round, 0),
    identity: row.identity && typeof row.identity === 'object' ? row.identity : null,
    fields: Array.isArray(row.fields) ? row.fields : [],
    planner_seed: row.planner_seed && typeof row.planner_seed === 'object' ? row.planner_seed : null,
    needset_size: asInt(row.needset_size ?? row.size, 0),
  };
}

export function toNeedSetBaseline({
  runId = '',
  category = '',
  productId = '',
  ts = ''
} = {}) {
  const generatedAt = toIso(ts || new Date().toISOString());
  return {
    run_id: String(runId || '').trim(),
    category: String(category || '').trim(),
    product_id: String(productId || '').trim(),
    generated_at: generatedAt,
    total_fields: 0,
    summary: { total: 0, resolved: 0, core_total: 0, core_unresolved: 0, secondary_total: 0, secondary_unresolved: 0, optional_total: 0, optional_unresolved: 0, conflicts: 0, bundles_planned: 0 },
    blockers: { missing: 0, weak: 0, conflict: 0, search_exhausted: 0 },
    focus_fields: [],
    bundles: [],
    profile_mix: null,
    rows: [],
    deltas: [],
    debug: null,
    // NeedSet output additions
    schema_version: null,
    round: 0,
    identity: null,
    fields: [],
    planner_seed: null,
    // WHY: backward-compat — downstream consumers still check for needs[]
    needs: [],
    status: 'pending',
    source: 'runtime_bridge_baseline'
  };
}

export function normalizeQueryToken(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function pickSearchQueryFromUrl(rawUrl = '') {
  const token = String(rawUrl || '').trim();
  if (!token) return '';
  try {
    const parsed = new URL(token);
    const keys = ['q', 'query', 'search', 'k', 'keyword', 'keywords', 'ntt', 'wd', 'term'];
    for (const key of keys) {
      const value = String(parsed.searchParams.get(key) || '').trim();
      if (!value) continue;
      return value.replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
    }
  } catch {
    return '';
  }
  return '';
}

export function toSearchProfileBaseline({
  runId = '',
  category = '',
  productId = '',
  ts = ''
} = {}) {
  return {
    run_id: String(runId || '').trim(),
    category: String(category || '').trim(),
    product_id: String(productId || '').trim(),
    generated_at: toIso(ts || new Date().toISOString()),
    status: 'pending',
    provider: '',
    llm_query_planning: false,
    llm_query_model: '',
    llm_queries: [],
    identity_aliases: [],
    focus_fields: [],
    variant_guard_terms: [],
    query_reject_log: [],
    alias_reject_log: [],
    query_guard: {
      brand_tokens: [],
      model_tokens: [],
      required_digit_groups: [],
      accepted_query_count: 0,
      rejected_query_count: 0
    },
    query_count: 0,
    selected_query_count: 0,
    selected_queries: [],
    query_rows: [],
    query_stats: [],
    queries: [],
    source: 'runtime_bridge_baseline',
  };
}

export function toSearchProfileQueryRow(entry = {}) {
  const toStringArray = (arr) => Array.isArray(arr)
    ? arr.map((v) => String(v || '').trim()).filter(Boolean)
    : [];

  // WHY: Tier row fields derived from SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE (SSOT).
  // Adding a new tier field = one line in prefetchContract.js, zero changes here.
  const out = {};
  for (const { key, coerce, itemType } of SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE) {
    if (coerce === 'string') out[key] = String(entry[key] ?? '').trim();
    else if (coerce === 'int') out[key] = Math.max(0, asInt(entry[key], 0));
    else if (coerce === 'array') out[key] = itemType === 'string'
      ? toStringArray(entry[key])
      : (Array.isArray(entry[key]) ? entry[key] : []);
  }

  // Search-profile-specific fields (not part of tier row shape)
  out.attempts = Math.max(0, asInt(entry.attempts, 0));
  out.result_count = Math.max(0, asInt(entry.result_count, 0));
  out.providers = toStringArray(entry.providers).slice(0, 8);
  out.__from_plan_profile = Boolean(entry.__from_plan_profile);

  return out;
}

export function toSearchProfileQueryCard(entry = {}) {
  const row = toSearchProfileQueryRow(entry);
  return {
    query: row.query,
    hint_source: row.hint_source || 'runtime_bridge',
    target_fields: row.target_fields,
    doc_hint: row.doc_hint,
    domain_hint: row.domain_hint,
    source_host: row.source_host,
    result_count: row.result_count,
    attempts: row.attempts,
    providers: row.providers,
    candidate_count: 0,
    selected_count: 0,
    candidates: []
  };
}

export function isRuntimeSource(source = '') {
  return String(source || '')
    .trim()
    .toLowerCase()
    .startsWith('runtime_bridge');
}

export function mergeSearchProfileRows(runtimeRows = [], plannedRows = []) {
  const toLookup = (rows = []) => {
    const lookup = new Map();
    for (const row of rows) {
      const normalized = String(row?.query || '').trim().toLowerCase();
      if (!normalized || lookup.has(normalized)) continue;
      lookup.set(normalized, toSearchProfileQueryRow(row));
    }
    return lookup;
  };
  const runtimeLookup = toLookup(runtimeRows);
  const planLookup = toLookup(plannedRows);
  const mergedRows = [];
  const seen = new Set();
  for (const [normalized, runtimeRow] of runtimeLookup.entries()) {
    const planRow = planLookup.get(normalized);
    const merged = {
      ...runtimeRow,
      ...planRow
    };
    merged.query = String(runtimeRow.query || planRow?.query || '').trim();
    merged.attempts = Math.max(asInt(runtimeRow.attempts, 0), asInt(planRow?.attempts, 0));
    merged.result_count = Math.max(asInt(runtimeRow.result_count, 0), asInt(planRow?.result_count, 0));
    merged.providers = [
      ...(Array.isArray(planRow?.providers) ? planRow.providers : []),
      ...(Array.isArray(runtimeRow.providers) ? runtimeRow.providers : [])
    ].filter((value, index, self) => Boolean(value) && self.indexOf(value) === index).slice(0, 8);
    merged.__from_plan_profile = Boolean(planRow);

    if (merged.hint_source) {
      if (isRuntimeSource(merged.hint_source) && planRow?.hint_source) {
        merged.hint_source = String(planRow.hint_source || '').trim();
      }
    } else {
      merged.hint_source = String(planRow?.hint_source || '').trim();
    }
    if (!merged.doc_hint) merged.doc_hint = String(planRow?.doc_hint || '').trim();
    if (!merged.domain_hint) merged.domain_hint = String(planRow?.domain_hint || '').trim();
    if (!merged.source_host) merged.source_host = String(planRow?.source_host || '').trim();
    if ((!merged.target_fields || merged.target_fields.length === 0) && Array.isArray(planRow?.target_fields)) {
      merged.target_fields = [...planRow.target_fields];
    }
    if (isRuntimeSource(merged.hint_source)) {
      merged.hint_source = String(planRow?.hint_source || merged.hint_source).trim() || 'runtime_bridge';
    }
    mergedRows.push(merged);
    seen.add(normalized);
  }
  for (const [normalized, planRow] of planLookup.entries()) {
    if (seen.has(normalized)) continue;
    mergedRows.push({
      ...planRow,
      __from_plan_profile: true
    });
    seen.add(normalized);
  }
  return mergedRows
    .map((row) => toSearchProfileQueryRow(row))
    .filter((row) => row.query)
    .slice(0, 220);
}
