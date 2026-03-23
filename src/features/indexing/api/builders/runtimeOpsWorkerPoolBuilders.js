import {
  toInt, parseTsMs,
  extractUrl, extractEventUrls, extractPrimaryEventUrl,
  eventType, payloadOf,
  fetchStatusCode,
} from './runtimeOpsEventPrimitives.js';
import {
  toSourceIndexingPackets, packetMatchesWorkerUrls, packetPrimaryUrl, packetFieldKeyCount,
} from './runtimeOpsPhaseLineage.js';

export function inferPool(eventType) {
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

function searchQueryKey(query) {
  return String(query || '').trim().toLowerCase();
}

function fetchAssignmentDisplayLabel(workerId, assignment) {
  const slot = String(assignment?.slot || '').trim().toLowerCase();
  const attemptNo = toInt(assignment?.attempt_no, 0);
  if (!slot || attemptNo <= 0) return workerId;
  return `fetch-${slot}${attemptNo}`;
}

function resolveFetchAssignment(assignments, referenceTsMs) {
  if (!Array.isArray(assignments) || assignments.length === 0) return null;
  if (referenceTsMs <= 0) return assignments[assignments.length - 1] || null;

  let best = null;
  for (const assignment of assignments) {
    const collectedTsMs = toInt(assignment?.collected_ts_ms, 0);
    if (collectedTsMs > 0 && collectedTsMs > referenceTsMs) continue;
    if (!best || collectedTsMs >= toInt(best.collected_ts_ms, 0)) {
      best = assignment;
    }
  }

  return best || assignments[assignments.length - 1] || null;
}

export function buildRuntimeOpsWorkers(events, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const stuckThresholdMs = toInt(opts.stuckThresholdMs, 60_000);
  const nowMs = toInt(opts.nowMs, Date.now());
  const sourcePackets = toSourceIndexingPackets(opts.sourceIndexingPacketCollection);

  // Pre-pass: build query → resolved provider map from search_results_collected
  const queryResolvedProvider = {};
  const latestSearchAssignmentByQuery = {};
  const searchAttemptByWorkerId = {};
  const urlSearchAssignments = {};
  for (const evt of events) {
    const type = eventType(evt);
    const p = payloadOf(evt);

    if (type === 'search_started' && String(p.scope || '').trim() === 'query') {
      const searchWorkerId = String(p.worker_id || '').trim();
      const query = String(p.current_query ?? p.query ?? '').trim();
      const queryKey = searchQueryKey(query);
      if (!searchWorkerId || !queryKey) continue;

      const attemptNo = toInt(searchAttemptByWorkerId[searchWorkerId], 0) + 1;
      searchAttemptByWorkerId[searchWorkerId] = attemptNo;
      latestSearchAssignmentByQuery[queryKey] = {
        search_worker_id: searchWorkerId,
        slot: p.slot != null ? String(p.slot) : null,
        attempt_no: attemptNo,
        query,
        collected_ts_ms: parseTsMs(evt?.ts),
      };
      continue;
    }

    if (type === 'search_results_collected' && String(p.scope || '').trim() === 'query' && p.query) {
      const query = String(p.query || '').trim();
      const queryKey = searchQueryKey(query);
      if (!queryKey) continue;

      queryResolvedProvider[queryKey] = String(p.provider || '').trim();
      const assignment = latestSearchAssignmentByQuery[queryKey];
      if (!assignment) continue;

      const collectedTsMs = parseTsMs(evt?.ts);
      const results = Array.isArray(p.results) ? p.results : [];
      for (const result of results) {
        const resultUrl = String(result?.url || '').trim();
        if (!resultUrl) continue;
        if (!urlSearchAssignments[resultUrl]) {
          urlSearchAssignments[resultUrl] = [];
        }
        urlSearchAssignments[resultUrl].push({
          ...assignment,
          collected_ts_ms: collectedTsMs,
        });
      }
    }
  }

  const workers = {};

  function applyFetchAssignment(worker, referenceTsMs) {
    if (!worker || worker.pool !== 'fetch') return;

    const url = String(worker.current_url || '').trim();
    const assignment = resolveFetchAssignment(urlSearchAssignments[url], referenceTsMs);
    worker.assigned_search_slot = assignment?.slot ?? null;
    worker.assigned_search_attempt_no = assignment?.attempt_no ?? null;
    worker.assigned_search_worker_id = assignment?.search_worker_id ?? null;
    worker.assigned_search_query = assignment?.query ?? null;
    worker.display_label = fetchAssignmentDisplayLabel(worker.worker_id, assignment);
  }

  for (const evt of events) {
    const type = eventType(evt);
    const payload = payloadOf(evt);
    const workerId = String(payload.worker_id || '').trim();
    if (!workerId) continue;
    if (payload.scope === 'stage') continue;

    const pool = inferPool(type);
    const stage = inferStage(type);

    const resolvedPool = String(payload.pool || pool).trim();

    if (!workers[workerId]) {
      const base = {
        worker_id: workerId,
        pool: resolvedPool,
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
      if (resolvedPool === 'fetch') {
        base.assigned_search_slot = null;
        base.assigned_search_attempt_no = null;
        base.assigned_search_worker_id = null;
        base.assigned_search_query = null;
        base.display_label = workerId;
        base._worker_urls = new Set();
        base._processed_urls = new Set();
        base._field_counts_by_url = {};
      }
      if (resolvedPool === 'search') {
        base.slot = payload.slot != null ? String(payload.slot) : null;
        base.tasks_started = toInt(payload.tasks_started, 0);
        base.tasks_completed = 0;
        const rawQuery = payload.current_query != null ? String(payload.current_query) : (payload.query != null ? String(payload.query) : null);
        const rawProv = payload.current_provider != null ? String(payload.current_provider) : (payload.provider != null ? String(payload.provider) : null);
        base.current_query = rawQuery;
        base.current_provider = (rawQuery && queryResolvedProvider[rawQuery.toLowerCase()]) || rawProv;
        base.zero_result_count = 0;
        base.avg_result_count = 0;
        base.avg_duration_ms = 0;
        base.last_result_count = 0;
        base.last_duration_ms = 0;
        base.last_query = null;
        base.last_provider = null;
        base.primary_count = 0;
        base.fallback_count = 0;
        base._result_sum = 0;
        base._duration_sum = 0;
      }
      if (resolvedPool === 'llm') {
        base.call_type = payload.call_type != null ? String(payload.call_type) : null;
        base.model = payload.model != null ? String(payload.model) : null;
        base.provider = payload.provider != null ? String(payload.provider) : null;
        base.round = payload.round != null ? toInt(payload.round, 1) : null;
        base.prompt_tokens = payload.prompt_tokens ?? null;
        base.completion_tokens = payload.completion_tokens ?? null;
        base.estimated_cost = payload.estimated_cost ?? null;
        base.duration_ms = payload.duration_ms ?? null;
        base.input_summary = payload.input_summary ?? null;
        base.output_summary = payload.output_summary ?? null;
        base.prefetch_tab = payload.prefetch_tab ?? null;
        base.prompt_preview = payload.prompt_preview != null ? String(payload.prompt_preview) : null;
        base.response_preview = payload.response_preview != null ? String(payload.response_preview) : null;
      }
      workers[workerId] = base;
    }

    const w = workers[workerId];
    w.stage = stage;
    if (w.pool === 'fetch') {
      for (const url of extractEventUrls(evt)) {
        w._worker_urls.add(url);
      }
      applyFetchAssignment(w, parseTsMs(w.started_at));
    }

    // WHY: search_queued events pre-populate workers before execution starts.
    // The worker was just created above with state 'idle' — set it to 'queued'.
    if (type === 'search_queued' && resolvedPool === 'search') {
      w.state = 'queued';
      if (payload.slot != null) w.slot = String(payload.slot);
      const rawQ = payload.query != null ? String(payload.query) : w.current_query;
      w.current_query = rawQ;
      w.tasks_started = 0;
    } else if (isStartEvent(type)) {
      w.state = 'running';
      w.current_url = extractUrl(evt) || w.current_url;
      w.started_at = String(evt?.ts || '').trim() || w.started_at;
      if (payload.fetch_mode || payload.fetcher_kind) {
        w.fetch_mode = String(payload.fetch_mode || payload.fetcher_kind || '').trim();
      }
      if (w.pool === 'fetch') {
        applyFetchAssignment(w, parseTsMs(evt?.ts));
      }
      if (resolvedPool === 'search') {
        if (payload.slot != null) w.slot = String(payload.slot);
        if (payload.tasks_started != null) w.tasks_started = toInt(payload.tasks_started, w.tasks_started);
        const rawQ = payload.current_query != null ? String(payload.current_query) : (payload.query != null ? String(payload.query) : w.current_query);
        const rawP = payload.current_provider != null ? String(payload.current_provider) : (payload.provider != null ? String(payload.provider) : w.current_provider);
        w.current_query = rawQ;
        w.current_provider = (rawQ && queryResolvedProvider[rawQ.toLowerCase()]) || rawP;
      }
      if (resolvedPool === 'llm') {
        if (payload.call_type != null) w.call_type = String(payload.call_type);
        if (payload.model != null) w.model = String(payload.model);
        if (payload.provider != null) w.provider = String(payload.provider);
        if (payload.round != null) w.round = toInt(payload.round, w.round);
        if (payload.prompt_tokens != null) w.prompt_tokens = payload.prompt_tokens;
        if (payload.input_summary != null) w.input_summary = payload.input_summary;
        if (payload.prefetch_tab != null) w.prefetch_tab = payload.prefetch_tab;
        if (payload.prompt_preview != null) w.prompt_preview = String(payload.prompt_preview);
      }
    } else if (isFinishEvent(type)) {
      w.state = 'idle';
      w.elapsed_ms = parseTsMs(evt?.ts) - parseTsMs(w.started_at);
      if (w.pool === 'fetch') {
        w.current_url = extractUrl(evt) || w.current_url;
        applyFetchAssignment(w, parseTsMs(evt?.ts));
      }
      if (type === 'fetch_finished') {
        const primaryUrl = extractPrimaryEventUrl(evt);
        if (primaryUrl) w._processed_urls.add(primaryUrl);
        const code = fetchStatusCode(payload, 0);
        if (code >= 400 || code === 0) {
          w.last_error = String(payload.error || `HTTP ${code}`).trim();
        }
      }
      if (type === 'index_finished') {
        const primaryUrl = extractPrimaryEventUrl(evt);
        if (primaryUrl) w._processed_urls.add(primaryUrl);
        const filledFieldCount = Math.max(
          0,
          toInt(payload.count, Array.isArray(payload.filled_fields) ? payload.filled_fields.length : 0),
        );
        if (primaryUrl && filledFieldCount > 0) {
          w._field_counts_by_url[primaryUrl] = filledFieldCount;
        }
      }
      if (type === 'llm_failed') {
        w.last_error = String(payload.message || payload.error || 'LLM call failed').trim();
      }
      if (resolvedPool === 'search' && (type === 'search_finished')) {
        w.last_query = w.current_query;
        w.last_provider = w.current_provider;
        w.current_query = null;
        w.current_provider = null;
        w.tasks_completed += 1;
        if (Boolean(payload.is_fallback)) {
          w.fallback_count += 1;
        } else {
          w.primary_count += 1;
        }
        const resultCount = toInt(payload.result_count, 0);
        const durationMs = toInt(payload.duration_ms, 0);
        if (resultCount === 0) w.zero_result_count += 1;
        w._result_sum += resultCount;
        w._duration_sum += durationMs;
        w.avg_result_count = Number((w._result_sum / w.tasks_completed).toFixed(2));
        w.avg_duration_ms = Math.round(w._duration_sum / w.tasks_completed);
        w.last_result_count = resultCount;
        w.last_duration_ms = durationMs;
      }
      if (resolvedPool === 'llm' && (type === 'llm_finished' || type === 'llm_failed')) {
        if (payload.prompt_tokens != null) w.prompt_tokens = payload.prompt_tokens;
        if (payload.completion_tokens != null) w.completion_tokens = payload.completion_tokens;
        if (payload.estimated_cost != null) w.estimated_cost = payload.estimated_cost;
        if (payload.duration_ms != null) w.duration_ms = payload.duration_ms;
        if (payload.model != null) w.model = String(payload.model);
        if (payload.output_summary != null) w.output_summary = payload.output_summary;
        if (payload.response_preview != null) w.response_preview = String(payload.response_preview);
        // Only overwrite prompt_preview if finish sends a non-empty value;
        // the openAI client does not resend the prompt on completion, so
        // the finish event typically carries an empty string that would
        // destroy the original preview set during llm_started.
        if (payload.prompt_preview != null && payload.prompt_preview !== '') w.prompt_preview = String(payload.prompt_preview);
      }
    } else if (type === 'source_processed') {
      if (w.pool === 'fetch') {
        w.current_url = extractUrl(evt) || w.current_url;
        applyFetchAssignment(w, parseTsMs(evt?.ts));
      }
      const primaryUrl = extractPrimaryEventUrl(evt);
      if (primaryUrl) w._processed_urls.add(primaryUrl);
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      if (primaryUrl && candidates.length > 0) {
        w._field_counts_by_url[primaryUrl] = Math.max(
          toInt(w._field_counts_by_url[primaryUrl], 0),
          candidates.length,
        );
      }
    }
  }

  return Object.values(workers).map((w) => {
    const { _result_sum, _duration_sum, _worker_urls, _processed_urls, _field_counts_by_url, ...clean } = w;
    if (clean.pool === 'fetch') {
      const workerUrls = _worker_urls instanceof Set ? _worker_urls : new Set();
      const processedUrls = _processed_urls instanceof Set ? _processed_urls : new Set();
      const packetMatchedUrls = new Set();
      let packetFieldCount = 0;
      for (const packet of sourcePackets) {
        if (!packetMatchesWorkerUrls(packet, workerUrls)) continue;
        const packetUrl = packetPrimaryUrl(packet);
        if (packetUrl) packetMatchedUrls.add(packetUrl);
        packetFieldCount += packetFieldKeyCount(packet);
      }

      const eventFieldCount = Object.values(_field_counts_by_url || {})
        .reduce((sum, count) => sum + toInt(count, 0), 0);
      const uniqueDocUrls = new Set([
        ...processedUrls,
        ...packetMatchedUrls,
      ]);
      clean.docs_processed = uniqueDocUrls.size;
      clean.fields_extracted = packetFieldCount > 0 ? packetFieldCount : eventFieldCount;
    }
    if (clean.state === 'running') {
      const startMs = parseTsMs(clean.started_at);
      const elapsed = startMs > 0 ? nowMs - startMs : 0;
      return {
        ...clean,
        elapsed_ms: elapsed,
        state: elapsed > stuckThresholdMs ? 'stuck' : 'running',
      };
    }
    return { ...clean };
  });
}
