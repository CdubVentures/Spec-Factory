/**
 * keyBundlerSortAxes — axis-order-driven sort comparator for keyBundler
 * and the frontend Loop chain sort.
 *
 * The 3 configurable axes (difficulty, required_level, availability) can be
 * reordered via the `bundlingSortAxisOrder` Pipeline Settings knob. Within
 * each axis the rank is fixed (easy<medium<hard<very_hard, mandatory<
 * non_mandatory, always<sometimes<rare). After the 3 axes the comparator
 * applies (optionally) a currentRides ASC tiebreaker — bundler-only; the
 * Loop chain sort has no rides concept — and finally field_key ASC for
 * determinism.
 *
 * Same semantics run on the backend (this file) and the frontend (mirrored
 * in keyFinderGroupedRows.ts — small enough to parallel-implement cleanly).
 */

export const DEFAULT_AXIS_ORDER = Object.freeze(['difficulty', 'required_level', 'availability']);
export const KNOWN_AXES = Object.freeze(new Set(['difficulty', 'required_level', 'availability']));

const REQUIRED_RANK = Object.freeze({ mandatory: 0, non_mandatory: 1 });
const AVAILABILITY_RANK = Object.freeze({ always: 0, sometimes: 1, rare: 2 });
const DIFFICULTY_RANK = Object.freeze({ easy: 0, medium: 1, hard: 2, very_hard: 3 });

const AXIS_RANK_TABLE = Object.freeze({
  required_level: { table: REQUIRED_RANK, fallback: REQUIRED_RANK.non_mandatory + 1 },
  availability: { table: AVAILABILITY_RANK, fallback: AVAILABILITY_RANK.rare + 1 },
  difficulty: { table: DIFFICULTY_RANK, fallback: DIFFICULTY_RANK.very_hard + 1 },
});

function axisRank(axis, fieldRule) {
  const spec = AXIS_RANK_TABLE[axis];
  if (!spec) return 0;
  const v = String(fieldRule?.[axis] ?? '').trim();
  const r = spec.table[v];
  return Number.isFinite(r) ? r : spec.fallback;
}

/**
 * Normalize a user-provided CSV axis order to a total ordering over all
 * 3 known axes. Preserves user-supplied order, drops unknowns, dedupes
 * on first occurrence, and appends any missing axes in DEFAULT_AXIS_ORDER.
 *
 * @param {string|null|undefined} csv
 * @returns {readonly string[]} exactly 3 axis names from KNOWN_AXES
 */
export function parseAxisOrder(csv) {
  const raw = String(csv ?? '').trim();
  if (!raw) return [...DEFAULT_AXIS_ORDER];
  const seen = new Set();
  const result = [];
  for (const token of raw.split(',')) {
    const axis = token.trim();
    if (KNOWN_AXES.has(axis) && !seen.has(axis)) {
      seen.add(axis);
      result.push(axis);
    }
  }
  if (result.length === 0) return [...DEFAULT_AXIS_ORDER];
  for (const axis of DEFAULT_AXIS_ORDER) {
    if (!seen.has(axis)) result.push(axis);
  }
  return result;
}

/**
 * Build a comparator honoring (axisOrder..., currentRides?, fieldKey) ASC.
 * Candidates are `{ fieldKey, fieldRule: { required_level, availability,
 * difficulty }, currentRides? }`.
 *
 * @param {readonly string[]} axisOrder  from parseAxisOrder
 * @param {{ tiebreaker?: 'currentRides' | 'none' }} [options]
 * @returns {(a: object, b: object) => number}
 */
export function buildSortComparator(axisOrder, { tiebreaker = 'none' } = {}) {
  const axes = axisOrder && axisOrder.length > 0 ? axisOrder : DEFAULT_AXIS_ORDER;
  const useRides = tiebreaker === 'currentRides';
  return (a, b) => {
    for (const axis of axes) {
      const aR = axisRank(axis, a?.fieldRule);
      const bR = axisRank(axis, b?.fieldRule);
      if (aR !== bR) return aR - bR;
    }
    if (useRides) {
      const aRides = Number.isFinite(a?.currentRides) && a.currentRides >= 0 ? a.currentRides : 0;
      const bRides = Number.isFinite(b?.currentRides) && b.currentRides >= 0 ? b.currentRides : 0;
      if (aRides !== bRides) return aRides - bRides;
    }
    const aKey = String(a?.fieldKey ?? '');
    const bKey = String(b?.fieldKey ?? '');
    if (aKey < bKey) return -1;
    if (aKey > bKey) return 1;
    return 0;
  };
}
