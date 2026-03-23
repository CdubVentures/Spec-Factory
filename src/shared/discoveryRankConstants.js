// WHY: Single source of truth for rank/sort-order constants used by
// needsetEngine.js and searchPlanningContext.js. Eliminates duplication
// of identical values under different names across those two modules.

export const AVAILABILITY_RANKS = Object.freeze({ always: 0, expected: 1, sometimes: 2, rare: 3, editorial_only: 4 });
export const DIFFICULTY_RANKS = Object.freeze({ easy: 0, medium: 1, hard: 2 });
export const REQUIRED_LEVEL_RANKS = Object.freeze({ identity: 0, critical: 1, required: 2, expected: 3, optional: 4 });
export const PRIORITY_BUCKET_ORDER = Object.freeze({ core: 0, secondary: 1, optional: 2 });

export const EXHAUSTION_MIN_ATTEMPTS = 3;
export const EXHAUSTION_MIN_EVIDENCE_CLASSES = 3;

export function availabilityRank(avail) {
  return AVAILABILITY_RANKS[avail] ?? 4;
}

export function difficultyRank(diff) {
  return DIFFICULTY_RANKS[diff] ?? 2;
}

export function requiredLevelRank(level) {
  return REQUIRED_LEVEL_RANKS[level] ?? 4;
}
