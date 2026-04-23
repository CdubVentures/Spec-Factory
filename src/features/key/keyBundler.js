/**
 * keyBundler — pure-function packer for per-key bundling.
 *
 * Computes which same-group peer keys ("passengers") ride along with a
 * primary key's LLM call under the point-pool model. Contract locked
 * 2026-04-21 per §6.1 of docs/implementation/key feature implemenation/
 * per-key-finder-roadmap.html.
 *
 * Invariants:
 *   - Primary owns the budget line; passengers deduct from the primary's
 *     pool, NOT from primary's per-key attempt budget.
 *   - Sort key (axisOrder..., currentRides, field_key) ASC — the 3 axes
 *     (difficulty, required_level, availability) are reorderable via the
 *     `bundlingSortAxisOrder` Pipeline Settings knob (default: difficulty →
 *     required_level → availability). Idle peers pack before already-riding
 *     peers so cross-group bundles maximize unique coverage before spending
 *     fallback overlap budget. Within each pass, currentRides and field_key
 *     remain deterministic tiebreakers.
 *   - Output is stable for fixed candidates (same {fieldKey, currentRides}
 *     always yields the same order).
 */

import { parseAxisOrder, buildSortComparator } from './keyBundlerSortAxes.js';

const DIFFICULTY_RANK = Object.freeze({ easy: 0, medium: 1, hard: 2, very_hard: 3 });
const VALID_REQ = new Set(['mandatory', 'non_mandatory']);

function toIntOrZero(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function toNumberOrZero(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeVariantCount(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 1 ? Math.floor(n) : 1;
}

export function calcPassengerCost({ difficulty, settings, variantCount = 1 } = {}) {
  const base = toNumberOrZero(settings?.bundlingPassengerCost?.[difficulty]);
  const perExtraVariant = toNumberOrZero(settings?.bundlingPassengerVariantCostPerExtra);
  const extraVariants = Math.max(0, normalizeVariantCount(variantCount) - 1);
  return Number((base + (extraVariants * perExtraVariant)).toFixed(6));
}

function matchesPolicy(policy, primaryDifficulty, peerDifficulty) {
  const p = DIFFICULTY_RANK[primaryDifficulty];
  const q = DIFFICULTY_RANK[peerDifficulty];
  if (p === undefined || q === undefined) return false;
  switch (policy) {
    case 'same_only':
      return q === p;
    case 'any_but_very_hard':
      return q < DIFFICULTY_RANK.very_hard;
    case 'any_but_hard_very_hard':
      return q < DIFFICULTY_RANK.hard;
    case 'less_or_equal':
    default:
      return q <= p;
  }
}

/**
 * Pack a bundle for one primary key.
 *
 * Passenger cost starts from bundlingPassengerCost[difficulty] and adds the
 * configured family-size surcharge for each variant beyond the first. The
 * primary pool stays raw; larger families therefore pack fewer passengers.
 *
 * @param {object} args
 * @param {{fieldKey: string, fieldRule: object}} args.primary
 * @param {ReadonlyArray<{fieldKey: string, fieldRule: object, currentRides?: number}>} [args.candidates]  Eligible same-group peers. `currentRides` is the peer's live `asPassenger` count from the in-flight registry; used as a round-robin tiebreaker so rides distribute across same-tier peers (e.g., 5 hard peers each take one ride instead of one peer taking 5). Defaults to 0 when absent (e.g., in pure-function tests without a registry).
 * @param {ReadonlySet<string>} [args.resolvedFieldKeys]  Published-resolved keys to exclude
 * @param {object} args.settings  Bundling settings (from finderStore or test fixture)
 * @returns {{ passengers: Array<{fieldKey, fieldRule}>, totalCost: number, pool: number, breakdown: Array<{fieldKey, cost}> }}
 */
export function packBundle({
  primary,
  candidates,
  resolvedFieldKeys,
  settings,
  variantCount = 1,
} = {}) {
  const primaryRule = primary?.fieldRule || {};
  const pool = toIntOrZero(settings?.bundlingPoolPerPrimary?.[primaryRule.difficulty]);
  const solo = { passengers: [], totalCost: 0, pool, breakdown: [] };

  // Step 1 — disabled / degenerate
  if (!settings?.bundlingEnabled) return solo;
  if (pool <= 0) return solo;
  if (!Array.isArray(candidates) || candidates.length === 0) return solo;

  const policy = settings.passengerDifficultyPolicy || 'less_or_equal';
  const resolvedSet = resolvedFieldKeys instanceof Set ? resolvedFieldKeys : new Set();

  // Steps 3 + 4 — eligibility filter (policy + safety + resolved-exclusion)
  const eligible = [];
  for (const c of candidates) {
    if (!c?.fieldKey || !c?.fieldRule) continue;
    if (c.fieldKey === primary?.fieldKey) continue;
    if (c.fieldRule.variant_dependent === true) continue;
    const reqLevel = String(c.fieldRule.required_level || '').trim();
    if (!VALID_REQ.has(reqLevel)) continue;
    if (resolvedSet.has(c.fieldKey)) continue;
    if (!matchesPolicy(policy, primaryRule.difficulty, c.fieldRule.difficulty)) continue;
    eligible.push(c);
  }

  // Step 5 — deterministic sort via the configurable axis-order comparator.
  // Axes come from settings.bundlingSortAxisOrder (CSV of difficulty,
  // required_level, availability in user-chosen precedence). Fallback to
  // DEFAULT_AXIS_ORDER handles missing/empty/malformed input.
  const axisOrder = parseAxisOrder(settings?.bundlingSortAxisOrder);
  const comparator = buildSortComparator(axisOrder, { tiebreaker: 'currentRides' });
  const idleEligible = [];
  const ridingEligible = [];
  for (const c of eligible) {
    const rides = Number.isFinite(c?.currentRides) && c.currentRides > 0 ? c.currentRides : 0;
    if (rides > 0) {
      ridingEligible.push(c);
      continue;
    }
    idleEligible.push(c);
  }
  idleEligible.sort(comparator);
  ridingEligible.sort(comparator);

  // Step 6 - greedy-pack under the primary's point pool. Passenger cost is
  // variant-aware while the primary pool remains the configured raw pool.
  const passengers = [];
  const breakdown = [];
  let totalCost = 0;

  const packFrom = (orderedCandidates) => {
    for (const c of orderedCandidates) {
      const cost = calcPassengerCost({
        difficulty: c.fieldRule.difficulty,
        settings,
        variantCount,
      });
      if (totalCost + cost > pool) continue;
      passengers.push({ fieldKey: c.fieldKey, fieldRule: c.fieldRule });
      breakdown.push({ fieldKey: c.fieldKey, cost });
      totalCost += cost;
    }
  };

  packFrom(idleEligible);
  if (totalCost < pool) {
    packFrom(ridingEligible);
  }

  return { passengers, totalCost, pool, breakdown };
}
