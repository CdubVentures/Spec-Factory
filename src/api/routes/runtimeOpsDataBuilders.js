function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTsMs(value) {
  if (!value) return 0;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

function extractUrl(event) {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  return String(payload.url || event?.url || '').trim();
}

function extractHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function eventType(event) {
  return String(event?.event || '').trim();
}

function payloadOf(event) {
  const p = event?.payload;
  return p && typeof p === 'object' ? p : {};
}

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
  let fieldsExtracted = 0;
  const hostErrors = {};

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);

    if (type === 'fetch_started') {
      fetchStarted += 1;
    } else if (type === 'fetch_finished') {
      fetchFinished += 1;
      const code = toInt(payload.status_code, 0);
      if (code >= 400 || code === 0) {
        fetchErrors += 1;
        const host = extractHost(extractUrl(evt));
        if (host) {
          hostErrors[host] = (hostErrors[host] || 0) + 1;
        }
      }
    } else if (type === 'parse_started') {
      parseStarted += 1;
    } else if (type === 'parse_finished') {
      parseFinished += 1;
    } else if (type === 'llm_started') {
      llmStarted += 1;
    } else if (type === 'llm_finished') {
      llmFinished += 1;
      fieldsExtracted += toInt(payload.fields_extracted || payload.candidates, 0);
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
  const fieldsPerMin = elapsedMinutes > 0 ? fieldsExtracted / elapsedMinutes : 0;

  const topBlockers = Object.entries(hostErrors)
    .map(([host, count]) => ({ host, error_count: count }))
    .sort((a, b) => b.error_count - a.error_count)
    .slice(0, 10);

  return {
    status,
    round,
    total_fetches: totalFetches,
    total_parses: parseFinished,
    total_llm_calls: llmFinished,
    error_rate: Math.round(errorRate * 1000) / 1000,
    docs_per_min: Math.round(docsPerMin * 100) / 100,
    fields_per_min: Math.round(fieldsPerMin * 100) / 100,
    top_blockers: topBlockers,
  };
}

function inferPool(eventType) {
  if (eventType.startsWith('search')) return 'search';
  if (eventType.startsWith('fetch')) return 'fetch';
  if (eventType.startsWith('parse')) return 'parse';
  if (eventType.startsWith('index')) return 'index';
  if (eventType.startsWith('llm')) return 'llm';
  if (eventType === 'source_processed') return 'fetch';
  return 'fetch';
}

function inferStage(eventType) {
  if (eventType.startsWith('search')) return 'search';
  if (eventType.startsWith('fetch')) return 'fetch';
  if (eventType.startsWith('parse')) return 'parse';
  if (eventType.startsWith('index')) return 'index';
  if (eventType.startsWith('llm')) return 'llm';
  if (eventType === 'source_processed') return 'parse';
  return 'fetch';
}

function isStartEvent(type) {
  return type === 'fetch_started' || type === 'search_started' || type === 'parse_started' || type === 'llm_started' || type === 'index_started';
}

function isFinishEvent(type) {
  return type === 'fetch_finished' || type === 'search_finished' || type === 'parse_finished' || type === 'llm_finished' || type === 'index_finished' || type === 'llm_failed';
}

