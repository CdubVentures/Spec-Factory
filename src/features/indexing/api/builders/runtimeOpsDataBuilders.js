import {
  toInt, toFloat, parseTsMs,
  extractUrl, extractHost,
  eventType, payloadOf,
  fetchStatusCode, sourceProcessedParseMethod, parseFinishedMethod,
  buildScreenshotRecord,
} from './runtimeOpsEventPrimitives.js';
export { buildPreFetchPhases } from './runtimeOpsPreFetchBuilders.js';
export { buildExtractionFields } from './runtimeOpsExtractionFieldBuilders.js';
export { buildRuntimeOpsWorkers } from './runtimeOpsWorkerPoolBuilders.js';
export { buildWorkerDetail } from './runtimeOpsWorkerDetailBuilders.js';
export { buildLlmCallsDashboard } from './runtimeOpsLlmDashboardBuilders.js';

export function buildRuntimeOpsSummary(events, meta) {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  const status = String(safeMeta.status || '').trim() || 'unknown';
  const round = toInt(safeMeta.round, 0);

  let fetchStarted = 0;
  let fetchFinished = 0;
  let fetchErrors = 0;
  let parseStarted = 0;
  let parseFinished = 0;
  let llmStarted = 0;
  let llmFinished = 0;
  let llmFieldsExtracted = 0;
  let indexedFieldsExtracted = 0;
  const hostErrors = {};

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const scope = String(payload.scope || '').trim().toLowerCase();

    if (type === 'fetch_started') {
      if (scope === 'stage') continue;
      fetchStarted += 1;
    } else if (type === 'fetch_finished') {
      if (scope === 'stage') continue;
      fetchFinished += 1;
      const code = fetchStatusCode(payload, 0);
      if (code >= 400 || code === 0) {
        fetchErrors += 1;
        const host = extractHost(extractUrl(evt));
        if (host) {
          hostErrors[host] = (hostErrors[host] || 0) + 1;
        }
      }
    } else if (type === 'parse_started') {
      if (scope === 'stage') continue;
      parseStarted += 1;
    } else if (type === 'parse_finished') {
      if (scope === 'stage') continue;
      parseFinished += 1;
    } else if (type === 'llm_started') {
      llmStarted += 1;
    } else if (type === 'llm_finished') {
      llmFinished += 1;
      llmFieldsExtracted += toInt(payload.fields_extracted || payload.candidates, 0);
    } else if (type === 'index_finished') {
      indexedFieldsExtracted += toInt(payload.count, 0);
    }
  }

  const totalFetches = fetchFinished || fetchStarted;
  const errorRate = totalFetches > 0 ? fetchErrors / totalFetches : 0;

  const startedMs = parseTsMs(safeMeta.started_at);
  const endedMs = parseTsMs(safeMeta.ended_at);
  const elapsedMinutes = startedMs > 0
    ? ((endedMs > startedMs ? endedMs : Date.now()) - startedMs) / 60_000
    : 0;
  const docsPerMin = elapsedMinutes > 0 ? parseFinished / elapsedMinutes : 0;
  const countedFields = indexedFieldsExtracted > 0 ? indexedFieldsExtracted : llmFieldsExtracted;
  const fieldsPerMin = elapsedMinutes > 0 ? countedFields / elapsedMinutes : 0;

  const topBlockers = Object.entries(hostErrors)
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
    total_parses: parseFinished,
    total_llm_calls: llmFinished,
    error_rate: Math.round(errorRate * 1000) / 1000,
    docs_per_min: Math.round(docsPerMin * 100) / 100,
    fields_per_min: Math.round(fieldsPerMin * 100) / 100,
    top_blockers: topBlockers,
  };
}

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

    if (type === 'fetch_started') {
      doc.status = 'fetching';
    } else if (type === 'fetch_finished') {
      const code = fetchStatusCode(payload, 0);
      doc.status = code >= 200 && code < 400 ? 'fetched' : 'fetch_error';
      doc.status_code = code || null;
      doc.bytes = toInt(payload.bytes, null);
      doc.content_type = String(payload.content_type || '').trim() || null;
    } else if (type === 'parse_started') {
      doc.status = 'parsing';
    } else if (type === 'parse_finished') {
      doc.status = 'parsed';
      doc.parse_method = parseFinishedMethod(payload) || doc.parse_method;
    } else if (type === 'source_processed') {
      doc.status = 'parsed';
      doc.status_code = fetchStatusCode(payload, doc.status_code);
      doc.bytes = toInt(payload.bytes, doc.bytes);
      doc.content_type = String(payload.content_type || '').trim() || doc.content_type;
      doc.content_hash = String(payload.content_hash || '').trim().slice(0, 8) || doc.content_hash;
      doc.parse_method = sourceProcessedParseMethod(payload) || doc.parse_method;
    } else if (type === 'index_started') {
      doc.status = 'indexing';
    } else if (type === 'index_finished') {
      doc.status = 'indexed';
      doc.content_hash = String(payload.content_hash || '').trim().slice(0, 8) || null;
      doc.dedupe_outcome = String(payload.dedupe_outcome || '').trim() || null;
    } else if (type === 'source_fetch_skipped') {
      doc.status = 'skipped';
    }
  }

  return Object.values(docs)
    .sort((a, b) => (b.last_event_ts || '').localeCompare(a.last_event_ts || ''))
    .slice(0, Math.max(1, limit));
}

