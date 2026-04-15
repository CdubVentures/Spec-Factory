/**
 * resolvePromptTemplate — Pure template resolution engine for LLM system prompts.
 *
 * Contract:
 * - Input: template string with {{VARIABLE}} placeholders, variables map (Record<string, string>)
 * - Output: string with all known {{VAR}}s replaced by their values
 * - Unknown variables (not in map) are left as literal {{VAR}} text
 * - Empty-string variables are replaced (producing empty); whitespace is preserved exactly
 * - Pure function — no side effects, no I/O
 * - Never throws — always returns a string
 */

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Replace {{VARIABLE}} placeholders in a template with values from a variables map.
 * WHY: No whitespace collapsing — default templates must produce byte-identical
 * output to the original prompt builders. Users editing templates control their
 * own whitespace.
 *
 * @param {string} template - Template string with {{VARIABLE_NAME}} placeholders
 * @param {Record<string, string>} variables - Key → value map for substitution
 * @returns {string} Resolved string
 */
export function resolvePromptTemplate(template, variables) {
  const vars = variables || {};
  return template.replace(VARIABLE_PATTERN, (match, varName) =>
    varName in vars ? vars[varName] : match,
  );
}

/**
 * Extract unique variable names from a template string.
 *
 * @param {string} template - Template string with {{VARIABLE_NAME}} placeholders
 * @returns {string[]} Unique variable names found (order of first appearance)
 */
export function extractTemplateVariables(template) {
  const seen = new Set();
  const result = [];
  for (const match of template.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

/**
 * Validate that all required variables are present in a template.
 *
 * @param {string} template - Template string to validate
 * @param {{ name: string, required: boolean }[]} variableDefs - Variable definitions with required flag
 * @returns {{ missing: string[] }} Object with array of missing required variable names
 */
export function validateTemplate(template, variableDefs) {
  const present = new Set(extractTemplateVariables(template));
  const missing = variableDefs
    .filter(v => v.required && !present.has(v.name))
    .map(v => v.name);
  return { missing };
}
