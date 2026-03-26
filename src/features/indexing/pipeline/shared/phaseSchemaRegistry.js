// WHY: O(1) registry mapping phase UI IDs to their LLM call contracts.
// Adding a new phase = one import + one entry here. GUI auto-renders.

import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';
import { plannerResponseZodSchema, PLANNER_SYSTEM_PROMPT } from '../needSet/searchPlanBuilderLlmAdapter.js';
import { queryEnhancerResponseZodSchema, buildEnhancerSystemPrompt } from '../searchPlanner/queryPlannerLlmAdapter.js';
import { brandResolverLlmResponseSchema, BRAND_RESOLVER_SYSTEM_PROMPT } from '../brandResolver/brandResolverLlmAdapter.js';
import { serpSelectorOutputSchema } from '../resultProcessing/serpSelector.js';
import { SERP_SELECT_URLS_SYSTEM_PROMPT } from '../resultProcessing/serpSelectorLlmAdapter.js';

export const PHASE_SCHEMA_REGISTRY = Object.freeze({
  'needset': {
    system_prompt: PLANNER_SYSTEM_PROMPT,
    response_schema: zodToLlmSchema(plannerResponseZodSchema),
  },
  'search-planner': {
    system_prompt: buildEnhancerSystemPrompt(10),
    response_schema: zodToLlmSchema(queryEnhancerResponseZodSchema),
  },
  'brand-resolver': {
    system_prompt: BRAND_RESOLVER_SYSTEM_PROMPT,
    response_schema: zodToLlmSchema(brandResolverLlmResponseSchema),
  },
  'serp-selector': {
    system_prompt: SERP_SELECT_URLS_SYSTEM_PROMPT,
    response_schema: serpSelectorOutputSchema(),
  },
  'validate': null,
});
