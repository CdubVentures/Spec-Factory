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
 *   - Sort key (required_level, availability, difficulty, currentRides,
 *     field_key) ASC — mandatory peers pack before non_mandatory; within a
 *     tier, the peer with the fewest concurrent rides sorts first so multiple
 *     bundled calls distribute across same-tier peers instead of stacking on
 *     the alphabetical first. field_key is the final deterministic tiebreaker.
 *   - Output is stable for fixed candidates (same {fieldKey, currentRides}
 *     always yields the same order).
 */

const AVAILABILITY_RANK = Object.freeze({ always: 0, sometimes: 1, rare: 2 });
const DIFFICULTY_RANK = Object.freeze({ easy: 0, medium: 1, hard: 2, very_hard: 3 });
const REQUIRED_RANK = Object.freeze({ mandatory: 0, non_mandatory: 1 });
const VALID_REQ = new Set(['mandatory', 'non_mandatory']);

function rankOr(table, key, fallback) {
  const r = table[String(key || '').trim()];
  return Number.isFinite(r) ? r : fallback;
}

function toIntOrZero(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
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
 * Passenger cost is RAW (bundlingPassengerCost[difficulty]) — not scaled by
 * variant count. The pool/cost ratio is the user's mental model: pool=6,
 * easy cost=1 → 6 easy passengers fit.
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

  // Step 5 — deterministic sort: required_level ASC, availability ASC,
  // difficulty ASC, currentRides ASC, field_key ASC. Mandatory peers pack
  // before non_mandatory; within each required_level tier, "cheap wins first"
  // by availability then difficulty. currentRides ASC distributes rides across
  // same-tier peers so one key doesn't hog all the slots while its tier-mates
  // sit idle. field_key is the final deterministic tiebreaker.
  eligible.sort((a, b) => {
    const aReq = rankOr(REQUIRED_RANK, a.fieldRule.required_level, REQUIRED_RANK.non_mandatory + 1);
    const bReq = rankOr(REQUIRED_RANK, b.fieldRule.required_level, REQUIRED_RANK.non_mandatory + 1);
    if (aReq !== bReq) return aReq - bReq;
    const aAvail = rankOr(AVAILABILITY_RANK, a.fieldRule.availability, AVAILABILITY_RANK.rare + 1);
    const bAvail = rankOr(AVAILABILITY_RANK, b.fieldRule.availability, AVAILABILITY_RANK.rare + 1);
    if (aAvail !== bAvail) return aAvail - bAvail;
    const aDiff = rankOr(DIFFICULTY_RANK, a.fieldRule.difficulty, DIFFICULTY_RANK.very_hard + 1);
    const bDiff = rankOr(DIFFICULTY_RANK, b.fieldRule.difficulty, DIFFICULTY_RANK.very_hard + 1);
    if (aDiff !== bDiff) return aDiff - bDiff;
    const aRides = Number.isFinite(a.currentRides) && a.currentRides >= 0 ? a.currentRides : 0;
    const bRides = Number.isFinite(b.currentRides) && b.currentRides >= 0 ? b.currentRides : 0;
    if (aRides !== bRides) return aRides - bRides;
    if (a.fieldKey < b.fieldKey) return -1;
    if (a.fieldKey > b.fieldKey) return 1;
    return 0;
  });

  // Step 6 — greedy-pack under the primary's point pool. Cost is RAW (no
  // variant scaling) — user-facing semantics: pool / cost = max passengers.
  const passengers = [];
  const breakdown = [];
  let totalCost = 0;

  for (const c of eligible) {
    const cost = toIntOrZero(settings.bundlingPassengerCost?.[c.fieldRule.difficulty]);
    if (totalCost + cost > pool) continue;
    passengers.push({ fieldKey: c.fieldKey, fieldRule: c.fieldRule });
    breakdown.push({ fieldKey: c.fieldKey, cost });
    totalCost += cost;
  }

  return { passengers, totalCost, pool, breakdown };
}
