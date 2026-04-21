// WHY: Single source of truth for rank/sort-order constants used by
// needsetEngine.js and searchPlanningContext.js. Eliminates duplication
// of identical values under different names across those two modules.

export const AVAILABILITY_RANKS = Object.freeze({ always: 0, sometimes: 1, rare: 2 });
export const DIFFICULTY_RANKS = Object.freeze({ easy: 0, medium: 1, hard: 2, very_hard: 3 });
export const REQUIRED_LEVEL_RANKS = Object.freeze({ mandatory: 0, non_mandatory: 1 });
export const PRIORITY_BUCKET_ORDER = Object.freeze({ core: 0, optional: 1 });

export const EXHAUSTION_MIN_ATTEMPTS = 3;
export const EXHAUSTION_MIN_EVIDENCE_CLASSES = 3;

export function availabilityRank(avail) {
  return AVAILABILITY_RANKS[avail] ?? 2;
}

export function difficultyRank(diff) {
  return DIFFICULTY_RANKS[diff] ?? 3;
}

export function requiredLevelRank(level) {
  return REQUIRED_LEVEL_RANKS[level] ?? 1;
}

export function mapRequiredLevelToBucket(level) {
  if (level === 'mandatory') return 'core';
  return 'optional';
}
