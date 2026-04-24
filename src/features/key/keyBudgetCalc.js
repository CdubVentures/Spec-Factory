// Per-key budget calculator — pure function.
// Computes attempt budget per key from 4 axes: required_level, availability,
// difficulty, product-family size. The three integer axes floor via axisPoints;
// variantPointsPerExtra is float so family size accrues fractionally. The
// raw fractional budget is returned so the frontend can display "9.75" while
// the loop spends ceil(9.75) = 10 attempts.

function axisPoints(table, key) {
  if (!table || typeof table !== 'object') return 0;
  const raw = table[key];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * Parse a float knob value tolerating NumberStepper's empty-string emissions
 * and negative poisoning. Returns 0 (no variant penalty) when input is not a
 * valid non-negative finite number.
 */
export function readFloatKnob(raw, fallback = 0) {
  if (raw === '' || raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function calcKeyBudget({ fieldRule = {}, familySize = undefined, variantCount = undefined, settings = {} } = {}) {
  const required = axisPoints(settings.budgetRequiredPoints, fieldRule.required_level);
  const availability = axisPoints(settings.budgetAvailabilityPoints, fieldRule.availability);
  const difficulty = axisPoints(settings.budgetDifficultyPoints, fieldRule.difficulty);
  const perExtra = readFloatKnob(settings.budgetVariantPointsPerExtra, 0);
  const resolvedFamilySize = familySize ?? variantCount ?? 1;
  const extras = Math.max(0, Number(resolvedFamilySize) - 1);
  const variant = extras * perExtra;
  const floor = Math.max(1, axisPoints({ v: settings.budgetFloor }, 'v') || 1);
  const rawBudget = required + availability + difficulty + variant;
  const attempts = Math.max(floor, Math.ceil(rawBudget));
  return {
    attempts,
    rawBudget,
    breakdown: { required, availability, difficulty, variant, floor, rawBudget },
  };
}
