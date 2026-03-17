import { toInt } from '../../../../shared/valueNormalizers.js';

export function normalizeProfileQuery(value) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeQueryProfileRow(row) {
  if (typeof row === 'string') {
    return { query: row };
  }
  if (!row || typeof row !== 'object') return null;
  return row;
}

export function enrichQueryRow(row, byQuery = new Map()) {
  if (!row || typeof row !== 'object') {
    return row;
  }
  const normalized = normalizeProfileQuery(row.query);
  if (!normalized) {
    return row;
  }
  const sourceRow = byQuery.get(normalized);
  if (!sourceRow || typeof sourceRow !== 'object') {
    return row;
  }
  const nextRow = { ...row };
  if (!nextRow.hint_source && sourceRow.hint_source) {
    nextRow.hint_source = String(sourceRow.hint_source || '').trim();
  }
  if ((!nextRow.doc_hint || !String(nextRow.doc_hint || '').trim()) && sourceRow.doc_hint) {
    nextRow.doc_hint = String(sourceRow.doc_hint || '').trim();
  }
  if ((!nextRow.domain_hint || !String(nextRow.domain_hint || '').trim()) && sourceRow.domain_hint) {
    nextRow.domain_hint = String(sourceRow.domain_hint || '').trim();
  }
  if ((!nextRow.source_host || !String(nextRow.source_host || '').trim()) && sourceRow.source_host) {
    nextRow.source_host = String(sourceRow.source_host || '').trim();
  }
  if ((!Array.isArray(nextRow.target_fields) || nextRow.target_fields.length === 0) && Array.isArray(sourceRow.target_fields)) {
    nextRow.target_fields = [...sourceRow.target_fields];
  }
  return nextRow;
}

export function toQueryRowLookup(profileOrRows) {
  const rows = [];
  if (Array.isArray(profileOrRows)) {
    rows.push(...profileOrRows);
  } else if (profileOrRows && typeof profileOrRows === 'object') {
    if (Array.isArray(profileOrRows.query_rows)) rows.push(...profileOrRows.query_rows);
    if (Array.isArray(profileOrRows.queries)) rows.push(...profileOrRows.queries);
  }
  const lookup = new Map();
  for (const row of rows) {
    const normalizedRow = normalizeQueryProfileRow(row);
    if (!normalizedRow) continue;
    const normalized = normalizeProfileQuery(normalizedRow.query);
    if (!normalized || lookup.has(normalized)) continue;
    lookup.set(normalized, normalizedRow);
  }
  return lookup;
}

export function incrementHintSourceCounts(target, source = '', parseIntValue = toInt) {
  const nextCounts = typeof target === 'object' && target !== null ? { ...target } : {};
  const key = String(source || '').trim();
  if (!key) return nextCounts;
  const normalizeCount = typeof parseIntValue === 'function'
    ? parseIntValue
    : ((value, fallback) => {
      const parsed = Number.parseInt(String(value || ''), 10);
      return Number.isFinite(parsed) ? parsed : (Number.isFinite(fallback) ? fallback : 0);
    });
  nextCounts[key] = (normalizeCount(nextCounts[key], 0) || 0) + 1;
  return nextCounts;
}

export function isRuntimeBridgeSource(source = '') {
  return String(source || '')
    .trim()
    .toLowerCase()
    .startsWith('runtime_bridge');
}

export function applyPlanProfileFallback(target = '', fallback = '') {
  const normalizedTarget = String(target || '').trim();
  const normalizedFallback = String(fallback || '').trim();
  return normalizedTarget || normalizedFallback;
}

export function mergeQueryRowFromPlan(row = {}, planRow = {}) {
  if (!row || typeof row !== 'object' || !planRow || typeof planRow !== 'object') {
    return row;
  }
  const nextRow = { ...row };
  const nextTargetFields = Array.isArray(nextRow.target_fields) ? nextRow.target_fields : [];
  if ((!nextTargetFields || nextTargetFields.length === 0) && Array.isArray(planRow.target_fields)) {
    nextRow.target_fields = [...planRow.target_fields];
  }
  nextRow.hint_source = applyPlanProfileFallback(nextRow.hint_source, planRow.hint_source);
  nextRow.doc_hint = applyPlanProfileFallback(nextRow.doc_hint, planRow.doc_hint);
  nextRow.domain_hint = applyPlanProfileFallback(nextRow.domain_hint, planRow.domain_hint);
  nextRow.source_host = applyPlanProfileFallback(nextRow.source_host, planRow.source_host);
  return nextRow;
}

