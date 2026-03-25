import {
  toInt, toFloat, parseTsMs,
  extractUrl, extractHost,
  eventType, payloadOf,
  fetchStatusCode, sourceProcessedParseMethod, parseFinishedMethod,
  buildScreenshotRecord,
} from './runtimeOpsEventPrimitives.js';
export { buildPreFetchPhases } from './runtimeOpsPreFetchBuilders.js';
export { buildFetchPhases } from './runtimeOpsFetchBuilders.js';
export { buildExtractionFields } from './runtimeOpsExtractionFieldBuilders.js';
export { buildRuntimeOpsWorkers } from './runtimeOpsWorkerPoolBuilders.js';
export { buildWorkerDetail } from './runtimeOpsWorkerDetailBuilders.js';
export { buildLlmCallsDashboard } from './runtimeOpsLlmDashboardBuilders.js';

const SUMMARY_HANDLERS = {
  fetch_started: (payload, _evt, s) => { s.fetchStarted += 1; },
  fetch_finished: (payload, evt, s) => {
    s.fetchFinished += 1;
    const code = fetchStatusCode(payload, 0);
    if (code >= 400 || code === 0) {
      s.fetchErrors += 1;
      const host = extractHost(extractUrl(evt));
      if (host) {
        s.hostErrors[host] = (s.hostErrors[host] || 0) + 1;
      }
    }
  },
  parse_started: (payload, _evt, s) => { s.parseStarted += 1; },
  parse_finished: (payload, _evt, s) => { s.parseFinished += 1; },
  llm_started: (payload, _evt, s) => { s.llmStarted += 1; },
  llm_finished: (payload, _evt, s) => {
    s.llmFinished += 1;
    s.llmFieldsExtracted += toInt(payload.fields_extracted || payload.candidates, 0);
  },
  index_finished: (payload, _evt, s) => {
    s.indexedFieldsExtracted += toInt(payload.count, 0);
  },
};

// WHY: scope-filtered types skip stage-lifecycle markers before dispatch
const SUMMARY_SCOPE_FILTERED = new Set([
  'fetch_started', 'fetch_finished', 'parse_started', 'parse_finished',
]);

export function buildRuntimeOpsSummary(events, meta) {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  const status = String(safeMeta.status || '').trim() || 'unknown';
  const round = toInt(safeMeta.round, 0);

  const s = {
    fetchStarted: 0, fetchFinished: 0, fetchErrors: 0,
    parseStarted: 0, parseFinished: 0,
    llmStarted: 0, llmFinished: 0, llmFieldsExtracted: 0,
    indexedFieldsExtracted: 0, hostErrors: {},
  };

  for (const evt of events) {
    const type = eventType(evt);
    const handler = SUMMARY_HANDLERS[type];
    if (!handler) continue;
    const payload = payloadOf(evt);
    if (SUMMARY_SCOPE_FILTERED.has(type)) {
      const scope = String(payload.scope || '').trim().toLowerCase();
      if (scope === 'stage') continue;
    }
    handler(payload, evt, s);
  }

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

  return {
    status,
    round,
    phase_cursor: String(safeMeta.phase_cursor || '').trim(),
    boot_step: String(safeMeta.boot_step || '').trim(),
    boot_progress: Math.max(0, Math.min(100, Number(safeMeta.boot_progress) || 0)),
    total_fetches: totalFetches,
    total_parses: s.parseFinished,
    total_llm_calls: s.llmFinished,
    error_rate: Math.round(errorRate * 1000) / 1000,
    docs_per_min: Math.round(docsPerMin * 100) / 100,
    fields_per_min: Math.round(fieldsPerMin * 100) / 100,
    top_blockers: topBlockers,
  };
}

