// WHY: O(1) registry mapping phase UI IDs to their LLM call contracts.
// Non-finder phases are manual. Finder phases are auto-generated from
// the finder module registry via codegen (phaseSchemaRegistry.generated.js).

import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';
import { plannerResponseZodSchema, PLANNER_SYSTEM_PROMPT } from '../needSet/searchPlanBuilderLlmAdapter.js';
import { queryEnhancerResponseZodSchema, buildEnhancerSystemPrompt } from '../searchPlanner/queryPlannerLlmAdapter.js';
import { brandResolverLlmResponseSchema, BRAND_RESOLVER_SYSTEM_PROMPT } from '../brandResolver/brandResolverLlmAdapter.js';
import { serpSelectorOutputSchema } from '../resultProcessing/serpSelector.js';
import { SERP_SELECT_URLS_SYSTEM_PROMPT } from '../resultProcessing/serpSelectorLlmAdapter.js';
import { REPAIR_SYSTEM_PROMPT, HALLUCINATION_PATTERNS } from '../../../publisher/repair-adapter/promptBuilder.js';
import { repairResponseJsonSchema } from '../../../publisher/repair-adapter/repairResponseSchema.js';
import { FINDER_PHASE_SCHEMAS } from './phaseSchemaRegistry.generated.js';
import { buildViewEvalPrompt, buildHeroSelectionPrompt } from '../../../product-image/imageEvaluator.js';
import { viewEvalResponseSchema, heroEvalResponseSchema } from '../../../product-image/imageEvaluatorSchema.js';
import {
  GENERIC_VIEW_DESCRIPTIONS,
  CANONICAL_VIEW_KEYS,
  resolveViewEvalCriteria,
  resolveHeroEvalCriteria,
} from '../../../product-image/productImageLlmAdapter.js';

const NON_FINDER_PHASES = Object.freeze({
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
  'validate': {
    system_prompt: REPAIR_SYSTEM_PROMPT + '\n\n' + HALLUCINATION_PATTERNS,
    response_schema: repairResponseJsonSchema,
  },
});

// WHY: Carousel Builder has per-view prompts — one system prompt per canonical view + hero.
// Stored as view_prompts map so the LLM Config GUI can render each individually.
// eval_criteria_defaults provides category-specific criteria text for the editable UI.
const EVAL_CRITERIA_CATEGORIES = ['mouse', 'keyboard', 'monitor', 'mousepad'];

function buildEvalCriteriaDefaults() {
  const defaults = {};
  for (const cat of EVAL_CRITERIA_CATEGORIES) {
    const catDefaults = {};
    for (const view of CANONICAL_VIEW_KEYS) {
      catDefaults[view] = resolveViewEvalCriteria(cat, view);
    }
    catDefaults.hero = resolveHeroEvalCriteria(cat);
    defaults[cat] = catDefaults;
  }
  return defaults;
}

const CAROUSEL_BUILDER_PHASE = Object.freeze({
  'image-evaluator': {
    system_prompt: buildViewEvalPrompt({ product: { brand: '{brand}', model: '{model}' }, view: 'top', viewDescription: GENERIC_VIEW_DESCRIPTIONS.top, candidateCount: 3 }),
    hero_system_prompt: buildHeroSelectionPrompt({ product: { brand: '{brand}', model: '{model}' }, viewWinners: [{ view: 'top', filename: 'top-black.png' }, { view: 'left', filename: 'left-black.png' }] }),
    response_schema: zodToLlmSchema(viewEvalResponseSchema),
    hero_response_schema: zodToLlmSchema(heroEvalResponseSchema),
    view_prompts: Object.freeze(
      Object.fromEntries(
        Object.entries(GENERIC_VIEW_DESCRIPTIONS).map(([view, desc]) => [
          view,
          buildViewEvalPrompt({ product: { brand: '{brand}', model: '{model}' }, view, viewDescription: desc, candidateCount: 3 }),
        ]),
      ),
    ),
    eval_criteria_defaults: Object.freeze(buildEvalCriteriaDefaults()),
    eval_criteria_categories: EVAL_CRITERIA_CATEGORIES,
  },
});

export const PHASE_SCHEMA_REGISTRY = Object.freeze({
  ...NON_FINDER_PHASES,
  ...FINDER_PHASE_SCHEMAS,
  ...CAROUSEL_BUILDER_PHASE,
});
