// WHY: Stage 08 of the prefetch pipeline — Domain Classifier.
// Enqueues approved URLs and seeds candidate URLs into the planner.
// Builds triage metadata map so planner.enqueue() can look up triage labels.

import { z } from 'zod';
import { canonicalizeQueueUrl } from '../../../../planner/sourcePlannerUrlUtils.js';

export const domainClassifierInputSchema = z.object({
  discoveryResult: z.object({
    candidates: z.array(z.unknown()).optional().default([]),
    approvedUrls: z.array(z.string()).optional().default([]),
    selectedUrls: z.array(z.string()).optional().default([]),
    candidateUrls: z.array(z.string()).optional().default([]),
  }).passthrough(),
  planner: z.object({
    enqueue: z.custom((v) => typeof v === 'function', { message: 'planner.enqueue must be a function' }),
  }).passthrough(),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  logger: z.unknown().optional().default(null),
}).passthrough();

export const domainClassifierOutputSchema = z.object({
  enqueuedCount: z.number(),
  seededCount: z.number(),
}).passthrough();

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

  // WHY: Single enqueue path — triage metadata drives queue routing.
  // No caps, no approved/candidate split. SERP selector already decided what survives.
  const approvedUrls = discoveryResult.approvedUrls || discoveryResult.selectedUrls || [];
  const candidateUrls = discoveryResult.candidateUrls || [];
  for (const url of approvedUrls) {
    const meta = triageMetaMap.size > 0 ? _lookupTriageMeta(url, triageMetaMap) : null;
    planner.enqueue(url, 'discovery_approved', {
      forceApproved: true,
      forceBrandBypass: false,
      triageMeta: meta,
    });
  }
  let seededCount = 0;
  if (config?.fetchCandidateSources && candidateUrls.length > 0 && typeof planner?.seedCandidates === 'function') {
    planner.seedCandidates(candidateUrls, { triageMetaMap });
    seededCount = candidateUrls.length;
  }

  if (planner.enqueueCounters) {
    const counters = planner.enqueueCounters;
    logger?.info?.('discovery_enqueue_summary', {
      ...counters,
      input_selected_count: approvedUrls.length,
      input_candidate_count: candidateUrls.length,
    });
  }

  return {
    enqueuedCount: approvedUrls.length,
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
