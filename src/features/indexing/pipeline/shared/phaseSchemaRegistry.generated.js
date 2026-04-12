// AUTO-GENERATED from src/core/finder/finderModuleRegistry.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';

import { buildColorEditionFinderPrompt } from '../../../color-edition/colorEditionLlmAdapter.js';
import { colorEditionFinderResponseSchema } from '../../../color-edition/colorEditionSchema.js';
import { buildProductImageFinderPrompt, buildHeroImageFinderPrompt } from '../../../product-image/productImageLlmAdapter.js';
import { productImageFinderResponseSchema } from '../../../product-image/productImageSchema.js';

export const FINDER_PHASE_SCHEMAS = Object.freeze({
  'color-finder': {
    system_prompt: buildColorEditionFinderPrompt({ product: { brand: '{brand}', model: '{model}' } }),
    response_schema: zodToLlmSchema(colorEditionFinderResponseSchema),
  },
  'image-finder': {
    system_prompt: buildProductImageFinderPrompt({ product: { brand: '{brand}', model: '{model}' } }),
    hero_system_prompt: buildHeroImageFinderPrompt({ product: { brand: '{brand}', model: '{model}' } }),
    response_schema: zodToLlmSchema(productImageFinderResponseSchema),
  },
});
