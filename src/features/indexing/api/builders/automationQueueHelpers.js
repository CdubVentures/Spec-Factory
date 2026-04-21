import { toInt } from '../../../../shared/valueNormalizers.js';

export function clampAutomationPriority(value, fallback = 50) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, parsed));
}

export function automationPriorityForRequiredLevel(requiredLevel = '') {
  const level = String(requiredLevel || '').trim().toLowerCase();
  if (level === 'mandatory') return 20;
  if (level === 'non_mandatory') return 70;
  return 50;
}

export function automationPriorityForJobType(jobType = '') {
  const token = String(jobType || '').trim().toLowerCase();
  if (token === 'repair_search') return 20;
  if (token === 'deficit_rediscovery') return 35;
  if (token === 'staleness_refresh') return 55;
  if (token === 'domain_backoff') return 65;
  return 50;
}

export function toStringList(value, limit = 20) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(1, toInt(limit, 20)));
}

export function addUniqueStrings(base = [], extra = [], limit = 20) {
  const cap = Math.max(1, toInt(limit, 20));
  const seen = new Set(
    (Array.isArray(base) ? base : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  );
  for (const value of Array.isArray(extra) ? extra : []) {
    const token = String(value || '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    if (seen.size >= cap) break;
  }
  return [...seen];
}

export function buildAutomationJobId(prefix = '', dedupeKey = '') {
  const lhs = String(prefix || 'job').trim().toLowerCase() || 'job';
  const rhs = String(dedupeKey || '').trim().toLowerCase();
  if (!rhs) return `${lhs}:na`;
  let hash = 0;
  for (let i = 0; i < rhs.length; i += 1) {
    hash = ((hash << 5) - hash + rhs.charCodeAt(i)) | 0;
  }
  return `${lhs}:${Math.abs(hash).toString(36)}`;
}

export function normalizeAutomationStatus(value = '') {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'queued') return 'queued';
  if (token === 'running') return 'running';
  if (token === 'done') return 'done';
  if (token === 'failed') return 'failed';
  if (token === 'cooldown') return 'cooldown';
  return 'queued';
}

export function normalizeAutomationQuery(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function buildSearchProfileQueryMaps(searchProfile = {}) {
  const queryToFields = new Map();
  const fieldStats = new Map();
  const queryRows = Array.isArray(searchProfile?.query_rows) ? searchProfile.query_rows : [];
  const queryStatsRows = Array.isArray(searchProfile?.query_stats) ? searchProfile.query_stats : [];
  const fieldTargetQueries = searchProfile?.field_target_queries && typeof searchProfile.field_target_queries === 'object'
    ? searchProfile.field_target_queries
    : {};

  const ensureFieldStat = (fieldKey) => {
    const field = String(fieldKey || '').trim();
    if (!field) return null;
    if (!fieldStats.has(field)) {
      fieldStats.set(field, {
        attempts: 0,
        results: 0,
        queries: new Set()
      });
    }
    return fieldStats.get(field);
  };

  const queryStatsByQuery = new Map();
  for (const row of queryStatsRows) {
    const queryRaw = String(row?.query || '').trim();
    const query = normalizeAutomationQuery(queryRaw);
    if (!query) continue;
    queryStatsByQuery.set(query, {
      attempts: Math.max(0, toInt(row?.attempts, 0)),
      result_count: Math.max(0, toInt(row?.result_count, 0))
    });
  }

  for (const row of queryRows) {
    const queryRaw = String(row?.query || '').trim();
    const query = normalizeAutomationQuery(queryRaw);
    if (!query) continue;
    const targetFields = toStringList(row?.target_fields, 24);
    if (targetFields.length > 0) {
      if (!queryToFields.has(query)) queryToFields.set(query, new Set());
      const querySet = queryToFields.get(query);
      for (const field of targetFields) {
        querySet.add(field);
      }
    }
    const statsFallback = queryStatsByQuery.get(query) || {
      attempts: Math.max(0, toInt(row?.attempts, 0)),
      result_count: Math.max(0, toInt(row?.result_count, 0))
    };
    for (const field of targetFields) {
      const stat = ensureFieldStat(field);
      if (!stat) continue;
      stat.attempts += Math.max(0, toInt(statsFallback.attempts, 0));
      stat.results += Math.max(0, toInt(statsFallback.result_count, 0));
      stat.queries.add(queryRaw);
    }
  }

  for (const [fieldRaw, queriesRaw] of Object.entries(fieldTargetQueries)) {
    const field = String(fieldRaw || '').trim();
    if (!field) continue;
    const stat = ensureFieldStat(field);
    if (!stat) continue;
    const queries = toStringList(queriesRaw, 20);
    for (const query of queries) {
      const queryToken = normalizeAutomationQuery(query);
      if (!queryToken) continue;
      if (!queryToFields.has(queryToken)) queryToFields.set(queryToken, new Set());
      queryToFields.get(queryToken).add(field);
      stat.queries.add(query);
    }
  }

  const queryToFieldsFlat = new Map();
  for (const [query, set] of queryToFields.entries()) {
    queryToFieldsFlat.set(query, [...set].slice(0, 20));
  }
  const fieldStatsFlat = new Map();
  for (const [field, row] of fieldStats.entries()) {
    fieldStatsFlat.set(field, {
      attempts: Math.max(0, toInt(row?.attempts, 0)),
      results: Math.max(0, toInt(row?.results, 0)),
      queries: [...(row?.queries || new Set())].slice(0, 20)
    });
  }
  return {
    queryToFields: queryToFieldsFlat,
    fieldStats: fieldStatsFlat
  };
}