export function buildRuntimeOpsDocumentDetail(events, docUrl) {
  const targetUrl = String(docUrl || '').trim();
  if (!targetUrl) return null;

  const timeline = [];
  let statusCode = null;
  let bytes = null;
  let parseMethod = null;
  let candidates = null;
  let evidenceChunks = null;

  let found = false;

  for (const evt of events) {
    const url = extractUrl(evt);
    if (url !== targetUrl) continue;

    found = true;
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const ts = String(evt?.ts || '').trim();

    const entry = { event: type, ts };

    if (type === 'fetch_started') {
      entry.stage = 'fetch';
      entry.status = 'started';
    } else if (type === 'fetch_finished') {
      entry.stage = 'fetch';
      entry.status = 'finished';
      statusCode = fetchStatusCode(payload, null);
      bytes = toInt(payload.bytes, null);
      entry.status_code = statusCode;
      entry.duration_ms = toInt(payload.duration_ms, null);
    } else if (type === 'parse_started') {
      entry.stage = 'parse';
      entry.status = 'started';
    } else if (type === 'parse_finished') {
      entry.stage = 'parse';
      entry.status = 'finished';
      parseMethod = parseFinishedMethod(payload) || parseMethod;
      candidates = toInt(payload.candidate_count ?? payload.candidates, null);
      entry.parse_method = parseMethod;
    } else if (type === 'source_processed') {
      entry.stage = 'parse';
      entry.status = 'processed';
      statusCode = fetchStatusCode(payload, statusCode);
      bytes = toInt(payload.bytes, bytes);
      parseMethod = sourceProcessedParseMethod(payload) || parseMethod;
      candidates = toInt(payload.candidate_count ?? payload.candidates, candidates);
      entry.status_code = statusCode;
      entry.bytes = bytes;
      entry.parse_method = parseMethod;
      entry.candidate_count = candidates;
    } else if (type === 'index_started') {
      entry.stage = 'index';
      entry.status = 'started';
    } else if (type === 'index_finished') {
      entry.stage = 'index';
      entry.status = 'finished';
      evidenceChunks = toInt(payload.evidence_chunks, null);
      entry.evidence_chunks = evidenceChunks;
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
    status_code: statusCode,
    bytes,
    parse_method: parseMethod,
    candidates,
    evidence_chunks: evidenceChunks,
  };
}

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

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const url = extractUrl(evt);

    if (type === 'search_started') {
      const key = String(payload.query || url || '').trim();
      activeSearch.add(key);
    } else if (type === 'search_finished') {
      const key = String(payload.query || url || '').trim();
      activeSearch.delete(key);
      pools.search.completed += 1;
    } else if (type === 'fetch_started') {
      activeFetch.add(url || String(payload.worker_id || ''));
    } else if (type === 'fetch_finished') {
      const key = url || String(payload.worker_id || '');
      activeFetch.delete(key);
      const code = fetchStatusCode(payload, 0);
      totalFetches += 1;
      if (code >= 400 || code === 0) {
        pools.fetch.failed += 1;
        if (code === 403 || code === 451) {
          blockedHosts.add(extractHost(url));
        }
      }
      pools.fetch.completed += 1;
      if (payload.fallback) {
        fallbackCount += 1;
      }
      retryTotal += toInt(payload.retries, 0);
    } else if (type === 'scheduler_fallback_started') {
      fallbackCount += 1;
    } else if (type === 'parse_started') {
      activeParse.add(url);
    } else if (type === 'parse_finished') {
      activeParse.delete(url);
      pools.parse.completed += 1;
    } else if (type === 'llm_started') {
      const key = String(payload.batch_id || '').trim();
      activeLlm.add(key);
    } else if (type === 'llm_finished') {
      const key = String(payload.batch_id || '').trim();
      activeLlm.delete(key);
      pools.llm.completed += 1;
    } else if (type === 'llm_failed') {
      const key = String(payload.batch_id || '').trim();
      activeLlm.delete(key);
      pools.llm.failed += 1;
    } else if (type === 'needset_computed') {
      identityStatus = String(payload.identity?.state || payload.identity_status || '').trim()
        || 'unlocked';
      acceptanceRate = toFloat(payload.acceptance_rate, 0);
      meanConfidence = toFloat(payload.mean_confidence, 0);
    }
  }

  pools.search.active = activeSearch.size;
  pools.fetch.active = activeFetch.size;
  pools.parse.active = activeParse.size;
  pools.llm.active = activeLlm.size;

  const fallbackRate = totalFetches > 0 ? Math.round((fallbackCount / totalFetches) * 1000) / 1000 : 0;

  return {
    pool_metrics: pools,
    quality_metrics: {
      identity_status: identityStatus,
      acceptance_rate: acceptanceRate,
      mean_confidence: meanConfidence,
    },
    failure_metrics: {
      total_fetches: totalFetches,
      fallback_count: fallbackCount,
      fallback_rate: fallbackRate,
      blocked_hosts: blockedHosts.size,
      retry_total: retryTotal,
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
