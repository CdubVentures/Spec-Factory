/**
 * Per-run-type secondary view hints.
 *
 * Each PIF prompt lists a PRIORITY section (the views being actively
 * searched) and an ADDITIONAL section (catch-any hints). The three
 * settings resolved here populate the ADDITIONAL section for each
 * run type:
 *
 *   - priority-view run: one LLM call targeting all priority views at once;
 *     hints come from singleRunSecondaryHints (legacy key, label
 *     "Priority View Run Secondary Hints").
 *   - individual-view run: one LLM call targeting a single specific view;
 *     hints come from individualViewRunSecondaryHints, focus view excluded.
 *   - loop run: per-focus-view calls driven by the carousel strategy;
 *     hints come from loopRunSecondaryHints, focus view excluded.
 *
 * Empty hints = no ADDITIONAL section (tight focus).
 */

import { CANONICAL_VIEW_KEYS } from './productImageLlmAdapter.js';

export const CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS = Object.freeze({});
export const CATEGORY_LOOP_RUN_SECONDARY_HINTS_DEFAULTS = Object.freeze({});
export const CATEGORY_INDIVIDUAL_VIEW_RUN_SECONDARY_HINTS_DEFAULTS = Object.freeze({});

function parseHints(setting) {
  if (!setting || !setting.trim()) return null;
  let parsed;
  try {
    parsed = JSON.parse(setting);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed.filter((k) => CANONICAL_VIEW_KEYS.includes(k));
}

export function resolveSingleRunSecondaryHints(setting, category) {
  const parsed = parseHints(setting);
  if (parsed !== null) return parsed;
  return CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS[category] ?? [];
}

export function resolveLoopRunSecondaryHints(setting, category) {
  const parsed = parseHints(setting);
  if (parsed !== null) return parsed;
  return CATEGORY_LOOP_RUN_SECONDARY_HINTS_DEFAULTS[category] ?? [];
}

export function resolveIndividualViewRunSecondaryHints(setting, category) {
  const parsed = parseHints(setting);
  if (parsed !== null) return parsed;
  return CATEGORY_INDIVIDUAL_VIEW_RUN_SECONDARY_HINTS_DEFAULTS[category] ?? [];
}
