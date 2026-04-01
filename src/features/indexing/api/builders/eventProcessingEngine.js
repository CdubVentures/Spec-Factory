// WHY: Single-pass event processing engine. Replaces 15+ separate for-loops
// with one pass over events, dispatching to all interested panel accumulators
// via a routing table. Adding a panel = one registry entry, zero new for-loops.

import {
  eventType, payloadOf, extractUrl, extractHost,
  toInt, toFloat, parseTsMs, fetchStatusCode,
  sourceProcessedParseMethod, parseFinishedMethod,
} from './runtimeOpsEventPrimitives.js';
import {
  SUMMARY_HANDLERS, SUMMARY_SCOPE_FILTERED,
  DOCUMENT_HANDLERS, METRICS_HANDLERS, PIPELINE_STAGES,
} from './runtimeOpsDataBuilders.js';
import { buildRuntimeOpsWorkers } from './runtimeOpsWorkerPoolBuilders.js';
import { buildPreFetchPhases } from './runtimeOpsPreFetchBuilders.js';
import { buildFetchPhases } from './runtimeOpsFetchBuilders.js';
import { buildExtractionPluginPhases } from './runtimeOpsExtractionPluginBuilders.js';
import { buildLlmCallsDashboard } from './runtimeOpsLlmDashboardBuilders.js';

// ── Registry entries ────────────────────────────────────────────────────────
// Each entry: { key, eventTypes, create(ctx), handle(type, payload, evt, state), finalize(state, ctx) }
// Entries with standalone: true bypass the single-pass loop and call the
// standalone builder directly (used for complex builders during incremental migration).