export function buildRuntimeOpsWorkers(events, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const stuckThresholdMs = toInt(opts.stuckThresholdMs, 60_000);
  const nowMs = toInt(opts.nowMs, Date.now());

  const workers = {};

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const workerId = String(payload.worker_id || '').trim();
    if (!workerId) continue;
    if (payload.scope === 'stage') continue;

    const pool = inferPool(type);
    const stage = inferStage(type);

    if (!workers[workerId]) {
      workers[workerId] = {
        worker_id: workerId,
        pool: String(payload.pool || pool).trim(),
        state: 'idle',
        stage,
        current_url: extractUrl(evt),
        started_at: String(evt?.ts || '').trim(),
        elapsed_ms: 0,
        last_error: null,
        retries: toInt(payload.retries, 0),
        fetch_mode: String(payload.fetch_mode || payload.fetcher_kind || '').trim() || null,
        docs_processed: 0,
        fields_extracted: 0,
      };
    }

    const w = workers[workerId];
    w.stage = stage;

    if (isStartEvent(type)) {
      w.state = 'running';
      w.current_url = extractUrl(evt) || w.current_url;
      w.started_at = String(evt?.ts || '').trim() || w.started_at;
      if (payload.fetch_mode || payload.fetcher_kind) {
        w.fetch_mode = String(payload.fetch_mode || payload.fetcher_kind || '').trim();
      }
    } else if (isFinishEvent(type)) {
      w.state = 'idle';
      w.elapsed_ms = parseTsMs(evt?.ts) - parseTsMs(w.started_at);
      if (type === 'fetch_finished') {
        w.docs_processed += 1;
        const code = toInt(payload.status_code, 0);
        if (code >= 400 || code === 0) {
          w.last_error = String(payload.error || `HTTP ${code}`).trim();
        }
      }
      if (type === 'llm_failed') {
        w.last_error = String(payload.message || payload.error || 'LLM call failed').trim();
      }
    } else if (type === 'source_processed') {
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      w.fields_extracted += candidates.length;
      w.docs_processed += 1;
    }
  }

  return Object.values(workers).map((w) => {
    if (w.state === 'running') {
      const startMs = parseTsMs(w.started_at);
      const elapsed = startMs > 0 ? nowMs - startMs : 0;
      return {
        ...w,
        elapsed_ms: elapsed,
        state: elapsed > stuckThresholdMs ? 'stuck' : 'running',
      };
    }
    return { ...w };
  });
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
      const code = toInt(payload.status_code, 0);
      doc.status = code >= 200 && code < 400 ? 'fetched' : 'fetch_error';
      doc.status_code = code || null;
      doc.bytes = toInt(payload.bytes, null);
      doc.content_type = String(payload.content_type || '').trim() || null;
    } else if (type === 'parse_started') {
      doc.status = 'parsing';
    } else if (type === 'parse_finished') {
      doc.status = 'parsed';
      doc.parse_method = String(payload.parse_method || '').trim() || null;
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
      statusCode = toInt(payload.status_code, null);
      bytes = toInt(payload.bytes, null);
      entry.status_code = statusCode;
      entry.duration_ms = toInt(payload.duration_ms, null);
    } else if (type === 'parse_started') {
      entry.stage = 'parse';
      entry.status = 'started';
    } else if (type === 'parse_finished') {
      entry.stage = 'parse';
      entry.status = 'finished';
      parseMethod = String(payload.parse_method || '').trim() || null;
      candidates = toInt(payload.candidates, null);
      entry.parse_method = parseMethod;
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
      const code = toInt(payload.status_code, 0);
      totalFetches += 1;
      if (code >= 400 || code === 0) {
        pools.fetch.failed += 1;
        if (code === 403) {
          blockedHosts.add(extractHost(url));
        }
      }
      pools.fetch.completed += 1;
      if (payload.fallback) {
        fallbackCount += 1;
      }
      retryTotal += toInt(payload.retries, 0);
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
      const ils = payload.identity_lock_state && typeof payload.identity_lock_state === 'object'
        ? payload.identity_lock_state : null;
      identityStatus = (ils ? String(ils.status || '').trim() : '')
        || String(payload.identity_status || '').trim()
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

export function buildExtractionFields(events, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const roundFilter = opts.round != null ? toInt(opts.round, null) : null;

  const acceptedFields = new Set();
  const fieldCandidates = {};

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);

    if (type === 'fields_filled_from_source') {
      const fields = Array.isArray(payload.fields) ? payload.fields : [];
      for (const f of fields) {
        acceptedFields.add(String(f));
      }
      continue;
    }

    if (type !== 'llm_finished' && type !== 'source_processed') continue;

    const round = toInt(payload.round, 0);
    if (roundFilter !== null && round !== roundFilter) continue;

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    const batchId = String(payload.batch_id || '').trim() || null;
    const workerId = String(payload.worker_id || '').trim() || null;

    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const field = String(c.field || '').trim();
      if (!field) continue;

      const entry = {
        value: c.value != null ? String(c.value) : null,
        method: String(c.method || payload.parse_method || '').trim(),
        confidence: toFloat(c.confidence, 0),
        source_host: extractHost(String(c.source_url || payload.url || '')),
        source_tier: c.source_tier != null ? toInt(c.source_tier, null) : null,
        snippet_id: c.snippet_id != null ? String(c.snippet_id) : null,
        quote: c.quote != null ? String(c.quote) : null,
      };

      if (!fieldCandidates[field]) {
        fieldCandidates[field] = {
          candidates: [],
          batch_id: batchId,
          round,
        };
      }
      fieldCandidates[field].candidates.push(entry);
      if (batchId) fieldCandidates[field].batch_id = batchId;
    }
  }

  const fields = Object.entries(fieldCandidates).map(([field, data]) => {
    const allCandidates = data.candidates;
    const best = allCandidates.reduce((a, b) => (b.confidence > a.confidence ? b : a), allCandidates[0]);

    const distinctValues = new Set(
      allCandidates
        .map((c) => String(c.value || '').trim().toLowerCase())
        .filter((v) => v && v !== 'unk')
    );

    let status = 'candidate';
    if (acceptedFields.has(field)) {
      status = 'accepted';
    } else if (best.value != null && String(best.value).trim().toLowerCase() === 'unk') {
      status = 'unknown';
    } else if (distinctValues.size > 1) {
      status = 'conflict';
    }

    return {
      field,
      value: best.value,
      status,
      confidence: best.confidence,
      method: best.method,
      source_tier: best.source_tier,
      source_host: best.source_host,
      refs_count: allCandidates.length,
      batch_id: data.batch_id,
      round: data.round,
      candidates: allCandidates.map((c) => ({
        value: c.value != null ? String(c.value) : '',
        method: c.method,
        confidence: c.confidence,
        source_host: c.source_host,
        source_tier: c.source_tier != null ? toInt(c.source_tier, 0) : 0,
        snippet_id: c.snippet_id,
        quote: c.quote,
      })),
    };
  });

  fields.sort((a, b) => {
    const statusOrder = { conflict: 0, unknown: 1, candidate: 2, accepted: 3 };
    const aOrder = statusOrder[a.status] ?? 4;
    const bOrder = statusOrder[b.status] ?? 4;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.field.localeCompare(b.field);
  });

  return { fields };
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