const DOCUMENT_HANDLERS = {
  fetch_started: (_payload, doc) => { doc.status = 'fetching'; },
  fetch_finished: (payload, doc) => {
    const code = fetchStatusCode(payload, 0);
    doc.status = code >= 200 && code < 400 ? 'fetched' : 'fetch_error';
    doc.status_code = code || null;
    doc.bytes = toInt(payload.bytes, null);
    doc.content_type = String(payload.content_type || '').trim() || null;
  },
  parse_started: (_payload, doc) => { doc.status = 'parsing'; },
  parse_finished: (payload, doc) => {
    doc.status = 'parsed';
    doc.parse_method = parseFinishedMethod(payload) || doc.parse_method;
  },
  source_processed: (payload, doc) => {
    doc.status = 'parsed';
    doc.status_code = fetchStatusCode(payload, doc.status_code);
    doc.bytes = toInt(payload.bytes, doc.bytes);
    doc.content_type = String(payload.content_type || '').trim() || doc.content_type;
    doc.content_hash = String(payload.content_hash || '').trim().slice(0, 8) || doc.content_hash;
    doc.parse_method = sourceProcessedParseMethod(payload) || doc.parse_method;
  },
  index_started: (_payload, doc) => { doc.status = 'indexing'; },
  index_finished: (payload, doc) => {
    doc.status = 'indexed';
    doc.content_hash = String(payload.content_hash || '').trim().slice(0, 8) || null;
    doc.dedupe_outcome = String(payload.dedupe_outcome || '').trim() || null;
  },
  source_fetch_skipped: (_payload, doc) => { doc.status = 'skipped'; },
};

export function buildRuntimeOpsDocuments(events, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const limit = toInt(opts.limit, 500);
  const docs = {};

  for (const evt of events) {
    const type = eventType(evt);
    const url = extractUrl(evt);
    if (!url) continue;

    const payload = payloadOf(evt);
    const ts = String(evt?.ts || '').trim();

    if (!docs[url]) {
      docs[url] = {
        url,
        host: extractHost(url),
        status: 'discovered',
        status_code: null,
        bytes: null,
        content_type: null,
        content_hash: null,
        dedupe_outcome: null,
        parse_method: null,
        last_event_ts: ts,
      };
    }

    const doc = docs[url];
    if (ts > doc.last_event_ts) {
      doc.last_event_ts = ts;
    }

    const docHandler = DOCUMENT_HANDLERS[type];
    if (docHandler) docHandler(payload, doc);
  }

  return Object.values(docs)
    .sort((a, b) => (b.last_event_ts || '').localeCompare(a.last_event_ts || ''))
    .slice(0, Math.max(1, limit));
}

const DETAIL_HANDLERS = {
  fetch_started: (_payload, entry) => {
    entry.stage = 'fetch';
    entry.status = 'started';
  },
  fetch_finished: (payload, entry, d) => {
    entry.stage = 'fetch';
    entry.status = 'finished';
    d.statusCode = fetchStatusCode(payload, null);
    d.bytes = toInt(payload.bytes, null);
    entry.status_code = d.statusCode;
    entry.duration_ms = toInt(payload.duration_ms, null);
  },
  parse_started: (_payload, entry) => {
    entry.stage = 'parse';
    entry.status = 'started';
  },
  parse_finished: (payload, entry, d) => {
    entry.stage = 'parse';
    entry.status = 'finished';
    d.parseMethod = parseFinishedMethod(payload) || d.parseMethod;
    d.candidates = toInt(payload.candidate_count ?? payload.candidates, null);
    entry.parse_method = d.parseMethod;
  },
  source_processed: (payload, entry, d) => {
    entry.stage = 'parse';
    entry.status = 'processed';
    d.statusCode = fetchStatusCode(payload, d.statusCode);
    d.bytes = toInt(payload.bytes, d.bytes);
    d.parseMethod = sourceProcessedParseMethod(payload) || d.parseMethod;
    d.candidates = toInt(payload.candidate_count ?? payload.candidates, d.candidates);
    entry.status_code = d.statusCode;
    entry.bytes = d.bytes;
    entry.parse_method = d.parseMethod;
    entry.candidate_count = d.candidates;
  },
  index_started: (_payload, entry) => {
    entry.stage = 'index';
    entry.status = 'started';
  },
  index_finished: (payload, entry, d) => {
    entry.stage = 'index';
    entry.status = 'finished';
    d.evidenceChunks = toInt(payload.evidence_chunks, null);
    entry.evidence_chunks = d.evidenceChunks;
  },
};