function createRegistry() {
  return [
    // ── Summary ──
    {
      key: 'summary',
      eventTypes: [...Object.keys(SUMMARY_HANDLERS), 'bootstrap_step', 'browser_pool_warmed'],
      create(ctx) {
        return {
          fetchStarted: 0, fetchFinished: 0, fetchErrors: 0,
          parseStarted: 0, parseFinished: 0,
          llmStarted: 0, llmFinished: 0, llmFieldsExtracted: 0,
          indexedFieldsExtracted: 0, hostErrors: {},
          bootStep: '', bootProgress: 0, browserPool: null,
        };
      },
      handle(type, payload, evt, s) {
        if (SUMMARY_SCOPE_FILTERED.has(type)) {
          const scope = String(payload.scope || '').trim().toLowerCase();
          if (scope === 'stage') return;
        }
        const handler = SUMMARY_HANDLERS[type];
        if (handler) { handler(payload, evt, s); return; }
        // WHY: Forward scan replaces backward scan. Last-write-wins captures
        // the latest bootstrap_step/browser_pool_warmed identically.
        if (type === 'bootstrap_step') {
          s.bootStep = String(payload.step || '').trim();
          s.bootProgress = Math.max(0, Math.min(100, Number(payload.progress) || 0));
        } else if (type === 'browser_pool_warmed') {
          s.browserPool = payload;
        }
      },
      finalize(s, ctx) {
        const safeMeta = ctx.meta && typeof ctx.meta === 'object' ? ctx.meta : {};
        const totalFetches = s.fetchFinished || s.fetchStarted;
        const errorRate = totalFetches > 0 ? s.fetchErrors / totalFetches : 0;
        const startedMs = parseTsMs(safeMeta.started_at);
        const endedMs = parseTsMs(safeMeta.ended_at);
        const elapsedMinutes = startedMs > 0
          ? ((endedMs > startedMs ? endedMs : Date.now()) - startedMs) / 60_000
          : 0;
        const docsPerMin = elapsedMinutes > 0 ? s.parseFinished / elapsedMinutes : 0;
        const countedFields = s.indexedFieldsExtracted > 0 ? s.indexedFieldsExtracted : s.llmFieldsExtracted;
        const fieldsPerMin = elapsedMinutes > 0 ? countedFields / elapsedMinutes : 0;
        const topBlockers = Object.entries(s.hostErrors)
          .map(([host, count]) => ({ host, error_count: count }))
          .sort((a, b) => b.error_count - a.error_count)
          .slice(0, 10);
        const bootStep = s.bootStep || String(safeMeta.boot_step || '').trim();
        const bootProgress = s.bootStep
          ? s.bootProgress
          : Math.max(0, Math.min(100, Number(safeMeta.boot_progress) || 0));
        const browserPool = s.browserPool || safeMeta.browser_pool || null;
        return {
          status: String(safeMeta.status || '').trim() || 'unknown',
          round: toInt(safeMeta.round, 0),
          phase_cursor: String(safeMeta.phase_cursor || '').trim(),
          boot_step: bootStep,
          boot_progress: bootProgress,
          browser_pool: browserPool,
          total_fetches: totalFetches,
          total_parses: s.parseFinished,
          total_llm_calls: s.llmFinished,
          error_rate: Math.round(errorRate * 1000) / 1000,
          docs_per_min: Math.round(docsPerMin * 100) / 100,
          fields_per_min: Math.round(fieldsPerMin * 100) / 100,
          top_blockers: topBlockers,
        };
      },
    },

    // ── Pipeline Flow ──
    {
      key: 'pipeline_flow',
      eventTypes: [
        'search_started', 'search_finished', 'fetch_started', 'fetch_finished',
        'parse_started', 'parse_finished', 'index_started', 'index_finished',
        'llm_started', 'llm_finished', 'llm_failed',
      ],
      create() {
        const stageData = {};
        for (const name of PIPELINE_STAGES) {
          stageData[name] = { name, active: 0, completed: 0, failed: 0, activeKeys: new Set() };
        }
        return { stageData, recentTransitions: [], urlStages: {} };
      },
      handle(type, payload, evt, s) {
        if (payload.scope === 'stage') return;
        const url = extractUrl(evt) || String(payload.query || payload.batch_id || '').trim();
        const { stageData, recentTransitions, urlStages } = s;
        const ts = String(evt?.ts || '').trim();
        if (type === 'search_started') { stageData.search.activeKeys.add(url); }
        else if (type === 'search_finished') { stageData.search.activeKeys.delete(url); stageData.search.completed += 1; if (url) urlStages[url] = 'search'; }
        else if (type === 'fetch_started') { stageData.fetch.activeKeys.add(url); }
        else if (type === 'fetch_finished') {
          stageData.fetch.activeKeys.delete(url);
          const code = fetchStatusCode(payload, 0);
          if (code >= 400 || code === 0) stageData.fetch.failed += 1; else stageData.fetch.completed += 1;
          const prev = urlStages[url]; urlStages[url] = 'fetch';
          if (prev && prev !== 'fetch') recentTransitions.push({ url, from_stage: prev, to_stage: 'fetch', ts });
        }
        else if (type === 'parse_started') { stageData.parse.activeKeys.add(url); }
        else if (type === 'parse_finished') {
          stageData.parse.activeKeys.delete(url); stageData.parse.completed += 1;
          const prev = urlStages[url]; urlStages[url] = 'parse';
          if (prev && prev !== 'parse') recentTransitions.push({ url, from_stage: prev, to_stage: 'parse', ts });
        }
        else if (type === 'index_started') { stageData.index.activeKeys.add(url); }
        else if (type === 'index_finished') {
          stageData.index.activeKeys.delete(url); stageData.index.completed += 1;
          const prev = urlStages[url]; urlStages[url] = 'index';
          if (prev && prev !== 'index') recentTransitions.push({ url, from_stage: prev, to_stage: 'index', ts });
        }
        else if (type === 'llm_started') { const key = String(payload.batch_id || '').trim() || url; stageData.llm.activeKeys.add(key); }
        else if (type === 'llm_finished') { const key = String(payload.batch_id || '').trim() || url; stageData.llm.activeKeys.delete(key); stageData.llm.completed += 1; }
        else if (type === 'llm_failed') { const key = String(payload.batch_id || '').trim() || url; stageData.llm.activeKeys.delete(key); stageData.llm.failed += 1; }
      },
      finalize(s) {
        for (const name of PIPELINE_STAGES) {
          s.stageData[name].active = s.stageData[name].activeKeys.size;
          delete s.stageData[name].activeKeys;
        }
        return { stages: PIPELINE_STAGES.map((name) => s.stageData[name]), recent_transitions: s.recentTransitions.slice(-20) };
      },
    },

    // ── Metrics Rail ──
    {
      key: 'metrics_rail',
      eventTypes: Object.keys(METRICS_HANDLERS),
      create() {
        return {
          pools: {
            search: { active: 0, queued: 0, completed: 0, failed: 0 },
            fetch: { active: 0, queued: 0, completed: 0, failed: 0 },
            parse: { active: 0, queued: 0, completed: 0, failed: 0 },
            llm: { active: 0, queued: 0, completed: 0, failed: 0 },
            extraction: { active: 0, queued: 0, completed: 0, failed: 0 },
          },
          activeSearch: new Set(), activeFetch: new Set(), activeParse: new Set(), activeLlm: new Set(),
          identityStatus: 'unknown', acceptanceRate: 0, meanConfidence: 0,
          totalFetches: 0, fallbackCount: 0, blockedHosts: new Set(), retryTotal: 0,
          statusCodes: {}, retryHistogram: [], topErrors: [], avgOkMs: 0, avgFailMs: 0,
        };
      },
      handle(type, payload, evt, ms) {
        const handler = METRICS_HANDLERS[type];
        if (handler) handler(payload, extractUrl(evt), ms);
      },
      finalize(ms) {
        ms.pools.search.active = ms.activeSearch.size;
        ms.pools.fetch.active = ms.activeFetch.size;
        ms.pools.parse.active = ms.activeParse.size;
        ms.pools.llm.active = ms.activeLlm.size;
        const fallbackRate = ms.totalFetches > 0 ? Math.round((ms.fallbackCount / ms.totalFetches) * 1000) / 1000 : 0;
        return {
          pool_metrics: ms.pools,
          quality_metrics: { identity_status: ms.identityStatus, acceptance_rate: ms.acceptanceRate, mean_confidence: ms.meanConfidence },
          failure_metrics: { total_fetches: ms.totalFetches, fallback_count: ms.fallbackCount, fallback_rate: fallbackRate, blocked_hosts: ms.blockedHosts.size, retry_total: ms.retryTotal, no_progress_streak: 0 },
          crawl_engine: { status_codes: ms.statusCodes, retry_histogram: ms.retryHistogram, top_errors: ms.topErrors, avg_ok_ms: ms.avgOkMs, avg_fail_ms: ms.avgFailMs },
        };
      },
    },

    // ── Documents ──
    {
      key: 'documents',
      eventTypes: Object.keys(DOCUMENT_HANDLERS),
      create() { return { docs: {}, limit: 500 }; },
      handle(type, payload, evt, s) {
        const url = extractUrl(evt);
        if (!url) return;
        const ts = String(evt?.ts || '').trim();
        if (!s.docs[url]) {
          s.docs[url] = {
            url, host: extractHost(url), status: 'discovered',
            status_code: null, bytes: null, content_type: null, content_hash: null,
            dedupe_outcome: null, parse_method: null, last_event_ts: ts,
          };
        }
        const doc = s.docs[url];
        if (ts > doc.last_event_ts) doc.last_event_ts = ts;
        const handler = DOCUMENT_HANDLERS[type];
        if (handler) handler(payload, doc);
      },
      finalize(s) {
        return Object.values(s.docs)
          .sort((a, b) => (b.last_event_ts || '').localeCompare(a.last_event_ts || ''))
          .slice(0, Math.max(1, s.limit));
      },
    },

    // ── Fallbacks ──
    {
      key: 'fallbacks',
      eventTypes: ['scheduler_fallback_started', 'scheduler_fallback_succeeded', 'scheduler_fallback_exhausted', 'fetch_finished'],
      create() { return { rows: [], hostData: {} }; },
      handle(type, payload, evt, s) {
        const ts = String(evt?.ts || '').trim();
        const url = String(payload.url || '').trim();
        const host = extractHost(url);
        if (type === 'scheduler_fallback_started') {
          s.rows.push({ url, host, from_mode: String(payload.from_mode || '').trim(), to_mode: String(payload.to_mode || '').trim(), reason: String(payload.reason || '').trim(), attempt: toInt(payload.attempt, 0), result: 'pending', elapsed_ms: 0, ts });
          if (host) { if (!s.hostData[host]) s.hostData[host] = { started: 0, succeeded: 0, exhausted: 0, blocked: 0, modes: new Set() }; s.hostData[host].started += 1; if (payload.from_mode) s.hostData[host].modes.add(payload.from_mode); if (payload.to_mode) s.hostData[host].modes.add(payload.to_mode); }
        } else if (type === 'scheduler_fallback_succeeded') {
          s.rows.push({ url, host, from_mode: String(payload.from_mode || '').trim(), to_mode: String(payload.to_mode || '').trim(), reason: String(payload.reason || '').trim(), attempt: toInt(payload.attempt, 0), result: 'succeeded', elapsed_ms: toInt(payload.elapsed_ms, 0), ts });
          if (host) { if (!s.hostData[host]) s.hostData[host] = { started: 0, succeeded: 0, exhausted: 0, blocked: 0, modes: new Set() }; s.hostData[host].succeeded += 1; }
        } else if (type === 'scheduler_fallback_exhausted') {
          s.rows.push({ url, host, from_mode: String(payload.from_mode || '').trim(), to_mode: String(payload.to_mode || '').trim(), reason: String(payload.reason || '').trim(), attempt: toInt(payload.attempt, 0), result: 'exhausted', elapsed_ms: toInt(payload.elapsed_ms, 0), ts });
          if (host) { if (!s.hostData[host]) s.hostData[host] = { started: 0, succeeded: 0, exhausted: 0, blocked: 0, modes: new Set() }; s.hostData[host].exhausted += 1; }
        } else if (type === 'fetch_finished' && payload.fallback) {
          s.rows.push({ url, host, from_mode: String(payload.fallback_from || '').trim(), to_mode: String(payload.fallback_to || '').trim(), reason: String(payload.fallback_reason || '').trim(), attempt: toInt(payload.attempt, 0), result: 'succeeded', elapsed_ms: toInt(payload.elapsed_ms, 0), ts });
          if (host) { if (!s.hostData[host]) s.hostData[host] = { started: 0, succeeded: 0, exhausted: 0, blocked: 0, modes: new Set() }; s.hostData[host].started += 1; s.hostData[host].succeeded += 1; }
        }
      },
      finalize(s) {
        s.rows.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
        const host_profiles = Object.entries(s.hostData).map(([host, d]) => {
          const total = d.started || (d.succeeded + d.exhausted);
          return { host, fallback_total: total, success_count: d.succeeded, success_rate: total > 0 ? Math.round((d.succeeded / total) * 1000) / 1000 : 0, exhaustion_count: d.exhausted, blocked_count: d.blocked, modes_used: Array.from(d.modes).sort() };
        });
        return { events: s.rows.slice(0, 500), host_profiles };
      },
    },

    // ── Queue State ──
    {
      key: 'queue',
      eventTypes: ['repair_query_enqueued', 'url_cooldown_applied', 'blocked_domain_cooldown_applied'],
      create() { return { jobMap: {}, blocked: [] }; },
      handle(type, payload, evt, s) {
        const ts = String(evt?.ts || '').trim();
        if (type === 'repair_query_enqueued') {
          const id = String(payload.dedupe_key || '').trim() || `job-${Object.keys(s.jobMap).length + 1}`;
          const url = String(payload.url || '').trim();
          s.jobMap[id] = { id, lane: String(payload.lane || 'repair_search').trim(), status: 'queued', host: extractHost(url), url, query: payload.query != null ? String(payload.query) : null, reason: String(payload.reason || '').trim(), field_targets: Array.isArray(payload.field_targets) ? payload.field_targets.map(String) : [], cooldown_until: null, created_at: ts, transitions: [] };
        } else if (type === 'url_cooldown_applied') {
          const id = String(payload.dedupe_key || '').trim();
          if (id && s.jobMap[id]) {
            const job = s.jobMap[id];
            const newStatus = String(payload.status || '').trim() || 'cooldown';
            job.transitions.push({ from_status: job.status, to_status: newStatus, ts, reason: String(payload.reason || '').trim() });
            job.status = newStatus;
            if (payload.cooldown_until) job.cooldown_until = String(payload.cooldown_until);
          }
        } else if (type === 'blocked_domain_cooldown_applied') {
          s.blocked.push({ host: String(payload.host || '').trim(), blocked_count: toInt(payload.blocked_count, 0), threshold: toInt(payload.threshold, 0), removed_count: toInt(payload.removed_count, 0), ts });
        }
      },
      finalize(s) {
        const jobs = Object.values(s.jobMap).slice(0, 500);
        const laneCounts = {};
        for (const job of Object.values(s.jobMap)) {
          if (!laneCounts[job.lane]) laneCounts[job.lane] = { queued: 0, running: 0, done: 0, failed: 0, cooldown: 0 };
          const counts = laneCounts[job.lane];
          if (counts[job.status] != null) counts[job.status] += 1; else counts.queued += 1;
        }
        const lane_summary = Object.entries(laneCounts).map(([lane, counts]) => ({ lane, ...counts }));
        return { jobs, lane_summary, blocked_hosts: s.blocked };
      },
    },

    // ── Complex builders: call standalone functions (workers, prefetch, fetch, extraction) ──
    // WHY: These builders have complex internal state (pre-passes, 2-pass loops,
    // 391+ line functions) that are not yet decomposed into handler tables.
    // They run as standalone calls against the full events array.
    // Future optimization: extract their handler tables for true single-pass.
    { key: 'prefetch', standalone: true },
    { key: 'fetch', standalone: true },
    { key: 'extraction_plugins', standalone: true },
    { key: 'workers', standalone: true },
  ];
}

