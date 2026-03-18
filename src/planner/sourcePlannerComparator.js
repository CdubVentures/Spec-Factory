/**
 * Shared comparator for discovery priority ordering.
 * Used for queue insertion, cap eviction, duplicate upgrade,
 * and locale representative replacement.
 */

// WHY: Lane priority order is 2 > 1 > 3 > 4 > 5 > 6 > 7
// Lane 2 (manual/specsheet) is highest value, lane 7 (community) is lowest.
const LANE_RANK = { 2: 0, 1: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6 };
const DEFAULT_LANE_RANK = 7;

const PRIORITY_RANK = { high: 0, medium: 1, low: 2, audit: 3 };
const DEFAULT_PRIORITY_RANK = 4;

const BUCKET_RANK = { approved: 0, candidate: 1 };
const DEFAULT_BUCKET_RANK = 2;

const YIELD_RANK = { promoted: 0, normal: 1, caution: 2, capped: 3, blocked: 4 };
const DEFAULT_YIELD_RANK = 5;

const SOURCE_RANK = { seed: 0, approved: 1, candidate: 2, fallback: 3 };
const DEFAULT_SOURCE_RANK = 4;

/**
 * Compare two discovery items for priority ordering.
 * Returns negative if `a` wins, positive if `b` wins, 0 if tied.
 *
 * Comparison order:
 * 1. approval_bucket (approved > candidate)
 * 2. selection_priority (high > medium > low > audit)
 * 3. primary_lane (2 > 1 > 3 > 4 > 5 > 6 > 7)
 * 4. triage_score (higher wins)
 * 5. host_yield_state (promoted > normal > caution > capped)
 * 6. discovered_from (seed > approved > candidate > fallback)
 * 7. canonical_url ascending (stable tiebreak)
 */
export function compareDiscoveryPriority(a, b) {
  // 1. approval_bucket
  const bucketA = BUCKET_RANK[a.approval_bucket] ?? DEFAULT_BUCKET_RANK;
  const bucketB = BUCKET_RANK[b.approval_bucket] ?? DEFAULT_BUCKET_RANK;
  if (bucketA !== bucketB) return bucketA - bucketB;

  // 2. selection_priority
  const prioA = PRIORITY_RANK[a.selection_priority] ?? DEFAULT_PRIORITY_RANK;
  const prioB = PRIORITY_RANK[b.selection_priority] ?? DEFAULT_PRIORITY_RANK;
  if (prioA !== prioB) return prioA - prioB;

  // 3. primary_lane
  const laneA = LANE_RANK[a.primary_lane] ?? DEFAULT_LANE_RANK;
  const laneB = LANE_RANK[b.primary_lane] ?? DEFAULT_LANE_RANK;
  if (laneA !== laneB) return laneA - laneB;

  // 4. triage_score (higher wins → reverse order)
  const scoreA = Number(a.triage_score) || 0;
  const scoreB = Number(b.triage_score) || 0;
  if (scoreA !== scoreB) return scoreB - scoreA;

  // 5. host_yield_state
  const yieldA = YIELD_RANK[a.host_yield_state] ?? DEFAULT_YIELD_RANK;
  const yieldB = YIELD_RANK[b.host_yield_state] ?? DEFAULT_YIELD_RANK;
  if (yieldA !== yieldB) return yieldA - yieldB;

  // 6. discovered_from
  const srcA = SOURCE_RANK[a.discovered_from] ?? DEFAULT_SOURCE_RANK;
  const srcB = SOURCE_RANK[b.discovered_from] ?? DEFAULT_SOURCE_RANK;
  if (srcA !== srcB) return srcA - srcB;

  // 7. canonical_url ascending (stable tiebreak)
  const urlA = String(a.canonical_url || '');
  const urlB = String(b.canonical_url || '');
  return urlA.localeCompare(urlB);
}
