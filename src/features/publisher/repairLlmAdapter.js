/**
 * Repair-adapter LLM adapter.
 *
 * Wires the repair-adapter's prompts (P1-P7) to the LLM infrastructure
 * via createPhaseCallLlm. Follows the exact same pattern as
 * colorEditionLlmAdapter.js — standalone feature adapter using the
 * shared factory.
 *
 * The returned callLlm function receives domainArgs from repairField.js
 * and maps them to the LLM call with phase/reason/role routing.
 */

import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { repairResponseJsonSchema } from './repair-adapter/repairResponseSchema.js';
import { REPAIR_SYSTEM_PROMPT, HALLUCINATION_PATTERNS } from './repair-adapter/promptBuilder.js';

const REPAIR_SYSTEM = REPAIR_SYSTEM_PROMPT + '\n\n' + HALLUCINATION_PATTERNS;

export const REPAIR_LLM_SPEC = {
  phase: 'validate',
  reason: 'field_repair',
  role: 'validate',
  system: REPAIR_SYSTEM,
  jsonSchema: repairResponseJsonSchema,
};

/**
 * Factory: create a bound LLM caller for field repair.
 * @param {{ callRoutedLlmFn, config, logger }} deps — from buildLlmCallDeps()
 * @returns {(domainArgs: { user: string, promptId?: string, fieldKey?: string }) => Promise<object>}
 */
export function createRepairCallLlm(deps) {
  return createPhaseCallLlm(deps, REPAIR_LLM_SPEC, (domainArgs) => ({
    user: domainArgs.user,
    reason: domainArgs.promptId ? `field_repair_${domainArgs.promptId}` : 'field_repair',
    usageContext: { promptId: domainArgs.promptId, fieldKey: domainArgs.fieldKey },
  }));
}
