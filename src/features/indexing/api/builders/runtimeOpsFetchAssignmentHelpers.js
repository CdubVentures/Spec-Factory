/**
 * Shared helpers for resolving fetch worker display labels from search slot assignments.
 * Used by both runtimeOpsWorkerPoolBuilders and runtimeOpsFetchBuilders.
 */

import { toInt, parseTsMs, eventType, payloadOf } from './runtimeOpsEventPrimitives.js';
import { normalizeHost } from '../../pipeline/shared/hostParser.js';

function searchQueryKey(query) {
  return String(query || '').trim().toLowerCase();
}

function safeHostname(url) {
  try { return normalizeHost(new URL(url).hostname); } catch { return ''; }
}

/**
 * Compute display label from worker ID + search assignment.
 * Returns `fetch-{slot}{rank}` when assignment exists, otherwise the raw workerId.
 */
export function fetchAssignmentDisplayLabel(workerId, assignment) {
  const slot = String(assignment?.slot || '').trim().toLowerCase();
  const rank = toInt(assignment?.result_rank, 0);
  if (!slot || rank <= 0) return workerId;
  return `fetch-${slot}${rank}`;
}

/**
 * Build a URL → search assignment map from the event stream.
 * Returns { urlSearchAssignments } where each key is a URL string
 * and the value is an array of { slot, result_rank, query, search_worker_id, collected_ts_ms }.
 */
export function buildUrlSearchAssignmentMap(events) {
  const latestSearchAssignmentByQuery = {};
  const urlSearchAssignments = {};

  for (const evt of events) {
    const type = eventType(evt);
    const p = payloadOf(evt);

    if (type === 'search_started' && String(p.scope || '').trim() === 'query') {
      const searchWorkerId = String(p.worker_id || '').trim();
      const query = String(p.current_query ?? p.query ?? '').trim();
      const queryKey = searchQueryKey(query);
      if (!searchWorkerId || !queryKey) continue;
      latestSearchAssignmentByQuery[queryKey] = {
        search_worker_id: searchWorkerId,
        slot: p.slot != null ? String(p.slot) : null,
        query,
        collected_ts_ms: parseTsMs(evt?.ts),
      };
      continue;
    }

    if (type === 'search_results_collected' && String(p.scope || '').trim() === 'query' && p.query) {
      const query = String(p.query || '').trim();
      const queryKey = searchQueryKey(query);
      if (!queryKey) continue;
      const assignment = latestSearchAssignmentByQuery[queryKey];
      if (!assignment) continue;
      const collectedTsMs = parseTsMs(evt?.ts);
      const results = Array.isArray(p.results) ? p.results : [];
      for (const result of results) {
        const resultUrl = String(result?.url || '').trim();
        if (!resultUrl) continue;
        if (!urlSearchAssignments[resultUrl]) urlSearchAssignments[resultUrl] = [];
        urlSearchAssignments[resultUrl].push({
          ...assignment,
          collected_ts_ms: collectedTsMs,
          result_rank: toInt(result?.rank, 0),
        });
      }
    }
  }

  return urlSearchAssignments;
}

/**
 * Build a worker_id → { display_label, url, host } map.
 * Correlates source_fetch_started events with search assignments.
 */
export function buildWorkerDisplayLabelMap(events) {
  const urlAssignments = buildUrlSearchAssignmentMap(events);
  const workerMap = {};

  // WHY: Host-level fallback for workers whose URL differs from the SERP URL.
  const hostQueues = {};
  const consumedUrls = new Set();
  for (const [url, assignments] of Object.entries(urlAssignments)) {
    const hostname = safeHostname(url);
    if (!hostname) continue;
    for (const a of assignments) {
      if (!hostQueues[hostname]) hostQueues[hostname] = [];
      hostQueues[hostname].push({ ...a, _source_url: url });
    }
  }
  for (const queue of Object.values(hostQueues)) {
    queue.sort((a, b) => {
      const slotCmp = String(a.slot || '').localeCompare(String(b.slot || ''));
      if (slotCmp !== 0) return slotCmp;
      return toInt(a.result_rank, 999) - toInt(b.result_rank, 999);
    });
  }

  for (const evt of events) {
    // WHY: The bridge transforms 'source_fetch_started' → 'fetch_started' in NDJSON.
    if (eventType(evt) !== 'fetch_started') continue;
    const p = payloadOf(evt);
    const workerId = String(p.worker_id || '').trim();
    const url = String(p.url || '').trim();
    if (!workerId) continue;

    const host = url ? safeHostname(url) : '';

    // Exact URL match
    let assignment = null;
    const urlCandidates = urlAssignments[url];
    if (urlCandidates && urlCandidates.length > 0) {
      assignment = urlCandidates[0];
      consumedUrls.add(url);
    }

    // Host-level fallback
    if (!assignment && host) {
      const queue = hostQueues[host];
      if (queue) {
        while (queue.length > 0 && consumedUrls.has(queue[0]._source_url)) {
          queue.shift();
        }
        if (queue.length > 0) {
          const entry = queue.shift();
          consumedUrls.add(entry._source_url);
          assignment = entry;
        }
      }
    }

    workerMap[workerId] = {
      display_label: fetchAssignmentDisplayLabel(workerId, assignment),
      url,
      host,
    };
  }

  return workerMap;
}
