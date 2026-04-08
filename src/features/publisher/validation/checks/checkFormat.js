import { FORMAT_REGISTRY } from '../formatRegistry.js';

/**
 * Format pattern validation (Step 6). Runs after normalization.
 * Checks both the template registry and optional custom format_hint.
 *
 * @param {*} value - Normalized field value
 * @param {string} templateName - from parse.template
 * @param {string|null} [formatHint] - from enum.match.format_hint (regex string)
 * @returns {{ pass: boolean, reason?: string }}
 */
export function checkFormat(value, templateName, formatHint) {
  if (typeof value !== 'string') return { pass: true };
  if (value === 'unk') return { pass: true };

  // 1. Template registry check (existing behavior)
  const regex = FORMAT_REGISTRY[templateName];
  if (regex && !regex.test(value)) {
    return {
      pass: false,
      reason: `format_mismatch: "${value}" does not match ${templateName} format ${regex}`,
    };
  }

  // 2. Custom format_hint check (from field rule)
  if (formatHint && typeof formatHint === 'string') {
    const hintRegex = new RegExp(formatHint);
    if (!hintRegex.test(value)) {
      return {
        pass: false,
        reason: `format_hint: "${value}" does not match pattern ${formatHint}`,
      };
    }
  }

  return { pass: true };
}
