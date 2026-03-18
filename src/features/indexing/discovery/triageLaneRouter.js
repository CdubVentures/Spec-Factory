/**
 * Stage 06 SERP Triage — Lane Router
 *
 * Assigns candidates to 7 lanes based on source class and document type.
 * Identity affects score, NOT lane membership. Even off_target candidates
 * stay in their natural source lane.
 *
 * Lanes:
 *   1 official_support — official/support hosts
 *   2 manual_specsheet — manual_pdf/spec_sheet docs (wins over lane 1)
 *   3 trusted_review   — tier 1-2 review sites
 *   4 trusted_specdb   — spec databases
 *   5 retailer         — retailer hosts
 *   6 long_tail        — unknown hosts (exploration reserve)
 *   7 community        — community/forum sources
 */

// ---------------------------------------------------------------------------
// Lane definitions
// ---------------------------------------------------------------------------

const LANE_LABELS = Object.freeze({
  1: 'official_support',
  2: 'manual_specsheet',
  3: 'trusted_review',
  4: 'trusted_specdb',
  5: 'retailer',
  6: 'long_tail',
  7: 'community',
});

// WHY: weighted priors reflect actual fill objectives. Core fields mostly
// come from official/manual sources, deep fields from review/lab.
const BASE_WEIGHTS = Object.freeze({
  1: 0.25,
  2: 0.20,
  3: 0.15,
  4: 0.10,
  5: 0.10,
  6: 0.10,
  7: 0.05,
});

// host_class → lane mapping from searchPlanningContext GROUP_DEFAULTS
const HOST_CLASS_LANE_MAP = Object.freeze({
  manufacturer: 1,
  lab_review: 3,
  review: 3,
  any: 6,
});

// ---------------------------------------------------------------------------
// Lane matching
// ---------------------------------------------------------------------------

function matchesLane(candidate, lane) {
  const { host_trust_class, doc_kind_guess } = candidate;

  switch (lane) {
    case 2:
      return (doc_kind_guess === 'manual_pdf' || doc_kind_guess === 'spec_sheet')
        && host_trust_class !== 'community';
    case 1:
      return host_trust_class === 'official' || host_trust_class === 'support';
    case 3:
      return host_trust_class === 'trusted_review';
    case 4:
      return host_trust_class === 'trusted_specdb';
    case 5:
      return host_trust_class === 'retailer';
    case 6:
      // WHY: forum/community doc_kind should route to lane 7, not lane 6
      return host_trust_class === 'unknown'
        && doc_kind_guess !== 'forum'
        && doc_kind_guess !== 'community';
    case 7:
      return host_trust_class === 'community'
        || doc_kind_guess === 'forum'
        || doc_kind_guess === 'community';
    default:
      return false;
  }
}

// Lane priority order: 2 wins over 1, 1 wins over 3-6, 7 always last
const LANE_PRIORITY = [2, 1, 3, 4, 5, 6, 7];

// ---------------------------------------------------------------------------
// triage_disposition resolution
// ---------------------------------------------------------------------------

function resolveDisposition(candidate, primaryLane) {
  const { identity_prelim, extraction_surface_prior } = candidate;
  const strongIdentity = identity_prelim === 'exact' || identity_prelim === 'family';
  const strongSurface = ['network_json', 'adapter_api', 'json_ld', 'html_table', 'pdf_table'].includes(extraction_surface_prior);

  if (primaryLane <= 4 && (strongIdentity || strongSurface)) return 'fetch_high';
  if (primaryLane <= 4) return 'fetch_normal';
  if (primaryLane === 7 && !strongIdentity) return 'audit_only';
  if (primaryLane >= 5) return 'fetch_low';
  return 'fetch_normal';
}

// ---------------------------------------------------------------------------
// assignLanes
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {Array} options.labeledCandidates — candidates with soft labels
 * @returns {Array} Same candidates enriched with primary_lane, secondary_lanes,
 *                  triage_disposition, approval_bucket
 */
export function assignLanes({ labeledCandidates } = {}) {
  if (!labeledCandidates || !labeledCandidates.length) return labeledCandidates || [];

  for (const candidate of labeledCandidates) {
    let primaryLane = 7; // default fallback
    const secondaryLanes = [];

    for (const lane of LANE_PRIORITY) {
      if (matchesLane(candidate, lane)) {
        if (primaryLane === 7 || lane === LANE_PRIORITY[0]) {
          // First match or higher-priority match
          if (primaryLane !== 7 && primaryLane !== lane) {
            secondaryLanes.push(primaryLane);
          }
          primaryLane = lane;
        } else {
          secondaryLanes.push(lane);
        }
      }
    }

    candidate.primary_lane = primaryLane;
    candidate.secondary_lanes = secondaryLanes;
    candidate.triage_disposition = resolveDisposition(candidate, primaryLane);
    candidate.approval_bucket = candidate.approved_domain ? 'approved' : 'candidate';
  }

  return labeledCandidates;
}

// ---------------------------------------------------------------------------
// computeLaneQuotas
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {Array} options.missingFields
 * @param {Array} options.focusGroups — from searchPlanningContext
 * @param {number} options.totalBudget — discoveryCap
 * @param {object} options.fieldYieldMap — learning.fieldYield
 * @returns {{ quotas: Array, boost_reasons: string[] }}
 */
