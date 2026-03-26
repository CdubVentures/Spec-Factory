import {
  toInt, parseTsMs,
  extractUrl, extractEventUrls, extractPrimaryEventUrl,
  eventType, payloadOf,
  fetchStatusCode,
} from './runtimeOpsEventPrimitives.js';
import {
  toSourceIndexingPackets, packetMatchesWorkerUrls, packetPrimaryUrl, packetFieldKeyCount,
} from './runtimeOpsPhaseLineage.js';
import { normalizeHost } from '../../pipeline/shared/hostParser.js';

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
  const rank = toInt(assignment?.result_rank, 0);
  if (!slot || rank <= 0) return workerId;
  return `fetch-${slot}${rank}`;
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
  // WHY: Stuck threshold derives from the Crawlee request handler timeout.
  // A worker can't legitimately run longer than that timeout, so "stuck" should
  // fire 5 seconds before the handler timeout would trigger a retry.
  const handlerTimeoutSecs = toInt(opts.crawleeRequestHandlerTimeoutSecs, 45);
  const stuckThresholdMs = toInt(opts.stuckThresholdMs, (handlerTimeoutSecs - 5) * 1000);
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
          result_rank: toInt(result?.rank, 0),
        });
      }
    }
  }

  // WHY: Host-level fallback for brand/manufacturer workers whose fetched URL
  // differs from the search result URL (www prefix, locale path, brand seed vs
  // SERP URL). Sorted by slot then rank so workers get the best available match.
  function safeHostname(url) {
    try { return normalizeHost(new URL(url).hostname); } catch { return ''; }
  }

  const hostAssignmentQueues = {};
  for (const [url, assignments] of Object.entries(urlSearchAssignments)) {
    const hostname = safeHostname(url);
    if (!hostname) continue;
    for (const a of assignments) {
      if (!hostAssignmentQueues[hostname]) hostAssignmentQueues[hostname] = [];
      hostAssignmentQueues[hostname].push({ ...a, _source_url: url });
    }
  }
  for (const queue of Object.values(hostAssignmentQueues)) {
    queue.sort((a, b) => {
      const slotCmp = String(a.slot || '').localeCompare(String(b.slot || ''));
      if (slotCmp !== 0) return slotCmp;
      return toInt(a.result_rank, 999) - toInt(b.result_rank, 999);
    });
  }

  const consumedAssignmentUrls = new Set();
  const workerResolvedAssignment = {};
  const workers = {};

  function applyFetchAssignment(worker, referenceTsMs) {
    if (!worker || worker.pool !== 'fetch') return;

    // Reuse cached assignment (prevents re-consuming host queue entries)
    const cached = workerResolvedAssignment[worker.worker_id];
    if (cached) {
      worker.assigned_search_slot = cached.slot ?? null;
      worker.assigned_search_attempt_no = cached.attempt_no ?? null;
      worker.assigned_result_rank = cached.result_rank ?? null;
      worker.assigned_search_worker_id = cached.search_worker_id ?? null;
      worker.assigned_search_query = cached.query ?? null;
      worker.display_label = fetchAssignmentDisplayLabel(worker.worker_id, cached);
      return;
    }

    const url = String(worker.current_url || '').trim();

    // Exact URL match first
    let assignment = resolveFetchAssignment(urlSearchAssignments[url], referenceTsMs);
    if (assignment) {
      consumedAssignmentUrls.add(url);
    }

    // Host-level fallback when URL differs from search result URL
    if (!assignment && url) {
      const hostname = safeHostname(url);
      const queue = hostAssignmentQueues[hostname];
      if (queue) {
        while (queue.length > 0 && consumedAssignmentUrls.has(queue[0]._source_url)) {
          queue.shift();
        }
        if (queue.length > 0) {
          const entry = queue.shift();
          consumedAssignmentUrls.add(entry._source_url);
          assignment = entry;
        }
      }
    }

    if (assignment) {
      workerResolvedAssignment[worker.worker_id] = assignment;
    }

    worker.assigned_search_slot = assignment?.slot ?? null;
    worker.assigned_search_attempt_no = assignment?.attempt_no ?? null;
    worker.assigned_result_rank = assignment?.result_rank ?? null;
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
        block_reason: null,
        proxy_url: null,
        retries: toInt(payload.retries, 0),
        fetch_mode: String(payload.fetch_mode || payload.fetcher_kind || '').trim() || null,
        docs_processed: 0,
        fields_extracted: 0,
      };
      if (resolvedPool === 'fetch') {
        base.assigned_search_slot = null;
        base.assigned_search_attempt_no = null;
        base.assigned_result_rank = null;
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
        base.is_fallback = Boolean(payload.is_fallback);
        base.is_lab = Boolean(payload.is_lab);
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
    } else if (type === 'fetch_queued' && resolvedPool === 'fetch') {
      w.state = 'queued';
      w.current_url = extractUrl(evt) || w.current_url;
      applyFetchAssignment(w, parseTsMs(evt?.ts));
    } else if (type === 'fetch_retrying') {
      w.state = 'retrying';
      const retryErr = String(payload.error || '').trim();
      w.last_error = retryErr || w.last_error;
      if (retryErr.startsWith('blocked:')) w.block_reason = retryErr.slice(8);
    } else if (isStartEvent(type)) {
      // WHY: Fetch pool uses crawling/retrying; other pools use running.
      if (w.pool === 'fetch') {
        w.state = toInt(payload.retry_count, 0) > 0 ? 'retrying' : 'crawling';
      } else {
        w.state = 'running';
      }
      w.current_url = extractUrl(evt) || w.current_url;
      w.started_at = String(evt?.ts || '').trim() || w.started_at;
      if (payload.fetch_mode || payload.fetcher_kind) {
        w.fetch_mode = String(payload.fetch_mode || payload.fetcher_kind || '').trim();
      }
      if (w.pool === 'fetch') {
        applyFetchAssignment(w, parseTsMs(evt?.ts));
        const proxyUrl = String(payload.proxy_url || '').trim();
        if (proxyUrl) w.proxy_url = proxyUrl;
        else if (!w.proxy_url) w.proxy_url = null;
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
      w.state = w.pool === 'fetch' ? 'crawled' : 'idle';
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
          // WHY: When the handler detected a content block and threw, the error
          // message carries the block reason as 'blocked:reason'. Parse it first.
          if (w.last_error.startsWith('blocked:')) {
            const reason = w.last_error.slice(8);
            w.block_reason = reason;
            if (reason === 'captcha_detected' || reason === 'cloudflare_challenge') {
              w.state = 'captcha';
            } else if (reason === 'status_429') {
              w.state = 'rate_limited';
            } else if (reason === 'status_403' || reason === 'access_denied') {
              w.state = 'blocked';
            } else {
              w.state = 'failed';
            }
          } else {
            const errLower = w.last_error.toLowerCase();
            if (code === 429) {
              w.state = 'rate_limited';
            } else if (code === 403 || errLower.includes('blocked') || errLower.includes('forbidden')) {
              w.state = 'blocked';
            } else if (errLower.includes('captcha') || errLower.includes('challenge') || errLower.includes('cloudflare')) {
              w.state = 'captcha';
            } else {
              w.state = 'failed';
            }
          }
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
        // WHY: When fallback fires, the finish event overwrites duration_ms.
        // Save the primary attempt's duration so the GUI can show both.
        if (payload.is_fallback && w.duration_ms > 0 && !w.primary_duration_ms) {
          w.primary_duration_ms = w.duration_ms;
        }
        if (payload.prompt_tokens != null) w.prompt_tokens = payload.prompt_tokens;
        if (payload.completion_tokens != null) w.completion_tokens = payload.completion_tokens;
        if (payload.estimated_cost != null) w.estimated_cost = payload.estimated_cost;
        if (payload.duration_ms != null) w.duration_ms = payload.duration_ms;
        if (payload.model != null) w.model = String(payload.model);
        if (payload.output_summary != null) w.output_summary = payload.output_summary;
        if (payload.response_preview != null) w.response_preview = String(payload.response_preview);
        if (payload.is_fallback) w.is_fallback = true;
        w.is_lab = Boolean(payload.is_lab);
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
    if (clean.state === 'running' || clean.state === 'crawling') {
      const startMs = parseTsMs(clean.started_at);
      const elapsed = startMs > 0 ? nowMs - startMs : 0;
      return {
        ...clean,
        elapsed_ms: elapsed,
        state: elapsed > stuckThresholdMs ? 'stuck' : clean.state,
      };
    }
    return { ...clean };
  });
}
