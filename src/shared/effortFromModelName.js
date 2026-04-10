// WHY: Shared between backend (routing.js) and frontend (LlmPhaseSection.tsx).
// Single source of truth per O(1) scaling rule.
export const EFFORT_LEVELS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh']);

/** Returns the baked-in effort from a model name suffix, or null. */
export function extractEffortFromModelName(modelName) {
  const s = String(modelName || '').trim().toLowerCase();
  if (!s) return null;
  for (const sep of ['-', '_']) {
    for (const effort of EFFORT_LEVELS) {
      if (s.endsWith(sep + effort)) return effort;
    }
  }
  return null;
}
