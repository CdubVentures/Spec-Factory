// WHY: Stage 08 of the prefetch pipeline — Domain Classifier.
// Enqueues approved URLs and seeds candidate URLs into the planner.
// Builds triage metadata map so planner.enqueue() can look up triage labels.

import { canonicalizeQueueUrl } from '../../../../planner/sourcePlannerUrlUtils.js';
import { configInt } from '../../../../shared/settingsAccessor.js';

/**
 * @param {object} ctx
 * @returns {{ enqueuedCount: number, seededCount: number }}
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
      // WHY: prefer explicit Stage 06 selection_priority if present;
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
    });
  }

  for (const url of discoveryResult.approvedUrls || []) {
    const meta = triageMetaMap.size > 0 ? _lookupTriageMeta(url, triageMetaMap) : null;
    planner.enqueue(url, 'discovery_approved', { forceApproved: true, forceBrandBypass: false, triageMeta: meta });
  }
  let seededCount = 0;
  if (discoveryResult.enabled) {
    const serpCap = configInt(config, 'serpSelectorUrlCap');
    const dcCap = configInt(config, 'domainClassifierUrlCap');
    // WHY: domain classifier count must never exceed serp selector count.
    const urlCount = Math.min(dcCap, serpCap);
    if (urlCount > 0) {
      const capped = (discoveryResult.candidateUrls || []).slice(0, urlCount);
      planner.seedCandidates(capped, { triageMetaMap });
      seededCount = capped.length;
    }
  }

  if (planner.enqueueCounters) {
    const counters = planner.enqueueCounters;
    logger?.info?.('discovery_enqueue_summary', {
      ...counters,
      input_approved_count: (discoveryResult.approvedUrls || []).length,
      input_candidate_count: (discoveryResult.candidateUrls || []).length,
    });
  }

  return {
    enqueuedCount: (discoveryResult.approvedUrls || []).length,
    seededCount,
  };
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
