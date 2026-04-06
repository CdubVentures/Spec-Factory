// WHY: Domain Classifier phase of the prefetch pipeline.
// Builds triage metadata, applies URL cap, sorts by SERP slot+rank, assigns
// worker IDs, and returns an ordered fetch plan. Replaces SourcePlanner for
// the discovery-approved path.

import { normalizeHost } from '../../../../shared/hostParser.js';
import { configInt } from '../../../../shared/settingsAccessor.js';

// ── Inlined from sourcePlannerUrlUtils (sole consumer after planner removal) ──

function canonicalizeQueueUrl(parsedUrl) {
  const normalized = new URL(parsedUrl.toString());
  normalized.hash = '';
  normalized.searchParams.sort();
  if (normalized.pathname.length > 1 && normalized.pathname.endsWith('/')) {
    normalized.pathname = normalized.pathname.slice(0, -1);
  }
  return normalized.toString();
}

function lookupTriageMeta(url, triageMetaMap) {
  if (!triageMetaMap || triageMetaMap.size === 0) return null;
  try {
    const parsed = new URL(url);
    const canonical = canonicalizeQueueUrl(parsed);
    if (triageMetaMap.has(canonical)) return triageMetaMap.get(canonical);
    const normalized = parsed.toString();
    if (triageMetaMap.has(normalized)) return triageMetaMap.get(normalized);
  } catch { /* fall through */ }
  if (triageMetaMap.has(url)) return triageMetaMap.get(url);
  return null;
}

function safeHostname(url) {
  try { return normalizeHost(new URL(url).hostname); } catch { return ''; }
}

// ── Sort (moved from runCrawlProcessingLifecycle) ──

// WHY: Sort all entries strictly by search slot then SERP rank.
// Seed/manufacturer URLs without triage_passthrough get slot assignments
// via host-level fallback (same host as a slotted search result URL).
export function sortBySlotRank(sources) {
  const hostSlotMap = {};
  for (const source of sources) {
    const slot = source.triage_passthrough?.search_slot;
    const rank = source.triage_passthrough?.search_rank;
    if (!slot || rank == null) continue;
    const host = safeHostname(source.url);
    if (!host) continue;
    if (!hostSlotMap[host]
        || slot < hostSlotMap[host].slot
        || (slot === hostSlotMap[host].slot && rank < hostSlotMap[host].rank)) {
      hostSlotMap[host] = { slot, rank };
    }
  }

  const consumedHosts = new Set();
  for (const source of sources) {
    if (source.triage_passthrough?.search_slot) continue;
    const host = safeHostname(source.url);
    const fallback = hostSlotMap[host];
    if (fallback && !consumedHosts.has(host)) {
      if (!source.triage_passthrough) source.triage_passthrough = {};
      source.triage_passthrough.search_slot = fallback.slot;
      source.triage_passthrough.search_rank = fallback.rank;
      consumedHosts.add(host);
    }
  }

  sources.sort((a, b) => {
    const slotA = a.triage_passthrough?.search_slot ?? '\xff';
    const slotB = b.triage_passthrough?.search_slot ?? '\xff';
    if (slotA !== slotB) return slotA < slotB ? -1 : 1;
    const rankA = a.triage_passthrough?.search_rank ?? Infinity;
    const rankB = b.triage_passthrough?.search_rank ?? Infinity;
    return rankA - rankB;
  });
}

// ── Legacy entry point (kept during transition, consumed by domainClassifierPhase) ──

/**
 * @param {object} ctx
 * @returns {{ enqueuedCount: number, seededCount: number, overflowCount: number }}
 */
export function runDomainClassifier({
  discoveryResult,
  planner,
  config,
  logger,
}) {
  const triageMetaMap = _buildTriageMetaMap(discoveryResult, logger);
  const urlCap = configInt(config, 'domainClassifierUrlCap');
  const allApprovedUrls = discoveryResult.selectedUrls || [];
  const approvedUrls = _applyUrlCap(allApprovedUrls, urlCap, triageMetaMap);
  const overflowCount = allApprovedUrls.length - approvedUrls.length;

  for (const url of approvedUrls) {
    const meta = triageMetaMap.size > 0 ? lookupTriageMeta(url, triageMetaMap) : null;
    planner.enqueue(url, 'discovery_approved', {
      forceApproved: true,
      forceBrandBypass: false,
      triageMeta: meta,
    });
  }

  if (planner.enqueueCounters) {
    logger?.info?.('discovery_enqueue_summary', {
      ...planner.enqueueCounters,
      input_selected_count: allApprovedUrls.length,
      enqueued_count: approvedUrls.length,
      overflow_count: overflowCount,
      domain_classifier_url_cap: urlCap,
      input_candidate_count: (discoveryResult.allCandidateUrls || []).length,
    });
  }

  return { enqueuedCount: approvedUrls.length, seededCount: 0, overflowCount };
}

// ── New entry point: returns ordered fetch plan instead of enqueuing to planner ──

/**
 * Merges all URL sources (seeds, learning seeds, discovery-approved), filters
 * blocked hosts, applies URL cap, sorts by SERP slot+rank, assigns worker IDs,
 * and emits source_fetch_queued events for the GUI.
 *
 * @returns {{ orderedSources: object[], workerIdMap: Map, stats: object }}
 */
