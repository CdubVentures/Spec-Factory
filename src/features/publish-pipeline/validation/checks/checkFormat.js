import { FORMAT_REGISTRY } from '../formatRegistry.js';

/**
 * Format pattern validation (Step 4). Runs after normalization.
 * Format failures mean the LLM produced genuinely malformed output.
 *
 * @param {*} value - Normalized field value
 * @param {string} templateName - from parse.template
 * @returns {{ pass: boolean, reason?: string }}
 */
export function checkFormat(value, templateName) {
  if (typeof value !== 'string') return { pass: true };
  if (value === 'unk') return { pass: true };

  const regex = FORMAT_REGISTRY[templateName];
  if (!regex) return { pass: true };

  if (regex.test(value)) return { pass: true };

  return {
    pass: false,
    reason: `format_mismatch: "${value}" does not match ${templateName} format ${regex}`,
  };
}
