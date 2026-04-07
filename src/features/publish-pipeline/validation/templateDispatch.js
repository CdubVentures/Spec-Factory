import {
  normalizeBoolean,
  normalizeColorList,
  parseDate,
  parseLatencyList,
  parsePollingList,
} from './normalizers.js';

// WHY: O(1) dispatch. Adding a template = add one entry here. Zero pipeline changes.
// Templates not in this map fall through to the type-branch (checkType handles them).
const TEMPLATE_NORMALIZERS = {
  boolean_yes_no_unk:        normalizeBoolean,
  list_of_tokens_delimited:  normalizeColorList,
  date_field:                parseDate,
  latency_list_modes_ms:     parseLatencyList,
  list_of_numbers_with_unit: parsePollingList,
};

/**
 * O(1) template dispatch. Routes specialized templates to their normalizer.
 * Returns null for fallthrough templates (handled by the type-branch instead).
 *
 * @param {string} templateName - from fieldRule.parse.template
 * @param {*} value - raw field value
 * @param {object} [context] - optional context for future use
 * @returns {*|null} Normalized value, or null if no normalizer exists
 */
export function dispatchTemplate(templateName, value, context) {
  const fn = TEMPLATE_NORMALIZERS[templateName];
  if (typeof fn !== 'function') return null;
  return fn(value, context);
}
