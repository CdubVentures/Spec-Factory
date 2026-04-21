// Per-key budget calculator — pure function.
// Computes attempt budget per key from 4 axes: required_level, availability,
// difficulty, variant count. Used by Phase 3b Loop orchestration; Phase 3a Run
// ignores the number (always 1 attempt) but can still surface it for display.

function axisPoints(table, key) {
  if (!table || typeof table !== 'object') return 0;
  const raw = table[key];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function calcKeyBudget({ fieldRule = {}, variantCount = 1, settings = {} } = {}) {
  const required = axisPoints(settings.budgetRequiredPoints, fieldRule.required_level);
  const availability = axisPoints(settings.budgetAvailabilityPoints, fieldRule.availability);
  const difficulty = axisPoints(settings.budgetDifficultyPoints, fieldRule.difficulty);
  const perExtra = axisPoints({ v: settings.variantPointsPerExtra }, 'v');
  const extras = Math.max(0, Number(variantCount) - 1);
  const variant = extras * perExtra;
  const floor = Math.max(1, axisPoints({ v: settings.budgetFloor }, 'v') || 1);
  const sum = required + availability + difficulty + variant;
  return {
    attempts: Math.max(floor, sum),
    breakdown: { required, availability, difficulty, variant, floor, sum },
  };
}
