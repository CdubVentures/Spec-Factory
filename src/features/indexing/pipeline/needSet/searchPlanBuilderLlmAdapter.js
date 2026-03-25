// WHY: LLM call factory for the NeedSet search planner.
// Encapsulates reason/role/phase/schema/prompt constants so callers pass only domain data.
// Phase is 'needset' (not 'searchPlanner') so this LLM call picks up
// the needset phase config from the SSOT (e.g. Gemini Flash).

import { z } from 'zod';
import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';

export const plannerResponseZodSchema = z.object({
  planner_confidence: z.number().optional(),
  groups: z.array(z.object({
    key: z.string(),
    phase: z.string().optional(),
    reason_active: z.string().optional(),
  })).optional(),
});

const PLANNER_RESPONSE_SCHEMA = zodToLlmSchema(plannerResponseZodSchema);

const PLANNER_SYSTEM_PROMPT = [
  'You are a search group assessor for hardware specification data collection.',
  'Given product identity and focus groups with unresolved fields, assess each group.',
  'You do NOT write search queries. Query authoring is handled by a separate stage.',
  'Rules:',
  '- For each active group, explain why it is active (reason_active).',
  '- Assign planner_confidence (0-1) reflecting how confident you are about the group priorities.',
  '- weak_field_keys need corroboration from authoritative sources. conflict_field_keys need resolution from manufacturer/official sources.',
  '- Return JSON with a "groups" array where each group has a "key" and "reason_active".',
].join('\n');

export function createSearchPlannerCallLlm({ callRoutedLlmFn, config, logger }) {
  return async ({ payloadJson, llmContext = {}, usageContext = {} }) => {
    return callRoutedLlmFn({
      config,
      reason: 'needset_search_planner',
      role: 'plan',
      phase: 'needset',
      system: PLANNER_SYSTEM_PROMPT,
      user: payloadJson,
      jsonSchema: PLANNER_RESPONSE_SCHEMA,
      usageContext,
      costRates: llmContext.costRates || config,
      onUsage: typeof llmContext.recordUsage === 'function'
        ? async (usageRow) => llmContext.recordUsage(usageRow)
        : undefined,
      logger,
    });
  };
}