export function computeLaneQuotas({
  missingFields = [],
  focusGroups = [],
  totalBudget = 20,
  fieldYieldMap = {},
} = {}) {
  const budget = Math.max(1, totalBudget);
  const boostReasons = [];

  // Step 1: Base quotas from weighted priors
  const rawQuotas = {};
  for (let lane = 1; lane <= 7; lane++) {
    rawQuotas[lane] = Math.floor(budget * (BASE_WEIGHTS[lane] || 0));
  }

  // Step 2: NeedSet boosts from focus groups
  for (const group of focusGroups || []) {
    if (group.phase !== 'now') continue;
    const coreCount = Number(group.core_unresolved_count || 0);
    if (coreCount <= 0) continue;

    const targetLane = HOST_CLASS_LANE_MAP[group.host_class] || 6;
    const boost = coreCount * 2;
    rawQuotas[targetLane] = (rawQuotas[targetLane] || 0) + boost;
    boostReasons.push(`${group.key}:+${boost}→lane${targetLane}`);
  }

  // Step 3: Community hard cap
  const communityCap = Math.max(1, Math.floor(budget * 0.05));
  rawQuotas[7] = Math.min(rawQuotas[7] || 1, communityCap);

  // Step 4: Minimum 1 slot per high-value lane (1-4)
  for (const lane of [1, 2, 3, 4]) {
    rawQuotas[lane] = Math.max(1, rawQuotas[lane] || 0);
  }

  // Step 5: Hard budget ceiling — reduce lowest-value lanes first
  let total = Object.values(rawQuotas).reduce((s, v) => s + v, 0);
  if (total > budget) {
    // Reduce lanes from lowest priority (7, 6, 5) first
    for (const lane of [7, 6, 5, 4, 3, 2, 1]) {
      if (total <= budget) break;
      const min = lane <= 4 ? 1 : 0;
      const reduction = Math.min(rawQuotas[lane] - min, total - budget);
      if (reduction > 0) {
        rawQuotas[lane] -= reduction;
        total -= reduction;
        boostReasons.push(`quota_pressure_applied:lane${lane}:-${reduction}`);
      }
    }
  }

  // Step 6: Ensure lane 6 has exploration reserve (10-15% of budget)
  const minExploration = Math.max(1, Math.floor(budget * 0.10));
  if (rawQuotas[6] < minExploration) {
    const needed = minExploration - rawQuotas[6];
    total = Object.values(rawQuotas).reduce((s, v) => s + v, 0);
    if (total + needed <= budget) {
      rawQuotas[6] = minExploration;
    }
  }

  const quotas = Object.entries(rawQuotas).map(([lane, quota]) => ({
    lane: Number(lane),
    label: LANE_LABELS[lane] || 'unknown',
    quota: Math.max(0, quota),
  }));

  return { quotas, boost_reasons: boostReasons };
}

// ---------------------------------------------------------------------------
// selectByLaneQuota
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {Array} options.lanedCandidates — scored + laned candidates
 * @param {Array} options.laneQuotas — from computeLaneQuotas
 * @returns {{ selected: Array, notSelected: Array, laneStats: Array }}
 */
export function selectByLaneQuota({
  lanedCandidates = [],
  laneQuotas = [],
} = {}) {
  if (!lanedCandidates.length) {
    return { selected: [], notSelected: [], laneStats: [] };
  }

  // Group candidates by primary_lane
  const byLane = new Map();
  for (let lane = 1; lane <= 7; lane++) {
    byLane.set(lane, []);
  }
  for (const candidate of lanedCandidates) {
    const lane = candidate.primary_lane || 7;
    if (!byLane.has(lane)) byLane.set(lane, []);
    byLane.get(lane).push(candidate);
  }

  // Sort each lane by score desc
  for (const [, candidates] of byLane) {
    candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  // Build quota map
  const quotaMap = new Map();
  for (const q of laneQuotas) {
    quotaMap.set(q.lane, q.quota || 0);
  }

  // Fill lanes
  const selected = [];
  const notSelected = [];
  const laneStats = [];
  let redistributable = 0;

  // First pass: fill each lane up to quota
  for (let lane = 1; lane <= 7; lane++) {
    const candidates = byLane.get(lane) || [];
    const quota = quotaMap.get(lane) || 0;
    const toSelect = Math.min(quota, candidates.length);

    for (let i = 0; i < toSelect; i++) {
      selected.push(candidates[i]);
    }
    for (let i = toSelect; i < candidates.length; i++) {
      notSelected.push(candidates[i]);
    }

    const unused = Math.max(0, quota - candidates.length);
    redistributable += unused;

    laneStats.push({
      lane,
      label: LANE_LABELS[lane] || 'unknown',
      quota,
      available: candidates.length,
      selected: toSelect,
      unused,
    });
  }

  // Second pass: redistribute unused quota to lower-numbered lanes with overflow
  if (redistributable > 0) {
    for (let lane = 1; lane <= 6 && redistributable > 0; lane++) {
      const candidates = byLane.get(lane) || [];
      const alreadySelected = laneStats.find((s) => s.lane === lane)?.selected || 0;
      const remaining = candidates.slice(alreadySelected);

      for (const candidate of remaining) {
        if (redistributable <= 0) break;
        selected.push(candidate);
        redistributable--;
        // Remove from notSelected if already there
        const idx = notSelected.indexOf(candidate);
        if (idx >= 0) notSelected.splice(idx, 1);
        const stat = laneStats.find((s) => s.lane === lane);
        if (stat) stat.selected++;
      }
    }
  }

  return { selected, notSelected, laneStats };
}
