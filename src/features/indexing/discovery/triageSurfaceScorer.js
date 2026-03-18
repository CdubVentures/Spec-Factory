/**
 * Stage 06 SERP Triage — Surface-Aware Scorer
 *
 * Computes a unified score for each labeled and laned candidate.
 * 7 components, all visible in score_breakdown:
 *   1. base_relevance          — from existing computeScore (resultReranker.js)
 *   2. lane_score              — bonus by lane priority
 *   3. surface_prior_score     — extraction surface likelihood
 *   4. historical_yield_score  — domain yield with shrinkage/cap/decay/novelty
 *   5. unresolved_field_group_score — field group alignment
 *   6. identity_prelim_score   — identity label mapping
 *   7. soft_penalty_sum        — accumulated soft label penalties
 */
import { extractRootDomain } from '../../../utils/common.js';

// ---------------------------------------------------------------------------
// Score component tables
// ---------------------------------------------------------------------------

const LANE_SCORE_MAP = Object.freeze({
  1: 20, 2: 18, 3: 15, 4: 12, 5: 8, 6: 4, 7: 0,
});

const SURFACE_PRIOR_SCORE_MAP = Object.freeze({
  network_json: 15,
  adapter_api: 14,
  json_ld: 12,
  html_table: 10,
  pdf_table: 8,
  embedded_state: 6,
  article_text: 3,
  pdf_text: 2,
  weak_surface: 0,
});

const IDENTITY_PRELIM_SCORE_MAP = Object.freeze({
  exact: 10,
  family: 5,
  variant: -15,
  multi_model: -8,
  uncertain: -3,
  off_target: -25,
});

const SOFT_PENALTY_MAP = Object.freeze({
  comparison_surface: -5,
  homepage_like: -8,
  root_path_only: -6,
  weak_surface: -4,
  community_source: -3,
  approved_domain: 5,
  variant_guard_hit: -5,
  multi_model_hint: -3,
  weak_identity_match: -2,
});

// host_class → lane mapping for field group alignment
const HOST_CLASS_LANE_MAP = Object.freeze({
  manufacturer: 1,
  lab_review: 3,
  review: 3,
  any: 6,
});

// Historical yield constants
const YIELD_MIN_SUPPORT = 3;
const YIELD_HARD_CAP = 25;
const YIELD_PER_FIELD = 12;
const YIELD_STALE_DAYS = 30;
const NOVELTY_BONUS = 5;

// ---------------------------------------------------------------------------
// Historical yield computation
// ---------------------------------------------------------------------------

function computeHistoricalYield({ host, missingFields, fieldYieldMap, hostTrustClass }) {
  if (!missingFields || !missingFields.length) {
    // Novelty bonus even with no missing fields
    if (!fieldYieldMap || typeof fieldYieldMap !== 'object') {
      return hostTrustClass !== 'community' ? NOVELTY_BONUS : 0;
    }
    const rootDomain = extractRootDomain(host);
    const domainEntry = fieldYieldMap?.by_host?.[host] || fieldYieldMap?.by_domain?.[rootDomain];
    if (!domainEntry) {
      return hostTrustClass !== 'community' ? NOVELTY_BONUS : 0;
    }
    return 0;
  }

  const rootDomain = extractRootDomain(host);

  // Precedence: by_host > by_domain
  const domainEntry = fieldYieldMap?.by_host?.[host] || fieldYieldMap?.by_domain?.[rootDomain];

  // No history → novelty bonus (unless community)
  if (!domainEntry) {
    return hostTrustClass !== 'community' ? NOVELTY_BONUS : 0;
  }

  // Min-support gate
  const attempts = Number(domainEntry.attempts || 0);
  if (attempts < YIELD_MIN_SUPPORT) return 0;

  // Time decay
  let decayMultiplier = 1.0;
  if (domainEntry.updated_at) {
    const ageMs = Date.now() - new Date(domainEntry.updated_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > YIELD_STALE_DAYS) decayMultiplier = 0.5;
  }

  // Sum yield per missing field with Laplace smoothing
  let total = 0;
  const fields = domainEntry.fields || {};
  for (const field of missingFields) {
    const entry = fields[field];
    if (!entry) continue;
    const seen = Number(entry.seen || 0);
    const accepted = Number(entry.accepted || 0);
    // Bayesian shrinkage: (accepted + 1) / (seen + 2)
    const effectiveYield = (accepted + 1) / (seen + 2);
    total += effectiveYield * YIELD_PER_FIELD;
  }

  return Math.min(YIELD_HARD_CAP, total * decayMultiplier);
}

