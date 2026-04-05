import path from 'node:path';
import { toInt } from '../../../../shared/valueNormalizers.js';
import { safeReadJson } from '../../../../shared/fileHelpers.js';
import { normalizeAutomationQuery } from './automationQueueHelpers.js';
import {
  resolveTotalFields, resolveResultCount, resolveSearchQuery,
  resolveUrl,
} from '../../../../shared/payloadAliases.js';

// ---------------------------------------------------------------------------
// Pure helpers (moved verbatim from indexlabDataBuilders.js)
// ---------------------------------------------------------------------------

export function buildNeedSetFromEvents(meta = {}, eventRows = []) {
  for (let i = eventRows.length - 1; i >= 0; i -= 1) {
    const row = eventRows[i] || {};
    if (String(row?.event || '').trim() !== 'needset_computed') continue;
    const payload = row?.payload && typeof row.payload === 'object'
      ? row.payload
      : {};
    const fields = Array.isArray(payload?.fields) ? payload.fields : [];
    const unresolved = fields.filter((f) => f && f.state !== 'accepted');
    const totalFields = Math.max(0, toInt(resolveTotalFields(payload, fields.length), fields.length));
    return {
      generated_at: String(row?.ts || meta?.ended_at || meta?.started_at || '').trim() || null,
      fields,
      total_fields: totalFields,
      field_count: totalFields,
      pending_fields: Math.max(0, toInt(payload?.pending_fields, unresolved.length)),
      unresolved_fields: Math.max(0, toInt(payload?.unresolved_fields, unresolved.length)),
      source: 'events_fallback'
    };
  }
  return {
    generated_at: String(meta?.ended_at || meta?.started_at || '').trim() || null,
    fields: [],
    total_fields: 0,
    field_count: 0,
    pending_fields: 0,
    unresolved_fields: 0,
    source: 'empty_fallback'
  };
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

export function pickSearchQueryFromEvent(row = {}) {
  const payload = row?.payload && typeof row.payload === 'object'
    ? row.payload
    : {};
  const direct = resolveSearchQuery(row, payload);
  if (direct) {
    return direct.replace(/\s+/g, ' ').trim();
  }
  const url = String(row?.url || payload?.url || '').trim();
  return pickSearchQueryFromUrl(url);
}

export function buildSearchProfileFromEvents(meta = {}, eventRows = []) {
  const queryMap = new Map();
  for (const row of eventRows) {
    const eventName = String(row?.event || '').trim().toLowerCase();
    const payload = row?.payload && typeof row.payload === 'object'
      ? row.payload
      : {};
    const query = pickSearchQueryFromEvent(row);
    const normalized = normalizeAutomationQuery(query);
    if (!normalized) continue;
    if (!queryMap.has(normalized)) {
      queryMap.set(normalized, {
        query,
        attempts: 0,
        result_count: 0,
        providers: new Set()
      });
    }
    const entry = queryMap.get(normalized);
    if (eventName === 'search_started' || eventName === 'discovery_query_started' || eventName === 'fetch_started') {
      entry.attempts += 1;
    }
    if (eventName === 'search_finished' || eventName === 'discovery_query_completed') {
      entry.result_count += Math.max(0, toInt(resolveResultCount(payload), 0));
    }
    const provider = String(payload?.provider || row?.provider || '').trim();
    if (provider) entry.providers.add(provider);
  }
  const queries = [...queryMap.values()]
    .filter((row) => String(row?.query || '').trim())
    .slice(0, 80)
    .map((row) => ({
      query: String(row.query || '').trim(),
      hint_source: 'events_fallback',
      target_fields: [],
      doc_hint: '',
      domain_hint: '',
      result_count: Math.max(0, toInt(row.result_count, 0)),
      attempts: Math.max(1, toInt(row.attempts, 0)),
      providers: [...(row.providers || new Set())],
      candidate_count: 0,
      selected_count: 0,
      candidates: []
    }));
  if (queries.length === 0) {
    return null;
  }
  return {
    generated_at: String(meta?.ended_at || meta?.started_at || '').trim() || null,
    query_count: queries.length,
    query_rows: queries.map((row) => ({
      query: row.query,
      target_fields: [],
      attempts: row.attempts,
      result_count: row.result_count
    })),
    query_stats: queries.map((row) => ({
      query: row.query,
      attempts: row.attempts,
      result_count: row.result_count
    })),
    queries,
    source: 'events_fallback'
  };
}

// ---------------------------------------------------------------------------
// Factory: creates 6 run-artifact reader functions with injected deps
// ---------------------------------------------------------------------------

export function createRunArtifactReaders({
  resolveRunDir,
  readMeta,
  readEvents,
  resolveProductId,
  resolveContext,
  getStorage,
  readOutputRootJson,
  getOutputRoot,
  getSpecDbReady,
}) {

  async function readIndexLabRunNeedSet(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;

    const meta = await readMeta(token);
    if (!meta || typeof meta !== 'object') return null;
    const category = String(meta?.category || '').trim();

    // SQL Tier 1: run_artifacts
    if (typeof getSpecDbReady === 'function' && category) {
      try {
        const specDb = await getSpecDbReady(category);
        if (specDb) {
          const row = specDb.getRunArtifact(token, 'needset');
          if (row?.payload && typeof row.payload === 'object') return row.payload;
        }
      } catch { /* SQL unavailable */ }
    }

    return null;
  }

  async function readIndexLabRunSearchProfile(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;

    const meta = await readMeta(token);
    if (!meta || typeof meta !== 'object') return null;
    const category = String(meta?.category || '').trim();

    // SQL Tier 1: run_artifacts
    if (typeof getSpecDbReady === 'function' && category) {
      try {
        const specDb = await getSpecDbReady(category);
        if (specDb) {
          const row = specDb.getRunArtifact(token, 'search_profile');
          if (row?.payload && typeof row.payload === 'object') return row.payload;
        }
      } catch { /* SQL unavailable */ }
    }

    return null;
  }

  async function readIndexLabRunSerpExplorer(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;

    const searchProfile = await readIndexLabRunSearchProfile(token);
    if (searchProfile?.serp_explorer && typeof searchProfile.serp_explorer === 'object') {
      return searchProfile.serp_explorer;
    }

    const runDir = await resolveRunDir(token);
    if (!runDir) return null;
    const meta = await readMeta(token);
    const category = String(meta?.category || '').trim();
    const resolvedRunId = String(meta?.run_id || token).trim();
    if (!category || !resolvedRunId) {
      return null;
    }
    const eventRows = await readEvents(token, 3000, { category });
    const productId = resolveProductId(meta, eventRows);
    if (!productId) return null;

    const storage = getStorage();
    const runSummaryKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'logs', 'summary.json');
    const runSummary = await storage.readJsonOrNull(runSummaryKey);
    if (!runSummary || typeof runSummary !== 'object') {
      return null;
    }
    const attemptRows = Array.isArray(runSummary.searches_attempted) ? runSummary.searches_attempted : [];
    const selectedUrlsRaw = Array.isArray(runSummary.urls_fetched) ? runSummary.urls_fetched : [];
    const selectedUrls = selectedUrlsRaw
      .map((row) => {
        if (typeof row === 'string') {
          return {
            url: String(row).trim(),
            query: '',
            doc_kind: '',
            tier_name: '',
            score: 0,
            reason_codes: ['summary_fallback']
          };
        }
        if (!row || typeof row !== 'object') return null;
        const url = resolveUrl(row);
        if (!url) return null;
        const reasonCodes = Array.isArray(row.reason_codes)
          ? row.reason_codes.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        return {
          url,
          query: String(row.query || '').trim(),
          doc_kind: String(row.doc_kind || '').trim(),
          tier_name: String(row.tier_name || '').trim(),
          score: Number(row.score ?? row.triage_score ?? 0),
          reason_codes: reasonCodes.length > 0 ? reasonCodes : ['summary_fallback']
        };
      })
      .filter(Boolean);
    return {
      generated_at: String(runSummary.generated_at || '').trim() || null,
      provider: String(runSummary.discovery?.provider || '').trim() || null,
      query_count: attemptRows.length,
      candidates_checked: 0,
      urls_triaged: 0,
      urls_selected: selectedUrls.length,
      urls_rejected: 0,
      dedupe_input: 0,
      dedupe_output: 0,
      duplicates_removed: 0,
      summary_only: true,
      selected_urls: selectedUrls,
      queries: attemptRows.map((row) => ({
        query: String(row?.query || '').trim(),
        hint_source: '',
        target_fields: [],
        doc_hint: '',
        domain_hint: '',
        result_count: Number(row?.result_count || 0),
        attempts: 1,
        providers: [String(row?.provider || '').trim()].filter(Boolean),
        candidate_count: 0,
        selected_count: 0,
        candidates: []
      }))
    };
  }

  return {
    readIndexLabRunNeedSet,
    readIndexLabRunSearchProfile,
    readIndexLabRunSerpExplorer,
  };
}