export function mergeSearchProfileRows(runtimeProfile, planProfile, parseIntValue = toInt) {
  const runtimeRows = Array.isArray(runtimeProfile?.query_rows) ? runtimeProfile.query_rows : [];
  const runtimeLookup = toQueryRowLookup(runtimeProfile);
  const byQuery = toQueryRowLookup(planProfile);
  const planRows = Array.from(byQuery.values());

  const mergedRows = [];
  const seen = new Set();
  for (const row of runtimeRows) {
    if (!row || typeof row !== 'object') continue;
    const enrichedRow = enrichQueryRow(row, runtimeLookup);
    const normalized = normalizeProfileQuery(enrichedRow.query);
    const rowSource = String(enrichedRow.hint_source || '').trim();
    const planRow = normalized ? byQuery.get(normalized) : null;
    const merged = {
      ...(planRow && typeof planRow === 'object' ? planRow : {}),
      ...enrichedRow,
      query: String(enrichedRow.query || '').trim(),
      __from_plan_profile: Boolean(planRow)
    };
    const mergedQuery = normalizeProfileQuery(merged.query);
    if (!rowSource || isRuntimeBridgeSource(rowSource)) {
      merged.hint_source = planRow && typeof planRow.hint_source === 'string' ? planRow.hint_source : merged.hint_source;
    }
    if (!merged.doc_hint && planRow && typeof planRow.doc_hint === 'string') {
      merged.doc_hint = planRow.doc_hint;
    }
    if (!merged.domain_hint && planRow && typeof planRow.domain_hint === 'string') {
      merged.domain_hint = planRow.domain_hint;
    }
    if (!merged.source_host && planRow && typeof planRow.source_host === 'string') {
      merged.source_host = planRow.source_host;
    }
    if (planRow && typeof planRow === 'object') {
      const mergedFromPlan = mergeQueryRowFromPlan(merged, planRow);
      Object.assign(merged, {
        hint_source: mergedFromPlan.hint_source,
        doc_hint: mergedFromPlan.doc_hint,
        domain_hint: mergedFromPlan.domain_hint,
        source_host: mergedFromPlan.source_host,
        target_fields: mergedFromPlan.target_fields
      });
    }
    if ((!Array.isArray(merged.target_fields) || merged.target_fields.length === 0) && Array.isArray(planRow?.target_fields)) {
      merged.target_fields = [...planRow.target_fields];
    }
    mergedRows.push(merged);
    if (mergedQuery) seen.add(mergedQuery);
  }

  for (const row of planRows) {
    if (!row || typeof row !== 'object') continue;
    const query = normalizeProfileQuery(row.query);
    if (!query || seen.has(query)) continue;
    mergedRows.push({
      ...row,
      __from_plan_profile: true
    });
    seen.add(query);
  }

  const runtimeCounts = runtimeProfile?.hint_source_counts;
  const planCounts = planProfile?.hint_source_counts;
  let mergedCounts = planCounts && typeof planCounts === 'object'
    ? { ...planCounts }
    : {};
  if (runtimeCounts && typeof runtimeCounts === 'object') {
    Object.assign(mergedCounts, runtimeCounts);
  }
  for (const row of mergedRows) {
    mergedCounts = incrementHintSourceCounts(mergedCounts, row.hint_source, parseIntValue);
  }

  return {
    ...(runtimeProfile && typeof runtimeProfile === 'object' ? runtimeProfile : {}),
    ...(planProfile && typeof planProfile === 'object' ? planProfile : {}),
    query_rows: mergedRows,
    hint_source_counts: mergedCounts
  };
}
