/**
 * Per-run-type secondary view hints.
 *
 * Each PIF prompt lists a PRIMARY section (the views being actively
 * searched) and an ADDITIONAL section (catch-any hints). The two
 * settings resolved here populate the ADDITIONAL section for each
 * run type:
 *
 *   - single run: one LLM call targeting all priority views at once;
 *     hints come from singleRunSecondaryHints.
 *   - loop run: per-focus-view calls driven by the carousel strategy;
 *     hints come from loopRunSecondaryHints.
 *
 * Empty hints = no ADDITIONAL section (tight focus).
 */

import { CANONICAL_VIEW_KEYS } from './productImageLlmAdapter.js';

export const CATEGORY_SINGLE_RUN_SECONDARY_HINTS_DEFAULTS = Object.freeze({});
export const CATEGORY_LOOP_RUN_SECONDARY_HINTS_DEFAULTS = Object.freeze({});

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
