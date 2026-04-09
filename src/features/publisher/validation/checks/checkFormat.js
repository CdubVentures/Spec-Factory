import { FORMAT_REGISTRY } from '../formatRegistry.js';

/**
 * Format pattern validation (Step 5). Runs after normalization.
 * Checks both the type format registry and optional custom format_hint.
 *
 * @param {*} value - Normalized field value
 * @param {string} type - from contract.type
 * @param {string|null} [formatHint] - from enum.match.format_hint (regex string)
 * @returns {{ pass: boolean, reason?: string }}
 */
export function checkFormat(value, type, formatHint) {
  if (typeof value !== 'string') return { pass: true };
  if (value === 'unk') return { pass: true };

  // 1. Type format registry check
  const regex = FORMAT_REGISTRY[type];
  if (regex && !regex.test(value)) {
    return {
      pass: false,
      reason: `format_mismatch: "${value}" does not match ${type} format ${regex}`,
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
