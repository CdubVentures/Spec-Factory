import {
  toInt, toFloat, toArray,
  extractEventUrls, extractPrimaryEventUrl, extractHost,
  eventType, payloadOf,
  fetchStatusCode, sourceProcessedParseMethod, parseFinishedMethod,
  buildScreenshotRecord,
} from './runtimeOpsEventPrimitives.js';
import {
  toSourceIndexingPackets, packetPrimaryUrl,
  packetMatchesWorkerUrls, packetFieldKeyCount,
  collectPacketAssertions, buildPhaseLineage,
  classifyWorkerEventMatch,
  buildPhaseLineageFromSourcePackets, buildPhaseLineageFromRuntimeTelemetry,
} from './runtimeOpsPhaseLineage.js';
import { collectPreviewExtractionFields } from './runtimeOpsExtractionFieldBuilders.js';
import { inferPool } from './runtimeOpsWorkerPoolBuilders.js';

function resolveWorkerTelemetryUrl(event, workerUrls = new Set()) {
  const eventUrls = extractEventUrls(event);
  const matchedUrl = eventUrls.find((url) => workerUrls.has(url));
  if (matchedUrl) return matchedUrl;

  const primaryUrl = extractPrimaryEventUrl(event);
  if (primaryUrl && workerUrls.has(primaryUrl)) return primaryUrl;

  if (primaryUrl) return primaryUrl;
  if (eventUrls.length > 0) return eventUrls[0];
  if (workerUrls.size === 1) return [...workerUrls][0];
  return '';
}

function collectIndexedFieldNames(events, workerId, workerUrls = new Set()) {
  const names = new Set();

  for (const evt of events) {
    if (eventType(evt) !== 'index_finished') continue;

    const payload = payloadOf(evt);
    const evtWorkerId = String(payload.worker_id || '').trim();
    const url = resolveWorkerTelemetryUrl(evt, workerUrls);
    if (!url) continue;
    if (evtWorkerId !== String(workerId || '').trim() && !workerUrls.has(url)) continue;

    for (const field of toArray(payload.filled_fields)) {
      const normalized = String(field || '').trim();
      if (normalized) names.add(normalized);
    }
  }

  return [...names].sort();
}

