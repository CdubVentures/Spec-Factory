// WHY: Shared SSOT for deciding which effort label to store/display.
// Rule: baked model-name suffix wins; otherwise configured effort only applies when thinking is on.
// Used by backend (routing.js, finderOrchestrationHelpers.js) and mirrored in TS for the GUI.
import { extractEffortFromModelName } from './effortFromModelName.js';

/**
 * @param {object} input
 * @param {string} [input.model]
 * @param {string} [input.effortLevel]
 * @param {boolean} [input.thinking]
 * @returns {string} effort label ('low'|'medium'|'high'|'xhigh'|'minimal') or ''
 */
export function resolveEffortLabel({ model, effortLevel, thinking } = {}) {
  const baked = extractEffortFromModelName(model);
  if (baked) return baked;
  return thinking ? String(effortLevel || '') : '';
}