// ── Engine ───────────────────────────────────────────────────────────────────

export function processEventsToPanel({ events: rawEvents, meta: rawMeta, artifacts: rawArtifacts, config, sourcePackets } = {}) {
  const events = Array.isArray(rawEvents) ? rawEvents : [];
  const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
  const artifacts = rawArtifacts && typeof rawArtifacts === 'object' ? rawArtifacts : {};
  const ctx = { events, meta, artifacts, config, sourcePackets };

  const registry = createRegistry();
  const accumulators = [];
  const standaloneEntries = [];

  for (const entry of registry) {
    if (entry.standalone) {
      standaloneEntries.push(entry);
    } else {
      accumulators.push({ ...entry, state: entry.create(ctx) });
    }
  }

  // Build routing table: Map<eventType, accumulator[]>
  const routeMap = new Map();
  for (const acc of accumulators) {
    for (const type of acc.eventTypes) {
      if (!routeMap.has(type)) routeMap.set(type, []);
      routeMap.get(type).push(acc);
    }
  }

  // Single pass
  for (const evt of events) {
    const type = eventType(evt);
    const targets = routeMap.get(type);
    if (!targets) continue;
    const payload = payloadOf(evt);
    for (const acc of targets) {
      acc.handle(type, payload, evt, acc.state);
    }
  }

  // Finalize engine-driven panels
  const panels = { panel_version: 1, built_at: new Date().toISOString() };
  for (const acc of accumulators) {
    try { panels[acc.key] = acc.finalize(acc.state, ctx); }
    catch { panels[acc.key] = null; }
  }

  // Run standalone builders
  try { panels.prefetch = buildPreFetchPhases(events, meta, artifacts); }
  catch { panels.prefetch = null; }

  try { panels.fetch = buildFetchPhases(events); }
  catch { panels.fetch = null; }

  try { panels.extraction_plugins = buildExtractionPluginPhases(events); }
  catch { panels.extraction_plugins = null; }

  let workers = null;
  try {
    const workerOpts = {};
    if (sourcePackets) workerOpts.sourceIndexingPacketCollection = sourcePackets;
    if (config?.crawleeRequestHandlerTimeoutSecs) {
      workerOpts.crawleeRequestHandlerTimeoutSecs = config.crawleeRequestHandlerTimeoutSecs;
    }
    workers = buildRuntimeOpsWorkers(events, workerOpts);
    panels.workers = workers;
  }
  catch { panels.workers = null; }

  try { panels.llm_dashboard = buildLlmCallsDashboard(events, { preBuiltWorkers: workers }); }
  catch { panels.llm_dashboard = null; }

  return panels;
}