export function buildRuntimeOpsDocumentDetail(events, docUrl) {
  const targetUrl = String(docUrl || '').trim();
  if (!targetUrl) return null;

  const timeline = [];
  const detail = {
    statusCode: null, bytes: null, parseMethod: null,
    candidates: null, evidenceChunks: null,
  };

  let found = false;

  for (const evt of events) {
    const url = extractUrl(evt);
    if (url !== targetUrl) continue;

    found = true;
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const ts = String(evt?.ts || '').trim();

    const entry = { event: type, ts };
    const detailHandler = DETAIL_HANDLERS[type];
    if (detailHandler) {
      detailHandler(payload, entry, detail);
    } else {
      entry.stage = type;
      entry.status = 'event';
    }

    timeline.push(entry);
  }

  if (!found) return null;

  return {
    url: targetUrl,
    host: extractHost(targetUrl),
    timeline,
    status_code: detail.statusCode,
    bytes: detail.bytes,
    parse_method: detail.parseMethod,
    candidates: detail.candidates,
    evidence_chunks: detail.evidenceChunks,
  };
}

const METRICS_HANDLERS = {
  search_started: (payload, url, ms) => {
    ms.activeSearch.add(String(payload.query || url || '').trim());
  },
  search_finished: (payload, url, ms) => {
    ms.activeSearch.delete(String(payload.query || url || '').trim());
    ms.pools.search.completed += 1;
  },
  fetch_started: (payload, url, ms) => {
    ms.activeFetch.add(url || String(payload.worker_id || ''));
  },
  fetch_finished: (payload, url, ms) => {
    const key = url || String(payload.worker_id || '');
    ms.activeFetch.delete(key);
    const code = fetchStatusCode(payload, 0);
    ms.totalFetches += 1;
    if (code >= 400 || code === 0) {
      ms.pools.fetch.failed += 1;
      if (code === 403 || code === 451) {
        ms.blockedHosts.add(extractHost(url));
      }
    }
    ms.pools.fetch.completed += 1;
    if (payload.fallback) ms.fallbackCount += 1;
    ms.retryTotal += toInt(payload.retries, 0);
  },
  scheduler_fallback_started: (_payload, _url, ms) => {
    ms.fallbackCount += 1;
  },
  parse_started: (_payload, url, ms) => {
    ms.activeParse.add(url);
  },
  parse_finished: (_payload, url, ms) => {
    ms.activeParse.delete(url);
    ms.pools.parse.completed += 1;
  },
  llm_started: (payload, _url, ms) => {
    ms.activeLlm.add(String(payload.batch_id || '').trim());
  },
  llm_finished: (payload, _url, ms) => {
    ms.activeLlm.delete(String(payload.batch_id || '').trim());
    ms.pools.llm.completed += 1;
  },
  llm_failed: (payload, _url, ms) => {
    ms.activeLlm.delete(String(payload.batch_id || '').trim());
    ms.pools.llm.failed += 1;
  },
  needset_computed: (payload, _url, ms) => {
    ms.identityStatus = String(payload.identity?.state || payload.identity_status || '').trim()
      || 'unlocked';
    ms.acceptanceRate = toFloat(payload.acceptance_rate, 0);
    ms.meanConfidence = toFloat(payload.mean_confidence, 0);
  },
};