export function buildWorkerDetail(events, workerId, options = {}) {
  const targetId = String(workerId || '').trim();
  const sourcePackets = toSourceIndexingPackets(options.sourceIndexingPacketCollection);

  // Detect pool from worker events
  let detectedPool = 'fetch';
  const workerEvents = [];
  for (const evt of events) {
    const payload = payloadOf(evt);
    const evtWorkerId = String(payload.worker_id || '').trim();
    if (evtWorkerId !== targetId) continue;
    workerEvents.push(evt);
    const type = eventType(evt);
    const pool = inferPool(type);
    if (pool === 'search' || pool === 'llm') detectedPool = pool;
  }

  // Search worker detail
  if (detectedPool === 'search') {
    // Build query → resolved results from search_results_collected events (all events, not just worker)
    const queryResultsMap = {};
    const urlToFetchWorker = {};
    const triageByUrl = {};
    const hostToFetchWorkers = {};
    // Track queries assigned to ANY search worker (for multi-worker reconciliation)
    const queriesTrackedByAnyWorker = new Set();
    for (const evt of events) {
      const type = eventType(evt);
      const payload = payloadOf(evt);
      if ((type === 'search_started' || type === 'search_finished') && String(payload.scope || '').trim() === 'query') {
        const trackedQ = String(payload.current_query || payload.query || '').trim().toLowerCase();
        if (trackedQ) queriesTrackedByAnyWorker.add(trackedQ);
      }
      if (type === 'search_results_collected' && (payload.scope === 'query' || payload.scope === 'frontier_cache')) {
        const rawQ = String(payload.query || '').trim();
        const q = rawQ.toLowerCase();
        if (q) {
          queryResultsMap[q] = {
            query: rawQ,
            resolved_provider: String(payload.provider || '').trim(),
            results: Array.isArray(payload.results) ? payload.results.map((r, i) => ({
              url: String(r?.url || '').trim(),
              domain: String(r?.domain || '').trim(),
              title: String(r?.title || '').trim(),
              rank: toInt(r?.rank, i + 1),
              provider: String(r?.provider || payload.provider || '').trim(),
              fetch_worker_id: null,
              fetched: false,
              fetch_link_type: 'none',
              decision: 'unknown',
              score: 0,
              rationale: '',
              score_components: null,
            })) : [],
          };
        }
      }
      if (type === 'serp_selector_completed' && Array.isArray(payload.candidates)) {
        for (const c of payload.candidates) {
          const url = String(c?.url || '').trim();
          if (url) {
            triageByUrl[url] = {
              decision: String(c?.decision || 'unknown').trim(),
              score: Number(c?.score) || 0,
              rationale: String(c?.rationale || '').trim(),
              score_components: c?.score_components && typeof c.score_components === 'object'
                ? c.score_components
                : null,
            };
          }
        }
      }
      if (type === 'fetch_started' && payload.scope === 'url' && payload.url && payload.worker_id) {
        const fetchUrl = String(payload.url).trim();
        const fetchWid = String(payload.worker_id).trim();
        urlToFetchWorker[fetchUrl] = fetchWid;
        let fetchHost;
        try { fetchHost = new URL(fetchUrl).hostname.replace(/^www\./, ''); } catch { fetchHost = ''; }
        if (fetchHost) {
          if (!hostToFetchWorkers[fetchHost]) hostToFetchWorkers[fetchHost] = [];
          hostToFetchWorkers[fetchHost].push({ worker_id: fetchWid, url: fetchUrl });
        }
      }
    }
    // Link fetched URLs + triage decisions to their search results
    for (const qr of Object.values(queryResultsMap)) {
      for (const r of qr.results) {
        // Exact URL fetch match
        const fetchWid = urlToFetchWorker[r.url];
        if (fetchWid) {
          r.fetch_worker_id = fetchWid;
          r.fetched = true;
          r.fetch_link_type = 'exact';
        } else {
          // Host-level fetch fallback
          const host = (r.domain || '').replace(/^www\./, '');
          const hostWorkers = hostToFetchWorkers[host];
          if (hostWorkers && hostWorkers.length > 0) {
            r.fetch_worker_id = hostWorkers[0].worker_id;
            r.fetched = true;
            r.fetch_link_type = 'host_fallback';
          }
        }
        // Triage enrichment
        const triage = triageByUrl[r.url];
        if (triage) {
          r.decision = triage.decision;
          r.score = triage.score;
          r.rationale = triage.rationale;
          r.score_components = triage.score_components;
        }
      }
    }

    const history = [];
    let attemptNo = 0;
    for (const evt of workerEvents) {
      const type = eventType(evt);
      const payload = payloadOf(evt);
      const ts = String(evt?.ts || '').trim();
      if (type === 'search_started') {
        attemptNo += 1;
        const rawQuery = String(payload.current_query || payload.query || '').trim();
        const rawProvider = String(payload.current_provider || payload.provider || '').trim();
        const qMatch = queryResultsMap[rawQuery.toLowerCase()];
        history.push({
          attempt_no: attemptNo,
          query: rawQuery,
          provider: rawProvider,
          resolved_provider: qMatch?.resolved_provider || null,
          status: 'running',
          result_count: 0,
          duration_ms: 0,
          started_ts: ts,
          finished_ts: null,
          results: qMatch?.results || [],
        });
      } else if (type === 'search_finished') {
        const match = history.find((h) => h.status === 'running');
        if (match) {
          match.status = toInt(payload.result_count, 0) === 0 ? 'zero' : 'done';
          match.result_count = toInt(payload.result_count, 0);
          match.duration_ms = toInt(payload.duration_ms, 0);
          match.finished_ts = ts;
          // Backfill resolved provider + results if not set from search_started
          if (!match.resolved_provider || match.results.length === 0) {
            const rawQ = String(payload.current_query || payload.query || '').trim();
            const qMatch = queryResultsMap[rawQ.toLowerCase()];
            if (qMatch) {
              if (!match.resolved_provider) match.resolved_provider = qMatch.resolved_provider;
              if (match.results.length === 0) match.results = qMatch.results;
            }
          }
        } else {
          attemptNo += 1;
          const rawQuery = String(payload.current_query || payload.query || '').trim();
          const rawProvider = String(payload.current_provider || payload.provider || '').trim();
          const qMatch = queryResultsMap[rawQuery.toLowerCase()];
          history.push({
            attempt_no: attemptNo,
            query: rawQuery,
            provider: rawProvider,
            resolved_provider: qMatch?.resolved_provider || null,
            status: toInt(payload.result_count, 0) === 0 ? 'zero' : 'done',
            result_count: toInt(payload.result_count, 0),
            duration_ms: toInt(payload.duration_ms, 0),
            started_ts: null,
            finished_ts: ts,
            results: qMatch?.results || [],
          });
        }
      }
    }
    // Reconcile: add search_results_collected queries that have no search_started/search_finished
    // events in ANY worker (older runs where broad queries bypassed worker tracking).
    // Only add to this worker if the query is completely untracked — otherwise it belongs to another worker.
    const historyQuerySet = new Set(history.map((h) => h.query.toLowerCase()));
    for (const [qKey, qr] of Object.entries(queryResultsMap)) {
      if (historyQuerySet.has(qKey)) continue;
      if (queriesTrackedByAnyWorker.has(qKey)) continue;
      attemptNo += 1;
      history.push({
        attempt_no: attemptNo,
        query: qr.query || qKey,
        provider: qr.resolved_provider || '',
        resolved_provider: qr.resolved_provider || null,
        status: qr.results.length > 0 ? 'done' : 'zero',
        result_count: qr.results.length,
        duration_ms: 0,
        started_ts: null,
        finished_ts: null,
        results: qr.results,
      });
    }
    history.sort((a, b) => b.attempt_no - a.attempt_no);
    return {
      worker_id: targetId,
      search_history: history,
      documents: [],
      extraction_fields: [],
      queue_jobs: [],
      screenshots: [],
      phase_lineage: buildPhaseLineage([]),
    };
  }

  // LLM worker detail
  if (detectedPool === 'llm') {
    let llmDetail = null;
    for (const evt of workerEvents) {
      const type = eventType(evt);
      const payload = payloadOf(evt);
      if (type === 'llm_started' || type === 'llm_finished' || type === 'llm_failed') {
        if (!llmDetail) {
          llmDetail = {
            call_type: payload.call_type != null ? String(payload.call_type) : null,
            round: payload.round != null ? toInt(payload.round, 1) : null,
            model: payload.model != null ? String(payload.model) : null,
            prompt_tokens: payload.prompt_tokens ?? null,
            completion_tokens: payload.completion_tokens ?? null,
            estimated_cost: payload.estimated_cost ?? null,
            duration_ms: payload.duration_ms ?? null,
            input_summary: payload.input_summary ?? null,
            output_summary: payload.output_summary ?? null,
            prefetch_tab: payload.prefetch_tab ?? null,
            prompt_preview: payload.prompt_preview != null ? String(payload.prompt_preview) : null,
            response_preview: payload.response_preview != null ? String(payload.response_preview) : null,
          };
        }
        // Merge completion fields from finished/failed events
        if (type === 'llm_finished' || type === 'llm_failed') {
          if (payload.completion_tokens != null) llmDetail.completion_tokens = payload.completion_tokens;
          if (payload.estimated_cost != null) llmDetail.estimated_cost = payload.estimated_cost;
          if (payload.duration_ms != null) llmDetail.duration_ms = payload.duration_ms;
          if (payload.output_summary != null) llmDetail.output_summary = payload.output_summary;
          if (payload.prompt_tokens != null) llmDetail.prompt_tokens = payload.prompt_tokens;
          if (payload.response_preview != null) llmDetail.response_preview = String(payload.response_preview);
        }
        if (payload.prompt_preview != null) {
          llmDetail.prompt_preview = String(payload.prompt_preview);
        }
      }
    }
    return {
      worker_id: targetId,
      llm_detail: llmDetail || {},
      documents: [],
      extraction_fields: [],
      queue_jobs: [],
      screenshots: [],
      phase_lineage: buildPhaseLineage([]),
    };
  }

  // Fetch worker detail
  const workerUrls = new Set();
  const workerHosts = new Set();

  for (const evt of events) {
    const payload = payloadOf(evt);
    const evtWorkerId = String(payload.worker_id || '').trim();
    if (evtWorkerId !== targetId) continue;

    const type = eventType(evt);
    if (type === 'fetch_started' || type === 'fetch_finished' || type === 'source_processed' || type === 'parse_finished' || type === 'index_finished') {
      for (const url of extractEventUrls(evt)) {
        if (!url) continue;
        workerUrls.add(url);
        workerHosts.add(extractHost(url));
      }
    }
  }

  const matchedSourcePackets = sourcePackets.filter((packet) => packetMatchesWorkerUrls(packet, workerUrls));

  const documents = [];
  const docMap = {};
  for (const evt of events) {
    const match = classifyWorkerEventMatch(evt, targetId, workerUrls);
    if (!match.matches) continue;
    const url = match.url;

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
        parse_method: null,
        last_event_ts: ts,
      };
    }

    const doc = docMap[url];
    if (ts > doc.last_event_ts) doc.last_event_ts = ts;

    if (type === 'fetch_started') doc.status = 'fetching';
    else if (type === 'fetch_finished') {
      const code = fetchStatusCode(payload, 0);
      doc.status = code >= 200 && code < 400 ? 'fetched' : 'fetch_error';
      doc.status_code = code || null;
      doc.bytes = toInt(payload.bytes, null);
      doc.content_type = String(payload.content_type || '').trim() || null;
    } else if (type === 'parse_finished') {
      doc.status = 'parsed';
      doc.parse_method = parseFinishedMethod(payload) || doc.parse_method;
    }
    else if (type === 'source_processed') {
      doc.status = 'parsed';
      doc.status_code = fetchStatusCode(payload, doc.status_code);
      doc.bytes = toInt(payload.bytes, doc.bytes);
      doc.content_type = String(payload.content_type || '').trim() || doc.content_type;
      doc.parse_method = sourceProcessedParseMethod(payload) || doc.parse_method;
    }
    else if (type === 'index_finished') doc.status = 'indexed';
  }
  for (const packet of matchedSourcePackets) {
    const url = packetPrimaryUrl(packet);
    if (!url) continue;
    if (!docMap[url]) {
      docMap[url] = {
        url,
        host: extractHost(url),
        status: 'discovered',
        status_code: null,
        bytes: null,
        content_type: null,
        parse_method: null,
        last_event_ts: '',
      };
    }
    const doc = docMap[url];
    const runMeta = packet?.run_meta && typeof packet.run_meta === 'object'
      ? packet.run_meta
      : {};
    const packetFieldCount = packetFieldKeyCount(packet);
    const packetStatusCode = toInt(runMeta.http_status, doc.status_code);
    if (packetStatusCode > 0) doc.status_code = packetStatusCode;
    doc.content_type = String(runMeta.content_type || '').trim() || doc.content_type;
    const packetFinishedAt = String(runMeta.finished_at || runMeta.started_at || '').trim();
    if (packetFinishedAt && packetFinishedAt > doc.last_event_ts) {
      doc.last_event_ts = packetFinishedAt;
    }
    if (packetFieldCount > 0) {
      doc.status = 'indexed';
    } else if (String(runMeta.fetch_status || '').trim() === 'fetched' && doc.status !== 'fetch_error') {
      doc.status = 'parsed';
    }
  }
  documents.push(...Object.values(docMap));

  const extractionFields = [];
  for (const evt of events) {
    const type = eventType(evt);
    if (type !== 'source_processed') continue;

    const payload = payloadOf(evt);
    const match = classifyWorkerEventMatch(evt, targetId, workerUrls);
    if (!match.matches) continue;
    const url = match.url;

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
  const existingFieldKeys = new Set(extractionFields.map((row) => `${row.field}|${row.source_url}`));
  for (const packet of matchedSourcePackets) {
    const { bestFields } = collectPacketAssertions(packet);
    for (const field of bestFields) {
      const dedupeKey = `${field.field}|${field.source_url}`;
      if (existingFieldKeys.has(dedupeKey)) continue;
      existingFieldKeys.add(dedupeKey);
      extractionFields.push({
        field: field.field,
        value: field.value,
        confidence: field.confidence,
        method: field.method,
        source_url: field.source_url,
      });
    }
  }
  extractionFields.push(...collectPreviewExtractionFields(events, workerUrls, existingFieldKeys));
  const extractedFieldNames = new Set(
    extractionFields
      .map((row) => String(row?.field || '').trim())
      .filter(Boolean),
  );
  const indexedFieldNames = matchedSourcePackets.length === 0
    ? collectIndexedFieldNames(events, targetId, workerUrls)
      .filter((field) => !extractedFieldNames.has(field))
    : [];

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
  const seenScreenshots = new Set();
  for (const evt of events) {
    const type = eventType(evt);
    if (type !== 'visual_asset_captured' && type !== 'parse_finished') continue;

    const payload = payloadOf(evt);
    const match = classifyWorkerEventMatch(evt, targetId, workerUrls);
    if (!match.matches) continue;

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
  for (const packet of matchedSourcePackets) {
    const artifactIndex = packet?.artifact_index && typeof packet.artifact_index === 'object'
      ? packet.artifact_index
      : {};
    for (const artifact of Object.values(artifactIndex)) {
      if (String(artifact?.artifact_kind || '').trim() !== 'screenshot') continue;
      const filename = String(artifact?.local_path || '').trim();
      if (!filename) continue;
      const pseudoEvent = {
        ts: String(packet?.run_meta?.finished_at || packet?.run_meta?.started_at || '').trim(),
        url: packetPrimaryUrl(packet),
        event: 'source_packet_screenshot',
      };
      const record = buildScreenshotRecord(
        pseudoEvent,
        { screenshot_uri: filename },
        'source_packet',
        options,
      );
      if (!record) continue;
      const dedupeKey = `${record.filename}|${record.url}`;
      if (seenScreenshots.has(dedupeKey)) continue;
      seenScreenshots.add(dedupeKey);
      screenshots.push(record);
    }
  }

  return {
    worker_id: targetId,
    documents,
    extraction_fields: extractionFields,
    indexed_field_names: indexedFieldNames,
    queue_jobs: queueJobs,
    screenshots,
    phase_lineage: matchedSourcePackets.length > 0
      ? buildPhaseLineageFromSourcePackets(matchedSourcePackets, extractionFields, {
        events,
        workerId: targetId,
        workerUrls,
      })
      : buildPhaseLineageFromRuntimeTelemetry(events, targetId, workerUrls, extractionFields),
  };
}
