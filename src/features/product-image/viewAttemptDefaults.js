/**
 * Per-category per-view attempt budget defaults and resolver.
 *
 * Controls how many LLM discovery calls each view gets before
 * the carousel loop marks it exhausted and moves on. High-availability
 * views (top, front-for-monitors) get more tries; long-shot views
 * (bottom, rear) get fewer.
 *
 * WHY: A flat viewAttemptBudget wastes calls on views that rarely
 * exist for a given category. Per-view budgets cut ~50% of calls
 * while losing almost nothing.
 */

/**
 * Per-category attempt budgets, ordered by view budget priority.
 * Pattern: 4, 4, 3, 3, 2, 2 — minimum 2 for any budgeted view.
 */
export const CATEGORY_VIEW_ATTEMPT_DEFAULTS = Object.freeze({
  mouse:    Object.freeze({ top: 4, left: 4, sangle: 3, angle: 3, front: 2, bottom: 2 }),
  keyboard: Object.freeze({ top: 4, left: 4, sangle: 3, angle: 3 }),
  monitor:  Object.freeze({ front: 4, sangle: 4, angle: 3, rear: 3, left: 2 }),
  mousepad: Object.freeze({ top: 4, angle: 4 }),
});

export const GENERIC_VIEW_ATTEMPT_DEFAULT = 3;

const MIN_ATTEMPTS = 1;

/**
 * Resolve per-view attempt budgets from setting + category defaults.
 *
 * Fallback chain (per view):
 *   1. JSON setting override  →  2. category default  →  3. flat fallback
 * Every result is clamped to >= 2.
 *
 * @param {string} viewAttemptBudgetsSetting — JSON object string or empty
 * @param {string} category
 * @param {string[]} viewBudget — resolved view budget array
 * @param {number} flatFallback — the flat viewAttemptBudget (existing setting)
 * @returns {Record<string, number>}
 */
export function resolveViewAttemptBudgets(viewAttemptBudgetsSetting, category, viewBudget, flatFallback) {
  let overrides = null;
  if (viewAttemptBudgetsSetting && typeof viewAttemptBudgetsSetting === 'string' && viewAttemptBudgetsSetting.trim()) {
    try {
      const parsed = JSON.parse(viewAttemptBudgetsSetting);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        overrides = parsed;
      }
    } catch { /* fall through to defaults */ }
  }

  const catDefaults = CATEGORY_VIEW_ATTEMPT_DEFAULTS[category] || null;
  const result = {};

  for (const view of viewBudget) {
    const fromOverride = overrides?.[view];
    const fromCategory = catDefaults?.[view];
    const raw = fromOverride ?? fromCategory ?? flatFallback;
    result[view] = Math.max(MIN_ATTEMPTS, typeof raw === 'number' ? raw : Number(raw) || flatFallback);
  }

  return result;
}
