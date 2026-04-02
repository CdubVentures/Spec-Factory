// WHY: O(1) registry mapping phase UI IDs to their LLM call contracts.
// Adding a new phase = one import + one entry here. GUI auto-renders.

import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';
import { plannerResponseZodSchema, PLANNER_SYSTEM_PROMPT } from '../needSet/searchPlanBuilderLlmAdapter.js';
import { queryEnhancerResponseZodSchema, buildEnhancerSystemPrompt } from '../searchPlanner/queryPlannerLlmAdapter.js';
import { brandResolverLlmResponseSchema, BRAND_RESOLVER_SYSTEM_PROMPT } from '../brandResolver/brandResolverLlmAdapter.js';
import { serpSelectorOutputSchema } from '../resultProcessing/serpSelector.js';
import { SERP_SELECT_URLS_SYSTEM_PROMPT } from '../resultProcessing/serpSelectorLlmAdapter.js';
import { colorEditionFinderResponseSchema } from '../../../color-edition/colorEditionSchema.js';
import { buildColorEditionFinderPrompt } from '../../../color-edition/colorEditionLlmAdapter.js';

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
  'color-finder': {
    system_prompt: buildColorEditionFinderPrompt({
      colorNames: ['black', 'white', 'red', 'gray', 'light-gray', 'light-blue', 'dark-green', 'teal', 'yellow', 'blue'],
      colors: [
        { name: 'black', hex: '#000000' }, { name: 'white', hex: '#ffffff' },
        { name: 'red', hex: '#ef4444' }, { name: 'gray', hex: '#6b7280' },
        { name: 'light-gray', hex: '#d1d5db' }, { name: 'light-blue', hex: '#60a5fa' },
        { name: 'dark-green', hex: '#15803d' }, { name: 'teal', hex: '#14b8a6' },
        { name: 'yellow', hex: '#eab308' }, { name: 'blue', hex: '#3b82f6' },
      ],
      product: { brand: '{brand}', model: '{model}', category: '{category}', seed_urls: ['{seed_url}'] },
    }),
    response_schema: zodToLlmSchema(colorEditionFinderResponseSchema),
  },
});