export function buildOrderedFetchPlan({
  discoveryResult,
  blockedHosts = new Set(),
  config,
  logger,
}) {
  const triageMetaMap = _buildTriageMetaMap(discoveryResult, logger);

  // 1. Apply URL cap to discovery-approved URLs
  const urlCap = configInt(config, 'domainClassifierUrlCap');
  const allApprovedUrls = discoveryResult.selectedUrls || [];
  const approvedUrls = _applyUrlCap(allApprovedUrls, urlCap, triageMetaMap);
  const overflowCount = allApprovedUrls.length - approvedUrls.length;

  // 2. Build source rows from all URL sources
  const sources = [];
  for (const url of approvedUrls) {
    sources.push(_buildSourceRow(url, 'discovery_approved', triageMetaMap));
  }

  // 3. Filter blocked hosts
  const blockedCount = { count: 0, hosts: [] };
  const filtered = sources.filter((row) => {
    const host = safeHostname(row.url);
    if (host && _hostInSet(host, blockedHosts)) {
      blockedCount.count++;
      blockedCount.hosts.push(host);
      return false;
    }
    return true;
  });

  // 4. Sort by slot+rank
  sortBySlotRank(filtered);

  // 5. Assign worker IDs and emit GUI events
  let workerSeq = 0;
  const workerIdMap = new Map();
  for (const source of filtered) {
    workerSeq++;
    const workerId = `fetch-${workerSeq}`;
    source.workerId = workerId;
    workerIdMap.set(source.url, workerId);
    logger?.info?.('source_fetch_queued', {
      worker_id: workerId,
      url: source.url,
      host: safeHostname(source.url),
      state: 'queued',
      seq: workerSeq,
    });
  }

  logger?.info?.('crawl_phase_started', {
    total_queued: workerSeq,
    stage_cursor: 'stage:crawl',
  });

  logger?.info?.('discovery_enqueue_summary', {
    input_selected_count: allApprovedUrls.length,
    enqueued_count: approvedUrls.length,
    overflow_count: overflowCount,
    domain_classifier_url_cap: urlCap,
    blocked_count: blockedCount.count,
    total_fetch_plan: filtered.length,
  });

  return {
    orderedSources: filtered,
    workerIdMap,
    stats: {
      total_queued: workerSeq,
      approved_count: approvedUrls.length,
      overflow_count: overflowCount,
      blocked_count: blockedCount.count,
      blocked_hosts: blockedCount.hosts,
    },
  };
}

// ── Private helpers ──

function _buildTriageMetaMap(discoveryResult, logger) {
  const triageMetaMap = new Map();
  for (const candidate of discoveryResult.candidates || []) {
    let canonical;
    try {
      canonical = canonicalizeQueueUrl(new URL(candidate.url));
    } catch {
      logger?.warn?.('domain_classifier_url_skip', {
        url: String(candidate.url || ''),
        reason: 'malformed_url',
      });
      continue;
    }
    triageMetaMap.set(canonical, {
      raw_url: candidate.original_url || candidate.url,
      normalized_url: candidate.url,
      canonical_url: canonical,
      identity_prelim: candidate.identity_prelim || null,
      host_trust_class: candidate.host_trust_class || null,
      doc_kind_guess: candidate.doc_kind_guess || null,
      extraction_surface_prior: candidate.extraction_surface_prior || null,
      primary_lane: candidate.primary_lane || null,
      triage_disposition: candidate.triage_disposition || null,
      approval_bucket: candidate.approval_bucket || null,
      selection_priority: candidate.selection_priority
        || (candidate.triage_disposition === 'fetch_high' ? 'high'
          : candidate.triage_disposition === 'fetch_normal' ? 'medium'
          : candidate.triage_disposition === 'fetch_low' ? 'low'
          : 'low'),
      soft_reason_codes: candidate.soft_reason_codes || null,
      triage_score: candidate.score ?? candidate.triage_score ?? 0,
      query_family: candidate.query_family || null,
      target_fields: candidate.target_fields || null,
      hint_source: candidate.hint_source || null,
      doc_hint: candidate.doc_hint || null,
      domain_hint: candidate.domain_hint || null,
      providers: candidate.providers || null,
      search_slot: candidate.search_slot || null,
      search_rank: candidate.search_rank ?? null,
    });
  }
  return triageMetaMap;
}

function _buildSourceRow(url, discoveredFrom, triageMetaMap) {
  const meta = lookupTriageMeta(url, triageMetaMap);
  return {
    url,
    host: safeHostname(url),
    discoveredFrom,
    triageMeta: meta,
    triage_passthrough: meta ? {
      search_slot: meta.search_slot,
      search_rank: meta.search_rank,
      triage_score: meta.triage_score,
    } : null,
  };
}

function _applyUrlCap(urls, cap, triageMetaMap) {
  if (!cap || cap <= 0 || urls.length <= cap) return urls;
  const scored = urls.map((url) => {
    const meta = lookupTriageMeta(url, triageMetaMap);
    return { url, score: meta?.triage_score ?? 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, cap).map((entry) => entry.url);
}

function _hostInSet(host, hostSet) {
  if (hostSet.has(host)) return true;
  for (const candidate of hostSet) {
    if (host.endsWith(`.${candidate}`)) return true;
  }
  return false;
}
