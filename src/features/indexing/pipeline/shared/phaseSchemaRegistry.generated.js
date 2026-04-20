// AUTO-GENERATED from src/core/finder/finderModuleRegistry.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

import { zodToLlmSchema } from '../../../../core/llm/zodToLlmSchema.js';

import { buildColorEditionFinderPrompt } from '../../../color-edition/colorEditionLlmAdapter.js';
import { colorEditionFinderResponseSchema } from '../../../color-edition/colorEditionSchema.js';
import { buildProductImageFinderPrompt } from '../../../product-image/productImageLlmAdapter.js';
import { productImageFinderResponseSchema } from '../../../product-image/productImageSchema.js';
import { buildReleaseDateFinderPrompt } from '../../../release-date/releaseDateLlmAdapter.js';
import { releaseDateFinderResponseSchema } from '../../../release-date/releaseDateSchema.js';
import { buildSkuFinderPrompt } from '../../../sku/skuLlmAdapter.js';
import { skuFinderResponseSchema } from '../../../sku/skuSchema.js';

export const FINDER_PHASE_SCHEMAS = Object.freeze({
  'color-finder': {
    system_prompt: buildColorEditionFinderPrompt({ product: { brand: '{brand}', model: '{model}' } }),
    response_schema: zodToLlmSchema(colorEditionFinderResponseSchema),
  },
  'image-finder': {
    system_prompt: buildProductImageFinderPrompt({ product: { brand: '{brand}', model: '{model}' } }),
    response_schema: zodToLlmSchema(productImageFinderResponseSchema),
  },
  'release-date-finder': {
    system_prompt: buildReleaseDateFinderPrompt({ product: { brand: '{brand}', model: '{model}' } }),
    response_schema: zodToLlmSchema(releaseDateFinderResponseSchema),
  },
  'sku-finder': {
    system_prompt: buildSkuFinderPrompt({ product: { brand: '{brand}', model: '{model}' } }),
    response_schema: zodToLlmSchema(skuFinderResponseSchema),
  },
});