export function buildRuntimeOpsMetricsRail(events, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const nowMs = toInt(opts.nowMs, Date.now());

  const pools = {
    search: { active: 0, queued: 0, completed: 0, failed: 0 },
    fetch: { active: 0, queued: 0, completed: 0, failed: 0 },
    parse: { active: 0, queued: 0, completed: 0, failed: 0 },
    llm: { active: 0, queued: 0, completed: 0, failed: 0 },
  };

  const activeSearch = new Set();
  const activeFetch = new Set();
  const activeParse = new Set();
  const activeLlm = new Set();

  let identityStatus = 'unknown';
  let acceptanceRate = 0;
  let meanConfidence = 0;

  let totalFetches = 0;
  let fallbackCount = 0;
  let blockedHosts = new Set();
  let retryTotal = 0;

  const ms = {
    pools, activeSearch, activeFetch, activeParse, activeLlm,
    identityStatus, acceptanceRate, meanConfidence,
    totalFetches, fallbackCount, blockedHosts, retryTotal,
  };

  for (const evt of events) {
    const type = eventType(evt);
    const handler = METRICS_HANDLERS[type];
    if (!handler) continue;
    handler(payloadOf(evt), extractUrl(evt), ms);
  }

  ms.pools.search.active = ms.activeSearch.size;
  ms.pools.fetch.active = ms.activeFetch.size;
  ms.pools.parse.active = ms.activeParse.size;
  ms.pools.llm.active = ms.activeLlm.size;

  const fallbackRate = ms.totalFetches > 0 ? Math.round((ms.fallbackCount / ms.totalFetches) * 1000) / 1000 : 0;

  return {
    pool_metrics: ms.pools,
    quality_metrics: {
      identity_status: ms.identityStatus,
      acceptance_rate: ms.acceptanceRate,
      mean_confidence: ms.meanConfidence,
    },
    failure_metrics: {
      total_fetches: ms.totalFetches,
      fallback_count: ms.fallbackCount,
      fallback_rate: fallbackRate,
      blocked_hosts: ms.blockedHosts.size,
      retry_total: ms.retryTotal,
      no_progress_streak: 0,
    },
  };
}

export function buildFallbackEvents(events, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const limit = toInt(opts.limit, 500);

  const rows = [];
  const hostData = {};

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const ts = String(evt?.ts || '').trim();

    if (type === 'scheduler_fallback_started') {
      const url = String(payload.url || '').trim();
      const host = extractHost(url);
      const fromMode = String(payload.from_mode || '').trim();
      const toMode = String(payload.to_mode || '').trim();

      rows.push({
        url,
        host,
        from_mode: fromMode,
        to_mode: toMode,
        reason: String(payload.reason || '').trim(),
        attempt: toInt(payload.attempt, 0),
        result: 'pending',
        elapsed_ms: 0,
        ts,
      });

      if (host) {
        if (!hostData[host]) hostData[host] = { started: 0, succeeded: 0, exhausted: 0, blocked: 0, modes: new Set() };
        hostData[host].started += 1;
        if (fromMode) hostData[host].modes.add(fromMode);
        if (toMode) hostData[host].modes.add(toMode);
      }
    } else if (type === 'scheduler_fallback_succeeded') {
      const url = String(payload.url || '').trim();
      const host = extractHost(url);

      rows.push({
        url,
        host,
        from_mode: String(payload.from_mode || '').trim(),
        to_mode: String(payload.to_mode || '').trim(),
        reason: String(payload.reason || '').trim(),
        attempt: toInt(payload.attempt, 0),
        result: 'succeeded',
        elapsed_ms: toInt(payload.elapsed_ms, 0),
        ts,
      });

      if (host) {
        if (!hostData[host]) hostData[host] = { started: 0, succeeded: 0, exhausted: 0, blocked: 0, modes: new Set() };
        hostData[host].succeeded += 1;
      }
    } else if (type === 'scheduler_fallback_exhausted') {
      const url = String(payload.url || '').trim();
      const host = extractHost(url);

      rows.push({
        url,
        host,
        from_mode: String(payload.from_mode || '').trim(),
        to_mode: String(payload.to_mode || '').trim(),
        reason: String(payload.reason || '').trim(),
        attempt: toInt(payload.attempt, 0),
        result: 'exhausted',
        elapsed_ms: toInt(payload.elapsed_ms, 0),
        ts,
      });

      if (host) {
        if (!hostData[host]) hostData[host] = { started: 0, succeeded: 0, exhausted: 0, blocked: 0, modes: new Set() };
        hostData[host].exhausted += 1;
      }
    } else if (type === 'fetch_finished' && payload.fallback) {
      const url = String(payload.url || '').trim();
      const host = extractHost(url);

      rows.push({
        url,
        host,
        from_mode: String(payload.fallback_from || '').trim(),
        to_mode: String(payload.fallback_to || '').trim(),
        reason: String(payload.fallback_reason || '').trim(),
        attempt: toInt(payload.attempt, 0),
        result: 'succeeded',
        elapsed_ms: toInt(payload.elapsed_ms, 0),
        ts,
      });

      if (host) {
        if (!hostData[host]) hostData[host] = { started: 0, succeeded: 0, exhausted: 0, blocked: 0, modes: new Set() };
        hostData[host].started += 1;
        hostData[host].succeeded += 1;
      }
    }
  }

  rows.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

  const host_profiles = Object.entries(hostData).map(([host, d]) => {
    const total = d.started || (d.succeeded + d.exhausted);
    return {
      host,
      fallback_total: total,
      success_count: d.succeeded,
      success_rate: total > 0 ? Math.round((d.succeeded / total) * 1000) / 1000 : 0,
      exhaustion_count: d.exhausted,
      blocked_count: d.blocked,
      modes_used: Array.from(d.modes).sort(),
    };
  });

  return {
    events: rows.slice(0, Math.max(1, limit)),
    host_profiles,
  };
}

