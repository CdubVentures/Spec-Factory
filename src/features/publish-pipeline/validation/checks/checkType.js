import { UNK_TOKENS } from '../unkTokens.js';

/**
 * Type verification (Step 2). Auto-coerces where safe.
 * @param {*} value - Field value (post-shape-check)
 * @param {'string'|'number'} expectedType
 * @param {string} [templateType] - Parse template name (reserved for future use)
 * @returns {{ pass: boolean, repaired?: any, rule?: string, reason?: string }}
 */
export function checkType(value, expectedType, templateType) {
  if (expectedType === 'string') {
    if (typeof value === 'string') return { pass: true };
    if (typeof value === 'number') return { pass: true, repaired: String(value), rule: 'number_to_string' };
    if (typeof value === 'boolean') return { pass: true, repaired: value ? 'yes' : 'no', rule: 'bool_to_string' };
    return { pass: false, reason: `expected string, got ${typeof value}` };
  }

  if (expectedType === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) return { pass: true };

    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (lower === '' || UNK_TOKENS.has(lower)) {
        return { pass: true, repaired: 'unk', rule: 'unk_token' };
      }
      const stripped = value.replace(/[^\d.\-]/g, '');
      if (stripped.length > 0) {
        const parsed = Number(stripped);
        if (Number.isFinite(parsed)) {
          return { pass: true, repaired: parsed, rule: 'string_to_number' };
        }
      }
      return { pass: false, reason: `expected number, got non-numeric string: "${value}"` };
    }

    return { pass: false, reason: `expected number, got ${typeof value}` };
  }

  return { pass: false, reason: `unsupported type: ${expectedType}` };
}
