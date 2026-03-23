import fs from 'node:fs/promises';
import path from 'node:path';
import { toInt, normalizePathToken, normalizeJsonText } from '../../../../shared/valueNormalizers.js';
import { safeReadJson } from '../../../../shared/fileHelpers.js';
import { classifyLlmTracePhase } from '../../../../api/helpers/llmHelpers.js';
import { normalizeAutomationQuery } from './automationQueueHelpers.js';
import {
  resolveTotalFields, resolveResultCount, resolveSearchQuery,
  resolveUrl, normalizeLlmUsage, resolveMetaPath,
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
}) {

  async function readIndexLabRunNeedSet(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;
    const runDir = await resolveRunDir(token);
    if (!runDir) return null;

    const directPath = path.join(runDir, 'needset.json');
    const direct = await safeReadJson(directPath);

    const meta = await readMeta(token);
    if (!meta || typeof meta !== 'object') {
      return null;
    }
    const eventRows = await readEvents(token, 3000);
    const category = String(meta?.category || '').trim();
    const resolvedRunId = String(meta?.run_id || token).trim();
    const productId = resolveProductId(meta, eventRows);
    const storage = getStorage();
    if (category && resolvedRunId && productId && storage && typeof storage.resolveOutputKey === 'function') {
      const runNeedSetKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'analysis', 'needset.json');
      const outputRoot = getOutputRoot();
      const runNeedSetPath = path.join(outputRoot, ...String(runNeedSetKey || '').split('/'));
      const fromRunArtifact = await safeReadJson(runNeedSetPath);
      if (fromRunArtifact && typeof fromRunArtifact === 'object') {
        return fromRunArtifact;
      }

      const latestNeedSetKey = storage.resolveOutputKey(category, productId, 'latest', 'needset.json');
      const latestNeedSetPath = path.join(outputRoot, ...String(latestNeedSetKey || '').split('/'));
      const fromLatest = await safeReadJson(latestNeedSetPath);
      if (fromLatest && typeof fromLatest === 'object') {
        return fromLatest;
      }
    }

    if (direct && typeof direct === 'object') {
      return direct;
    }

    return buildNeedSetFromEvents(meta, eventRows);
  }

  async function readIndexLabRunSearchProfile(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;
    const runDir = await resolveRunDir(token);
    if (!runDir) return null;

    const meta = await readMeta(token);
    if (!meta || typeof meta !== 'object') {
      return null;
    }
    const eventRows = await readEvents(token, 3000);
    const category = String(meta?.category || '').trim();
    const resolvedRunId = String(meta?.run_id || token).trim();
    const productId = resolveProductId(meta, eventRows);
    const normalizedRunBase = resolveMetaPath(meta, 'run_base', 'runBase')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    const normalizedLatestBase = resolveMetaPath(meta, 'latest_base', 'latestBase')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');

    const storage = getStorage();
    if (productId && storage && typeof storage.resolveOutputKey === 'function' && typeof storage.readJsonOrNull === 'function') {
      const runProfileKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'analysis', 'search_profile.json');
      const runProfile = await storage.readJsonOrNull(runProfileKey);
      if (runProfile && typeof runProfile === 'object') {
        return runProfile;
      }

      const runProfileFromOutputRoot = await readOutputRootJson(runProfileKey);
      if (runProfileFromOutputRoot && typeof runProfileFromOutputRoot === 'object') {
        return runProfileFromOutputRoot;
      }

      const latestProfileKey = storage.resolveOutputKey(category, productId, 'latest', 'search_profile.json');
      const latestProfile = await storage.readJsonOrNull(latestProfileKey);
      if (latestProfile && typeof latestProfile === 'object') {
        return latestProfile;
      }

      const latestProfileFromOutputRoot = await readOutputRootJson(latestProfileKey);
      if (latestProfileFromOutputRoot && typeof latestProfileFromOutputRoot === 'object') {
        return latestProfileFromOutputRoot;
      }
    }

    if (normalizedRunBase) {
      const runBaseProfile = await readOutputRootJson(`${normalizedRunBase}/analysis/search_profile.json`);
      if (runBaseProfile && typeof runBaseProfile === 'object') {
        return runBaseProfile;
      }
    }

    if (normalizedLatestBase) {
      const latestBaseProfile = await readOutputRootJson(`${normalizedLatestBase}/search_profile.json`);
      if (latestBaseProfile && typeof latestBaseProfile === 'object') {
        return latestBaseProfile;
      }
    }

    if (category && resolvedRunId && storage && typeof storage.resolveInputKey === 'function' && typeof storage.readJsonOrNull === 'function') {
      const discoveryProfileKey = storage.resolveInputKey('_discovery', category, `${resolvedRunId}.search_profile.json`);
      const fromDiscoveryProfile = await storage.readJsonOrNull(discoveryProfileKey);
      if (fromDiscoveryProfile && typeof fromDiscoveryProfile === 'object') {
        return fromDiscoveryProfile;
      }

      const fromDiscoveryProfileFromOutputRoot = await readOutputRootJson(discoveryProfileKey);
      if (fromDiscoveryProfileFromOutputRoot && typeof fromDiscoveryProfileFromOutputRoot === 'object') {
        return fromDiscoveryProfileFromOutputRoot;
      }

      const discoveryLegacyKey = storage.resolveInputKey('_discovery', category, `${resolvedRunId}.json`);
      const fromDiscovery = await storage.readJsonOrNull(discoveryLegacyKey);
      if (fromDiscovery?.search_profile && typeof fromDiscovery.search_profile === 'object') {
        return fromDiscovery.search_profile;
      }

      const fromDiscoveryFromOutputRoot = await readOutputRootJson(discoveryLegacyKey);
      if (fromDiscoveryFromOutputRoot?.search_profile && typeof fromDiscoveryFromOutputRoot.search_profile === 'object') {
        return fromDiscoveryFromOutputRoot.search_profile;
      }
    }

    const localDiscoveryProfilePath = path.join(runDir, '_discovery', `${resolvedRunId}.search_profile.json`);
    const localDiscoveryProfile = await safeReadJson(localDiscoveryProfilePath);
    if (localDiscoveryProfile && typeof localDiscoveryProfile === 'object') {
      return localDiscoveryProfile;
    }

    const localDiscoveryLegacyPath = path.join(runDir, '_discovery', `${resolvedRunId}.json`);
    const localDiscoveryLegacy = await safeReadJson(localDiscoveryLegacyPath);
    if (localDiscoveryLegacy?.search_profile && typeof localDiscoveryLegacy.search_profile === 'object') {
      return localDiscoveryLegacy.search_profile;
    }

    const directPath = path.join(runDir, 'search_profile.json');
    const direct = await safeReadJson(directPath);
    if (direct && typeof direct === 'object') {
      return direct;
    }

    return buildSearchProfileFromEvents(meta, eventRows);
  }

  async function readIndexLabRunItemIndexingPacket(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;
    const runDir = await resolveRunDir(token);
    if (!runDir) return null;

    const directPath = path.join(runDir, 'item_indexing_extraction_packet.json');
    const direct = await safeReadJson(directPath);
    if (direct && typeof direct === 'object') {
      return direct;
    }

    const meta = await readMeta(token);
    const category = String(meta?.category || '').trim();
    const resolvedRunId = String(meta?.run_id || token).trim();
    if (!category || !resolvedRunId) {
      return null;
    }
    const eventRows = await readEvents(token, 3000);
    const productId = resolveProductId(meta, eventRows);
    if (!productId) return null;

    const storage = getStorage();
    const runKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'analysis', 'item_indexing_extraction_packet.json');
    const runPayload = await storage.readJsonOrNull(runKey);
    if (runPayload && typeof runPayload === 'object') {
      return runPayload;
    }

    const latestKey = storage.resolveOutputKey(category, productId, 'latest', 'item_indexing_extraction_packet.json');
    const latestPayload = await storage.readJsonOrNull(latestKey);
    if (latestPayload && typeof latestPayload === 'object') {
      return latestPayload;
    }

    return null;
  }

  async function readIndexLabRunRunMetaPacket(runId) {
    const token = String(runId || '').trim();
    if (!token) return null;
    const runDir = await resolveRunDir(token);
    if (!runDir) return null;

    const directPath = path.join(runDir, 'run_meta_packet.json');
    const direct = await safeReadJson(directPath);
    if (direct && typeof direct === 'object') {
      return direct;
    }

    const meta = await readMeta(token);
    const category = String(meta?.category || '').trim();
    const resolvedRunId = String(meta?.run_id || token).trim();
    if (!category || !resolvedRunId) {
      return null;
    }
    const eventRows = await readEvents(token, 3000);
    const productId = resolveProductId(meta, eventRows);
    if (!productId) return null;

    const storage = getStorage();
    const runKey = storage.resolveOutputKey(category, productId, 'runs', resolvedRunId, 'analysis', 'run_meta_packet.json');
    const runPayload = await storage.readJsonOrNull(runKey);
    if (runPayload && typeof runPayload === 'object') {
      return runPayload;
    }

    const latestKey = storage.resolveOutputKey(category, productId, 'latest', 'run_meta_packet.json');
    const latestPayload = await storage.readJsonOrNull(latestKey);
    if (latestPayload && typeof latestPayload === 'object') {
      return latestPayload;
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
    const eventRows = await readEvents(token, 3000);
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

  async function readIndexLabRunLlmTraces(runId, limit = 80) {
    const context = await resolveContext(runId);
    if (!context) return null;
    const outputRoot = getOutputRoot();
    const traceRoot = path.join(
      outputRoot,
      '_runtime',
      'traces',
      'runs',
      normalizePathToken(context.resolvedRunId, 'run'),
      normalizePathToken(context.productId, 'product'),
      'llm'
    );
    let entries = [];
    try {
      entries = await fs.readdir(traceRoot, { withFileTypes: true });
    } catch {
      return {
        generated_at: new Date().toISOString(),
        run_id: context.resolvedRunId,
        category: context.category,
        product_id: context.productId,
        count: 0,
        traces: []
      };
    }
    const fileRows = entries
      .filter((entry) => entry.isFile() && /^call_\d+\.json$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    const traces = [];
    for (const name of fileRows) {
      const filePath = path.join(traceRoot, name);
      const row = await safeReadJson(filePath);
      if (!row || typeof row !== 'object') continue;
      const usage = row.usage && typeof row.usage === 'object'
        ? row.usage
        : {};
      const prompt = row.prompt && typeof row.prompt === 'object'
        ? row.prompt
        : {};
      const response = row.response && typeof row.response === 'object'
        ? row.response
        : {};
      const routeRole = String(row.route_role || '').trim().toLowerCase();
      const purpose = String(row.purpose || '').trim();
      const ts = String(row.ts || '').trim();
      const tsMs = Date.parse(ts);
      traces.push({
        id: `${context.resolvedRunId}:${name}`,
        ts: ts || null,
        ts_ms: Number.isFinite(tsMs) ? tsMs : 0,
        phase: classifyLlmTracePhase(purpose, routeRole),
        role: routeRole || null,
        purpose: purpose || null,
        status: String(row.status || '').trim() || null,
        provider: String(row.provider || '').trim() || null,
        model: String(row.model || '').trim() || null,
        retry_without_schema: Boolean(row.retry_without_schema),
        json_schema_requested: Boolean(row.json_schema_requested),
        max_tokens_applied: toInt(row.max_tokens_applied, 0),
        target_fields: Array.isArray(row.target_fields)
          ? row.target_fields.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 80)
          : [],
        target_fields_count: toInt(row.target_fields_count, 0),
        prompt_preview: normalizeJsonText(prompt, 8000),
        response_preview: normalizeJsonText(response, 12000),
        error: String(row.error || '').trim() || null,
        usage: normalizeLlmUsage(usage, toInt),
        trace_file: name
      });
    }
    traces.sort((a, b) => {
      if (b.ts_ms !== a.ts_ms) return b.ts_ms - a.ts_ms;
      return String(b.trace_file || '').localeCompare(String(a.trace_file || ''));
    });
    const maxRows = Math.max(1, toInt(limit, 80));
    return {
      generated_at: new Date().toISOString(),
      run_id: context.resolvedRunId,
      category: context.category,
      product_id: context.productId,
      count: traces.length,
      traces: traces.slice(0, maxRows).map(({ ts_ms, ...row }) => row)
    };
  }

  return {
    readIndexLabRunNeedSet,
    readIndexLabRunSearchProfile,
    readIndexLabRunItemIndexingPacket,
    readIndexLabRunRunMetaPacket,
    readIndexLabRunSerpExplorer,
    readIndexLabRunLlmTraces,
  };
}