// ---------------------------------------------------------------------------
// Unresolved field group alignment
// ---------------------------------------------------------------------------

function computeFieldGroupScore({ primaryLane, focusGroups }) {
  let total = 0;
  for (const group of focusGroups || []) {
    if (group.phase !== 'now') continue;
    const targetLane = HOST_CLASS_LANE_MAP[group.host_class] || 6;
    if (targetLane === primaryLane) {
      total += (Number(group.core_unresolved_count || 0)) * 3;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Soft penalty sum
// ---------------------------------------------------------------------------

function computeSoftPenaltySum(softReasonCodes) {
  let total = 0;
  for (const code of softReasonCodes || []) {
    total += SOFT_PENALTY_MAP[code] || 0;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Base relevance (simplified — delegates to existing computeScore pattern)
// ---------------------------------------------------------------------------

function computeBaseRelevance({ url, host, title, snippet, categoryConfig, missingFields, identityLock }) {
  // Simplified base relevance score — preserves the spirit of resultReranker's computeScore
  // without importing the full module (which has its own dedup/filter logic)
  let score = 0;
  const text = `${title || ''} ${snippet || ''} ${url || ''}`.toLowerCase();
  const brand = String(identityLock?.brand || '').toLowerCase();
  const model = String(identityLock?.model || '').toLowerCase();

  if (brand && text.includes(brand)) score += 5;
  if (model && text.includes(model)) score += 5;
  if (/spec|manual|datasheet|technical|support/.test(text)) score += 3;
  if (/review|benchmark|latency|measure/.test(text)) score += 2;
  if (/forum|reddit|community/.test(text)) score -= 2;

  // Missing field text match
  for (const field of missingFields || []) {
    const normalized = String(field || '').replace(/_/g, ' ').toLowerCase();
    if (text.includes(normalized)) score += 1;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {Array} options.lanedCandidates
 * @param {object} options.categoryConfig
 * @param {Array} options.missingFields
 * @param {object} options.fieldYieldMap
 * @param {object} options.identityLock
 * @param {object} options.effectiveHostPlan
 * @param {Array} options.focusGroups
 * @returns {Array} Same candidates enriched with score + score_breakdown
 */
export function scoreCandidates({
  lanedCandidates = [],
  categoryConfig = {},
  missingFields = [],
  fieldYieldMap = {},
  identityLock = {},
  effectiveHostPlan = null,
  focusGroups = [],
} = {}) {
  if (!lanedCandidates.length) return lanedCandidates;

  for (const candidate of lanedCandidates) {
    const baseRelevance = computeBaseRelevance({
      url: candidate.url,
      host: candidate.host,
      title: candidate.title,
      snippet: candidate.snippet,
      categoryConfig,
      missingFields,
      identityLock,
    });

    const laneScore = LANE_SCORE_MAP[candidate.primary_lane] ?? 0;

    const surfacePriorScore = SURFACE_PRIOR_SCORE_MAP[candidate.extraction_surface_prior] ?? 0;

    const historicalYieldScore = computeHistoricalYield({
      host: candidate.host,
      missingFields,
      fieldYieldMap,
      hostTrustClass: candidate.host_trust_class,
    });

    const unresolvedFieldGroupScore = computeFieldGroupScore({
      primaryLane: candidate.primary_lane,
      focusGroups,
    });

    const identityPrelimScore = IDENTITY_PRELIM_SCORE_MAP[candidate.identity_prelim] ?? 0;

    const softPenaltySum = computeSoftPenaltySum(candidate.soft_reason_codes);

    const total = baseRelevance + laneScore + surfacePriorScore
      + historicalYieldScore + unresolvedFieldGroupScore
      + identityPrelimScore + softPenaltySum;

    candidate.score = total;
    candidate.score_breakdown = {
      base_relevance: baseRelevance,
      lane_score: laneScore,
      surface_prior_score: surfacePriorScore,
      historical_yield_score: historicalYieldScore,
      unresolved_field_group_score: unresolvedFieldGroupScore,
      identity_prelim_score: identityPrelimScore,
      soft_penalty_sum: softPenaltySum,
    };
  }

  return lanedCandidates;
}
