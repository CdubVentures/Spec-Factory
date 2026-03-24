// WHY: Domain Classifier phase of the prefetch pipeline.
// Enqueues approved URLs and seeds candidate URLs into the planner.
// Builds triage metadata map so planner.enqueue() can look up triage labels.
// Enforces domainClassifierUrlCap — the per-run URL count limit for enqueuing.

import { canonicalizeQueueUrl } from '../../../../planner/sourcePlannerUrlUtils.js';
import { configInt } from '../../../../shared/settingsAccessor.js';

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
  // WHY: Build triage metadata map keyed by canonical URL so planner.enqueue()
  // can look up triage labels. Canonical key matches planner dedup normalization.
  const triageMetaMap = new Map();
  for (const candidate of discoveryResult.candidates || []) {
    let canonical;
    try {
      canonical = canonicalizeQueueUrl(new URL(candidate.url));
    } catch {
      logger?.warn?.('domain_classifier_url_skip', {
        url: String(candidate.url || '').slice(0, 200),
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
      // WHY: prefer explicit Search Execution phase selection_priority if present;
      // derive from triage_disposition only as fallback.
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

  // WHY: domainClassifierUrlCap controls how many URLs this stage enqueues
  // into the planner per run. URLs are ranked by triage_score (descending)
  // so the highest-value URLs from the SERP selector survive the cap.
  const urlCap = configInt(config, 'domainClassifierUrlCap');
  const allApprovedUrls = discoveryResult.selectedUrls || [];
  const approvedUrls = _applyUrlCap(allApprovedUrls, urlCap, triageMetaMap);
  const overflowCount = allApprovedUrls.length - approvedUrls.length;

  const candidateUrls = discoveryResult.allCandidateUrls || [];
  for (const url of approvedUrls) {
    const meta = triageMetaMap.size > 0 ? _lookupTriageMeta(url, triageMetaMap) : null;
    planner.enqueue(url, 'discovery_approved', {
      forceApproved: true,
      forceBrandBypass: false,
      triageMeta: meta,
    });
  }
  let seededCount = 0;
  if (candidateUrls.length > 0 && typeof planner?.seedCandidates === 'function') {
    planner.seedCandidates(candidateUrls, { triageMetaMap });
    seededCount = candidateUrls.length;
  }

  if (planner.enqueueCounters) {
    const counters = planner.enqueueCounters;
    logger?.info?.('discovery_enqueue_summary', {
      ...counters,
      input_selected_count: allApprovedUrls.length,
      enqueued_count: approvedUrls.length,
      overflow_count: overflowCount,
      domain_classifier_url_cap: urlCap,
      input_candidate_count: candidateUrls.length,
    });
  }

  return {
    enqueuedCount: approvedUrls.length,
    seededCount,
    overflowCount,
  };
}

function _applyUrlCap(urls, cap, triageMetaMap) {
  if (!cap || cap <= 0 || urls.length <= cap) return urls;
  // WHY: Sort by triage_score descending so the highest-ranked URLs survive.
  const scored = urls.map((url) => {
    const meta = _lookupTriageMeta(url, triageMetaMap);
    return { url, score: meta?.triage_score ?? 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, cap).map((entry) => entry.url);
}

function _lookupTriageMeta(url, triageMetaMap) {
  if (!triageMetaMap || triageMetaMap.size === 0) return null;
  try {
    const parsed = new URL(url);
    const canonical = canonicalizeQueueUrl(parsed);
    if (triageMetaMap.has(canonical)) return triageMetaMap.get(canonical);
    const normalized = parsed.toString();
    if (triageMetaMap.has(normalized)) return triageMetaMap.get(normalized);
  } catch {
    // Fall through
  }
  if (triageMetaMap.has(url)) return triageMetaMap.get(url);
  return null;
}
