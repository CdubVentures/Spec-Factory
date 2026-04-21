// WHY: Safety net for the LLM novelty-enforcement requirement. When the
// user enables discoveryQueryHistoryEnabled and the LLM still rubber-stamps
// prior-run queries (ignoring the HISTORY AWARENESS rule), this module
// detects the collision post-generation and appends a deterministic
// phrasing-family suffix so the executed query differs from history.
// Pure function — no I/O, no config, trivially testable.
//
// Phrasing families match the list already documented in the LLM prompt
// (queryPlannerLlmAdapter.js TIER 3 sub-rule 3d): review, teardown, measured,
// benchmark, spec sheet, comparison, reference.

export const DEFAULT_PHRASING_FAMILIES = Object.freeze([
  'review',
  'teardown',
  'measured',
  'benchmark',
  'spec sheet',
  'comparison',
  'reference',
]);

/**
 * Normalize a query for collision detection:
 * lowercase + strip non-word chars + collapse whitespace.
 */
export function normalizeQueryKey(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {{
 *   rows: Array<{query: string, [k: string]: unknown}>,
 *   queryHistory: string[],
 *   phrasingFamilies?: string[],
 * }} opts
 * @returns {{ rows: Array<object>, rotated: number, noveltyRate: number }}
 */
export function enforceNovelty({
  rows = [],
  queryHistory = [],
  phrasingFamilies = DEFAULT_PHRASING_FAMILIES,
} = {}) {
  const histSet = new Set((Array.isArray(queryHistory) ? queryHistory : []).map(normalizeQueryKey));
  const phrasings = Array.isArray(phrasingFamilies) && phrasingFamilies.length > 0
    ? phrasingFamilies
    : DEFAULT_PHRASING_FAMILIES;

  let rotated = 0;
  let phraseIndex = 0;

  const outRows = (Array.isArray(rows) ? rows : []).map((r) => {
    const q = String(r?.query || '');
    const norm = normalizeQueryKey(q);
    if (!norm || !histSet.has(norm)) {
      return { ...r };
    }
    // Collision detected — rotate with next phrasing family.
    const phrase = phrasings[phraseIndex % phrasings.length];
    phraseIndex += 1;
    rotated += 1;
    return { ...r, query: `${q} ${phrase}` };
  });

  const total = outRows.length;
  const noveltyRate = total === 0 ? 1 : (total - rotated) / total;

  return { rows: outRows, rotated, noveltyRate };
}