export function buildQueueState(events, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const limit = toInt(opts.limit, 500);

  const jobMap = {};
  const blocked = [];

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const ts = String(evt?.ts || '').trim();

    if (type === 'repair_query_enqueued') {
      const id = String(payload.dedupe_key || '').trim() || `job-${Object.keys(jobMap).length + 1}`;
      const url = String(payload.url || '').trim();
      jobMap[id] = {
        id,
        lane: String(payload.lane || 'repair_search').trim(),
        status: 'queued',
        host: extractHost(url),
        url,
        query: payload.query != null ? String(payload.query) : null,
        reason: String(payload.reason || '').trim(),
        field_targets: Array.isArray(payload.field_targets) ? payload.field_targets.map(String) : [],
        cooldown_until: null,
        created_at: ts,
        transitions: [],
      };
    } else if (type === 'url_cooldown_applied') {
      const id = String(payload.dedupe_key || '').trim();
      if (id && jobMap[id]) {
        const job = jobMap[id];
        const newStatus = String(payload.status || '').trim() || 'cooldown';
        job.transitions.push({
          from_status: job.status,
          to_status: newStatus,
          ts,
          reason: String(payload.reason || '').trim(),
        });
        job.status = newStatus;
        if (payload.cooldown_until) {
          job.cooldown_until = String(payload.cooldown_until);
        }
      }
    } else if (type === 'blocked_domain_cooldown_applied') {
      blocked.push({
        host: String(payload.host || '').trim(),
        blocked_count: toInt(payload.blocked_count, 0),
        threshold: toInt(payload.threshold, 0),
        removed_count: toInt(payload.removed_count, 0),
        ts,
      });
    }
  }

  const jobs = Object.values(jobMap).slice(0, Math.max(1, limit));

  const laneCounts = {};
  for (const job of Object.values(jobMap)) {
    if (!laneCounts[job.lane]) {
      laneCounts[job.lane] = { queued: 0, running: 0, done: 0, failed: 0, cooldown: 0 };
    }
    const counts = laneCounts[job.lane];
    if (counts[job.status] != null) {
      counts[job.status] += 1;
    } else {
      counts.queued += 1;
    }
  }

  const lane_summary = Object.entries(laneCounts).map(([lane, counts]) => ({
    lane,
    ...counts,
  }));

  return { jobs, lane_summary, blocked_hosts: blocked };
}

const PIPELINE_STAGES = ['search', 'fetch', 'parse', 'index', 'llm'];