export function buildWorkerDetail(events, workerId) {
  const targetId = String(workerId || '').trim();

  const workerUrls = new Set();
  const workerHosts = new Set();

  for (const evt of events) {
    const payload = payloadOf(evt);
    const evtWorkerId = String(payload.worker_id || '').trim();
    if (evtWorkerId !== targetId) continue;

    const type = eventType(evt);
    if (type === 'fetch_started' || type === 'source_processed') {
      const url = extractUrl(evt);
      if (url) {
        workerUrls.add(url);
        workerHosts.add(extractHost(url));
      }
    }
  }

  const documents = [];
  const docMap = {};
  for (const evt of events) {
    const url = extractUrl(evt);
    if (!url || !workerUrls.has(url)) continue;

    const type = eventType(evt);
    const payload = payloadOf(evt);
    const ts = String(evt?.ts || '').trim();

    if (!docMap[url]) {
      docMap[url] = {
        url,
        host: extractHost(url),
        status: 'discovered',
        status_code: null,
        bytes: null,
        content_type: null,
        last_event_ts: ts,
      };
    }

    const doc = docMap[url];
    if (ts > doc.last_event_ts) doc.last_event_ts = ts;

    if (type === 'fetch_started') doc.status = 'fetching';
    else if (type === 'fetch_finished') {
      const code = toInt(payload.status_code, 0);
      doc.status = code >= 200 && code < 400 ? 'fetched' : 'fetch_error';
      doc.status_code = code || null;
      doc.bytes = toInt(payload.bytes, null);
      doc.content_type = String(payload.content_type || '').trim() || null;
    } else if (type === 'parse_finished') doc.status = 'parsed';
    else if (type === 'index_finished') doc.status = 'indexed';
  }
  documents.push(...Object.values(docMap));

  const extractionFields = [];
  for (const evt of events) {
    const type = eventType(evt);
    if (type !== 'source_processed') continue;

    const payload = payloadOf(evt);
    const evtWorkerId = String(payload.worker_id || '').trim();
    const url = extractUrl(evt);
    if (evtWorkerId !== targetId && !workerUrls.has(url)) continue;

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    for (const c of candidates) {
      if (!c || typeof c !== 'object') continue;
      const field = String(c.field || '').trim();
      if (!field) continue;
      extractionFields.push({
        field,
        value: c.value != null ? String(c.value) : null,
        confidence: toFloat(c.confidence, 0),
        method: String(c.method || '').trim(),
        source_url: url,
      });
    }
  }

  const queueJobs = [];
  for (const evt of events) {
    const type = eventType(evt);
    if (type !== 'repair_query_enqueued') continue;

    const payload = payloadOf(evt);
    const jobUrl = String(payload.url || '').trim();
    const jobHost = extractHost(jobUrl);
    if (!workerHosts.has(jobHost)) continue;

    const id = String(payload.dedupe_key || '').trim() || `job-${queueJobs.length + 1}`;
    queueJobs.push({
      id,
      lane: String(payload.lane || 'repair_search').trim(),
      status: 'queued',
      host: jobHost,
      url: jobUrl,
      reason: String(payload.reason || '').trim(),
    });
  }

  const screenshots = [];
  for (const evt of events) {
    const type = eventType(evt);
    if (type !== 'visual_asset_captured') continue;

    const payload = payloadOf(evt);
    const url = extractUrl(evt);
    const evtWorkerId = String(payload.worker_id || '').trim();
    if (evtWorkerId !== targetId && !workerUrls.has(url)) continue;

    screenshots.push({
      filename: String(payload.screenshot_uri || '').trim(),
      url,
      width: toInt(payload.width, 0),
      height: toInt(payload.height, 0),
      bytes: toInt(payload.bytes, 0),
      ts: String(evt?.ts || '').trim(),
    });
  }

  return {
    worker_id: targetId,
    documents,
    extraction_fields: extractionFields,
    queue_jobs: queueJobs,
    screenshots,
  };
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
      const code = toInt(payload.status_code, 0);
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

function classifyPrefetchLlmReason(reason) {
  const r = String(reason || '').trim().toLowerCase();
  if (r === 'brand_resolution') return 'brand_resolver';
  if (r.startsWith('discovery_planner')) return 'search_planner';
  if (r === 'url_prediction') return 'url_predictor';
  if (r.includes('triage') || r.includes('rerank') || r.includes('serp')) return 'serp_triage';
  if (r === 'domain_safety_classification') return 'domain_classifier';
  return null;
}

export function buildPreFetchPhases(events, meta, artifacts) {
  const safeArtifacts = artifacts && typeof artifacts === 'object' ? artifacts : {};

  const needsetSnapshots = [];
  let lastNeedset = null;

  const llmPending = {};
  const llmGroups = {
    brand_resolver: [],
    search_planner: [],
    url_predictor: [],
    serp_triage: [],
    domain_classifier: [],
  };

  const searchPending = {};
  const searchResults = [];

  let brandResolution = null;
  const searchPlans = [];
  const searchResultDetails = [];
  let urlPredictions = null;
  const serpTriage = [];
  const domainHealth = [];

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const ts = String(evt?.ts || '').trim();

    if (type === 'needset_computed') {
      const evtLockState = payload.identity_lock_state && typeof payload.identity_lock_state === 'object'
        ? payload.identity_lock_state
        : null;
      const identityStatus = evtLockState
        ? String(evtLockState.status || '').trim()
        : String(payload.identity_status || '').trim();
      const identityConfidence = evtLockState
        ? toFloat(evtLockState.confidence, 0)
        : toFloat(payload.identity_confidence, 0);
      const snap = {
        needset_size: toInt(payload.needset_size, 0),
        total_fields: toInt(payload.total_fields, 0),
        identity_status: identityStatus,
        identity_confidence: identityConfidence,
        ts,
      };
      needsetSnapshots.push(snap);
      lastNeedset = {
        needset_size: snap.needset_size,
        total_fields: snap.total_fields,
        identity_lock_state: evtLockState || {
          status: identityStatus,
          confidence: identityConfidence,
        },
        needs: Array.isArray(payload.needs) ? payload.needs : [],
        reason_counts: payload.reason_counts && typeof payload.reason_counts === 'object' ? payload.reason_counts : {},
        required_level_counts: payload.required_level_counts && typeof payload.required_level_counts === 'object' ? payload.required_level_counts : {},
      };
    }

    if (type === 'llm_started') {
      const reason = String(payload.reason || '').trim();
      const group = classifyPrefetchLlmReason(reason);
      if (group) {
        const batchId = String(payload.batch_id || '').trim();
        llmPending[batchId] = {
          group,
          reason,
          model: String(payload.model || '').trim(),
          provider: String(payload.provider || '').trim(),
          prompt_preview: payload.prompt_preview != null ? String(payload.prompt_preview) : null,
          started_ts: ts,
        };
      }
    }

    if (type === 'llm_finished') {
      const reason = String(payload.reason || '').trim();
      const group = classifyPrefetchLlmReason(reason);
      if (group) {
        const batchId = String(payload.batch_id || '').trim();
        const pending = llmPending[batchId];
        const startedTs = pending ? pending.started_ts : '';
        const durationMs = startedTs ? parseTsMs(ts) - parseTsMs(startedTs) : 0;
        const tokens = payload.tokens && typeof payload.tokens === 'object' ? payload.tokens : {};

        llmGroups[group].push({
          status: 'finished',
          reason: pending ? pending.reason : reason,
          model: String(payload.model || (pending ? pending.model : '') || '').trim(),
          provider: String(payload.provider || (pending ? pending.provider : '') || '').trim(),
          tokens: { input: toInt(tokens.input, 0), output: toInt(tokens.output, 0) },
          duration_ms: Math.max(0, durationMs),
          prompt_preview: pending ? pending.prompt_preview : null,
          response_preview: payload.response_preview != null ? String(payload.response_preview) : null,
          error: null,
        });
        delete llmPending[batchId];
      }
    }

    if (type === 'llm_failed') {
      const reason = String(payload.reason || '').trim();
      const group = classifyPrefetchLlmReason(reason);
      if (group) {
        const batchId = String(payload.batch_id || '').trim();
        const pending = llmPending[batchId];
        const startedTs = pending ? pending.started_ts : '';
        const durationMs = startedTs ? parseTsMs(ts) - parseTsMs(startedTs) : 0;

        llmGroups[group].push({
          status: 'failed',
          reason: pending ? pending.reason : reason,
          model: String(payload.model || (pending ? pending.model : '') || '').trim(),
          provider: String(payload.provider || (pending ? pending.provider : '') || '').trim(),
          tokens: { input: 0, output: 0 },
          duration_ms: Math.max(0, durationMs),
          prompt_preview: pending ? pending.prompt_preview : null,
          response_preview: null,
          error: String(payload.message || payload.error || 'LLM call failed').trim(),
        });
        delete llmPending[batchId];
      }
    }

    if (type === 'search_started') {
      const query = String(payload.query || '').trim();
      searchPending[query] = {
        query,
        provider: String(payload.provider || '').trim(),
        worker_id: String(payload.worker_id || '').trim(),
        started_ts: ts,
      };
    }

    if (type === 'search_finished') {
      const query = String(payload.query || '').trim();
      const pending = searchPending[query];
      const startedTs = pending ? pending.started_ts : '';
      const durationMs = startedTs ? parseTsMs(ts) - parseTsMs(startedTs) : 0;

      searchResults.push({
        query,
        provider: String(payload.provider || (pending ? pending.provider : '') || '').trim(),
        result_count: toInt(payload.result_count, 0),
        duration_ms: Math.max(0, durationMs),
        worker_id: String(payload.worker_id || (pending ? pending.worker_id : '') || '').trim(),
        ts,
      });
      delete searchPending[query];
    }

    if (type === 'brand_resolved') {
      brandResolution = {
        brand: String(payload.brand || '').trim(),
        status: String(payload.status || 'resolved').trim(),
        skip_reason: String(payload.skip_reason || '').trim(),
        official_domain: String(payload.official_domain || '').trim(),
        aliases: Array.isArray(payload.aliases) ? payload.aliases : [],
        support_domain: String(payload.support_domain || '').trim(),
        confidence: toFloat(payload.confidence, 0),
        candidates: Array.isArray(payload.candidates) ? payload.candidates.map((c) => ({
          name: String(c?.name || '').trim(),
          confidence: toFloat(c?.confidence, 0),
          evidence_snippets: Array.isArray(c?.evidence_snippets) ? c.evidence_snippets : [],
          disambiguation_note: String(c?.disambiguation_note || '').trim(),
        })) : [],
        reasoning: Array.isArray(payload.reasoning) ? payload.reasoning : [],
      };
    }

    if (type === 'search_plan_generated') {
      searchPlans.push({
        pass_index: toInt(payload.pass_index, searchPlans.length),
        pass_name: String(payload.pass_name || '').trim(),
        queries_generated: Array.isArray(payload.queries_generated) ? payload.queries_generated : [],
        stop_condition: String(payload.stop_condition || '').trim(),
        plan_rationale: String(payload.plan_rationale || '').trim(),
        query_target_map: payload.query_target_map && typeof payload.query_target_map === 'object'
          ? payload.query_target_map : {},
        missing_critical_fields: Array.isArray(payload.missing_critical_fields) ? payload.missing_critical_fields : [],
        mode: String(payload.mode || '').trim(),
      });
    }

    if (type === 'search_results_collected') {
      searchResultDetails.push({
        query: String(payload.query || '').trim(),
        provider: String(payload.provider || '').trim(),
        dedupe_count: toInt(payload.dedupe_count, 0),
        results: Array.isArray(payload.results) ? payload.results.map((r) => {
          const rawUrl = String(r?.url || '').trim();
          let domain = String(r?.domain || '').trim();
          if (!domain && rawUrl) {
            try { domain = new URL(rawUrl).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
          }
          return {
            title: String(r?.title || '').trim(),
            url: rawUrl,
            domain,
            snippet: String(r?.snippet || '').trim(),
            rank: toInt(r?.rank, 0),
            relevance_score: toFloat(r?.relevance_score, 0),
            decision: String(r?.decision || '').trim(),
            reason: String(r?.reason || '').trim(),
            provider: String(r?.provider || '').trim(),
          };
        }) : [],
      });
    }

    if (type === 'urls_predicted') {
      urlPredictions = {
        remaining_budget: toInt(payload.remaining_budget, 0),
        predictions: Array.isArray(payload.predictions) ? payload.predictions.map((p) => ({
          url: String(p?.url || '').trim(),
          domain: String(p?.domain || '').trim(),
          predicted_payoff: toFloat(p?.predicted_payoff, 0),
          target_fields: Array.isArray(p?.target_fields) ? p.target_fields : [],
          risk_flags: Array.isArray(p?.risk_flags) ? p.risk_flags : [],
          decision: String(p?.decision || '').trim(),
        })) : [],
      };
    }

    if (type === 'serp_triage_completed') {
      serpTriage.push({
        query: String(payload.query || '').trim(),
        kept_count: toInt(payload.kept_count, 0),
        dropped_count: toInt(payload.dropped_count, 0),
        candidates: Array.isArray(payload.candidates) ? payload.candidates.map((c) => ({
          url: String(c?.url || '').trim(),
          title: String(c?.title || '').trim(),
          domain: String(c?.domain || '').trim(),
          snippet: String(c?.snippet || '').trim(),
          score: toFloat(c?.score, 0),
          decision: String(c?.decision || '').trim(),
          rationale: String(c?.rationale || '').trim(),
          score_components: c?.score_components && typeof c.score_components === 'object'
            ? {
                base_relevance: toFloat(c.score_components.base_relevance, 0),
                tier_boost: toFloat(c.score_components.tier_boost, 0),
                identity_match: toFloat(c.score_components.identity_match, 0),
                penalties: toFloat(c.score_components.penalties, 0),
              }
            : { base_relevance: 0, tier_boost: 0, identity_match: 0, penalties: 0 },
        })) : [],
      });
    }

    if (type === 'domains_classified') {
      const classifications = Array.isArray(payload.classifications) ? payload.classifications : [];
      for (const cls of classifications) {
        domainHealth.push({
          domain: String(cls?.domain || '').trim(),
          role: String(cls?.role || '').trim(),
          safety_class: String(cls?.safety_class || '').trim(),
          budget_score: toFloat(cls?.budget_score, 0),
          cooldown_remaining: toInt(cls?.cooldown_remaining, 0),
          success_rate: toFloat(cls?.success_rate, 0),
          avg_latency_ms: toInt(cls?.avg_latency_ms, 0),
          notes: String(cls?.notes || '').trim(),
        });
      }
    }
  }

  const artNeedset = safeArtifacts.needset && typeof safeArtifacts.needset === 'object' ? safeArtifacts.needset : null;
  const artProfile = safeArtifacts.search_profile && typeof safeArtifacts.search_profile === 'object' ? safeArtifacts.search_profile : null;
  const artBrand = safeArtifacts.brand_resolution && typeof safeArtifacts.brand_resolution === 'object' ? safeArtifacts.brand_resolution : null;

  const needset = lastNeedset
    ? {
        ...lastNeedset,
        snapshots: needsetSnapshots,
      }
    : artNeedset
      ? {
          needset_size: toInt(artNeedset.needset_size, 0),
          total_fields: toInt(artNeedset.total_fields, 0),
          identity_lock_state: artNeedset.identity_lock_state && typeof artNeedset.identity_lock_state === 'object'
            ? artNeedset.identity_lock_state
            : { status: 'unlocked', confidence: 0 },
          needs: Array.isArray(artNeedset.needs) ? artNeedset.needs : [],
          reason_counts: artNeedset.reason_counts && typeof artNeedset.reason_counts === 'object' ? artNeedset.reason_counts : {},
          required_level_counts: artNeedset.required_level_counts && typeof artNeedset.required_level_counts === 'object' ? artNeedset.required_level_counts : {},
          snapshots: needsetSnapshots,
        }
      : {
          needset_size: 0,
          total_fields: 0,
          identity_lock_state: { status: 'unlocked', confidence: 0 },
          needs: [],
          reason_counts: {},
          required_level_counts: {},
          snapshots: [],
        };

  const search_profile = artProfile
    ? {
        query_count: toInt(artProfile.query_count, Array.isArray(artProfile.query_rows) ? artProfile.query_rows.length : 0),
        selected_query_count: toInt(artProfile.selected_query_count, 0),
        provider: String(artProfile.provider || '').trim(),
        llm_query_planning: Boolean(artProfile.llm_query_planning),
        llm_query_model: String(artProfile.llm_query_model || '').trim(),
        llm_queries: Array.isArray(artProfile.llm_queries) ? artProfile.llm_queries : [],
        identity_aliases: Array.isArray(artProfile.identity_aliases) ? artProfile.identity_aliases : [],
        variant_guard_terms: Array.isArray(artProfile.variant_guard_terms) ? artProfile.variant_guard_terms : [],
        focus_fields: Array.isArray(artProfile.focus_fields) ? artProfile.focus_fields : [],
        query_rows: Array.isArray(artProfile.query_rows) ? artProfile.query_rows : [],
        query_guard: artProfile.query_guard && typeof artProfile.query_guard === 'object' ? artProfile.query_guard : {},
        hint_source_counts: artProfile.hint_source_counts && typeof artProfile.hint_source_counts === 'object' ? artProfile.hint_source_counts : {},
        field_rule_gate_counts: artProfile.field_rule_gate_counts && typeof artProfile.field_rule_gate_counts === 'object' ? artProfile.field_rule_gate_counts : {},
        field_rule_hint_counts_by_field: artProfile.field_rule_hint_counts_by_field && typeof artProfile.field_rule_hint_counts_by_field === 'object' ? artProfile.field_rule_hint_counts_by_field : {},
        generated_at: String(artProfile.generated_at || '').trim(),
        product_id: String(artProfile.product_id || '').trim(),
        source: String(artProfile.source || '').trim(),
        query_reject_log: Array.isArray(artProfile.query_reject_log) ? artProfile.query_reject_log : [],
        alias_reject_log: Array.isArray(artProfile.alias_reject_log) ? artProfile.alias_reject_log : [],
      }
    : {
        query_count: 0,
        selected_query_count: 0,
        provider: '',
        llm_query_planning: false,
        llm_query_model: '',
        llm_queries: [],
        identity_aliases: [],
        variant_guard_terms: [],
        focus_fields: [],
        query_rows: [],
        query_guard: {},
        hint_source_counts: {},
        field_rule_gate_counts: {},
        field_rule_hint_counts_by_field: {},
        generated_at: '',
        product_id: '',
        source: '',
        query_reject_log: [],
        alias_reject_log: [],
      };

  return {
    needset,
    search_profile,
    llm_calls: llmGroups,
    search_results: searchResults,
    brand_resolution: brandResolution || (artBrand ? {
      brand: String(artBrand.brand || '').trim(),
      status: String(artBrand.status || 'resolved').trim(),
      skip_reason: String(artBrand.skip_reason || '').trim(),
      official_domain: String(artBrand.official_domain || '').trim(),
      aliases: Array.isArray(artBrand.aliases) ? artBrand.aliases : [],
      support_domain: String(artBrand.support_domain || '').trim(),
      confidence: toFloat(artBrand.confidence, 0),
      candidates: Array.isArray(artBrand.candidates) ? artBrand.candidates.map((c) => ({
        name: String(c?.name || '').trim(),
        confidence: toFloat(c?.confidence, 0),
        evidence_snippets: Array.isArray(c?.evidence_snippets) ? c.evidence_snippets : [],
        disambiguation_note: String(c?.disambiguation_note || '').trim(),
      })) : [],
      reasoning: Array.isArray(artBrand.reasoning) ? artBrand.reasoning : [],
    } : null),
    search_plans: searchPlans,
    search_result_details: searchResultDetails,
    url_predictions: urlPredictions,
    serp_triage: serpTriage,
    domain_health: domainHealth,
  };
}

export function buildWorkerScreenshots(events, workerId) {
  const targetId = String(workerId || '').trim();
  const screenshots = [];

  for (const evt of events) {
    const type = eventType(evt);
    if (type !== 'visual_asset_captured') continue;

    const payload = payloadOf(evt);
    const evtWorkerId = String(payload.worker_id || '').trim();
    if (evtWorkerId !== targetId) continue;

    screenshots.push({
      filename: String(payload.screenshot_uri || '').trim(),
      url: extractUrl(evt),
      width: toInt(payload.width, 0),
      height: toInt(payload.height, 0),
      bytes: toInt(payload.bytes, 0),
      ts: String(evt?.ts || '').trim(),
    });
  }

  return screenshots;
}