export function buildPipelineFlow(events) {
  const stageData = {};
  for (const name of PIPELINE_STAGES) {
    stageData[name] = { name, active: 0, completed: 0, failed: 0, activeKeys: new Set() };
  }

  const recentTransitions = [];
  const urlStages = {};

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    if (payload.scope === 'stage') continue;

    const url = extractUrl(evt) || String(payload.query || payload.batch_id || '').trim();

    if (type === 'search_started') {
      stageData.search.activeKeys.add(url);
    } else if (type === 'search_finished') {
      stageData.search.activeKeys.delete(url);
      stageData.search.completed += 1;
      if (url) urlStages[url] = 'search';
    } else if (type === 'fetch_started') {
      stageData.fetch.activeKeys.add(url);
    } else if (type === 'fetch_finished') {
      stageData.fetch.activeKeys.delete(url);
      const code = fetchStatusCode(payload, 0);
      if (code >= 400 || code === 0) stageData.fetch.failed += 1;
      else stageData.fetch.completed += 1;
      const prev = urlStages[url];
      urlStages[url] = 'fetch';
      if (prev && prev !== 'fetch') {
        recentTransitions.push({ url, from_stage: prev, to_stage: 'fetch', ts: String(evt?.ts || '').trim() });
      }
    } else if (type === 'parse_started') {
      stageData.parse.activeKeys.add(url);
    } else if (type === 'parse_finished') {
      stageData.parse.activeKeys.delete(url);
      stageData.parse.completed += 1;
      const prev = urlStages[url];
      urlStages[url] = 'parse';
      if (prev && prev !== 'parse') {
        recentTransitions.push({ url, from_stage: prev, to_stage: 'parse', ts: String(evt?.ts || '').trim() });
      }
    } else if (type === 'index_started') {
      stageData.index.activeKeys.add(url);
    } else if (type === 'index_finished') {
      stageData.index.activeKeys.delete(url);
      stageData.index.completed += 1;
      const prev = urlStages[url];
      urlStages[url] = 'index';
      if (prev && prev !== 'index') {
        recentTransitions.push({ url, from_stage: prev, to_stage: 'index', ts: String(evt?.ts || '').trim() });
      }
    } else if (type === 'llm_started') {
      const key = String(payload.batch_id || '').trim() || url;
      stageData.llm.activeKeys.add(key);
    } else if (type === 'llm_finished') {
      const key = String(payload.batch_id || '').trim() || url;
      stageData.llm.activeKeys.delete(key);
      stageData.llm.completed += 1;
    } else if (type === 'llm_failed') {
      const key = String(payload.batch_id || '').trim() || url;
      stageData.llm.activeKeys.delete(key);
      stageData.llm.failed += 1;
    }
  }

  for (const name of PIPELINE_STAGES) {
    stageData[name].active = stageData[name].activeKeys.size;
    delete stageData[name].activeKeys;
  }

  return {
    stages: PIPELINE_STAGES.map((name) => stageData[name]),
    recent_transitions: recentTransitions.slice(-20),
  };
}

export function buildWorkerScreenshots(events, workerId, options = {}) {
  const targetId = String(workerId || '').trim();
  const screenshots = [];
  const seenScreenshots = new Set();

  for (const evt of events) {
    const type = eventType(evt);
    if (type !== 'visual_asset_captured' && type !== 'parse_finished') continue;

    const payload = payloadOf(evt);
    const evtWorkerId = String(payload.worker_id || '').trim();
    if (evtWorkerId !== targetId) continue;

    const record = buildScreenshotRecord(
      evt,
      payload,
      type === 'parse_finished' ? 'parse_finished' : 'visual_asset_captured',
      options,
    );
    if (!record) continue;
    const dedupeKey = `${record.filename}|${record.url}`;
    if (seenScreenshots.has(dedupeKey)) continue;
    seenScreenshots.add(dedupeKey);
    screenshots.push(record);
  }

  return screenshots;
}
