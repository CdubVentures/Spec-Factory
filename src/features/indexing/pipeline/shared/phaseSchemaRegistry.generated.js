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
import { buildKeyFinderPrompt } from '../../../key/keyLlmAdapter.js';
import { keyFinderResponseSchema } from '../../../key/keySchema.js';
import { RDF_DEFAULT_TEMPLATE, RDF_SOURCE_VARIANT_GUIDANCE_SLOTS, RDF_VARIANT_DISAMBIGUATION_SLOTS } from '../../../release-date/releaseDateLlmAdapter.js';
import { SKF_DEFAULT_TEMPLATE, SKU_SOURCE_VARIANT_GUIDANCE_SLOTS, SKU_VARIANT_DISAMBIGUATION_SLOTS } from '../../../sku/skuLlmAdapter.js';
import { KEY_FINDER_DEFAULT_TEMPLATE } from '../../../key/keyLlmAdapter.js';

export const FINDER_PHASE_SCHEMAS = Object.freeze({
  'color-finder': {
    system_prompt: buildColorEditionFinderPrompt({ product: { brand: '{brand}', model: '{model}', category: '{category}' } }),
    response_schema: zodToLlmSchema(colorEditionFinderResponseSchema),
  },
  'image-finder': {
    system_prompt: buildProductImageFinderPrompt({ product: { brand: '{brand}', model: '{model}', category: '{category}' } }),
    response_schema: zodToLlmSchema(productImageFinderResponseSchema),
  },
  'release-date-finder': {
    system_prompt: buildReleaseDateFinderPrompt({ product: { brand: '{brand}', model: '{model}', category: '{category}' } }),
    response_schema: zodToLlmSchema(releaseDateFinderResponseSchema),
  },
  'sku-finder': {
    system_prompt: buildSkuFinderPrompt({ product: { brand: '{brand}', model: '{model}', category: '{category}' } }),
    response_schema: zodToLlmSchema(skuFinderResponseSchema),
  },
  'key-finder': {
    system_prompt: buildKeyFinderPrompt({ product: { brand: '{brand}', model: '{model}', category: '{category}' } }),
    response_schema: zodToLlmSchema(keyFinderResponseSchema),
  },
});

// WHY: O(1) scalar-finder overlay — adding a new variantFieldProducer with
// defaultTemplateExport yields a full prompt_templates overlay in
// phaseSchemaRegistry.js automatically. No hand-written block required.
export const FINDER_SCALAR_DEFAULT_TEMPLATES = Object.freeze({
  'release-date-finder': { moduleId: 'releaseDateFinder', defaultTemplate: RDF_DEFAULT_TEMPLATE, sourceVariantGuidanceSlots: RDF_SOURCE_VARIANT_GUIDANCE_SLOTS, variantDisambiguationSlots: RDF_VARIANT_DISAMBIGUATION_SLOTS },
  'sku-finder': { moduleId: 'skuFinder', defaultTemplate: SKF_DEFAULT_TEMPLATE, sourceVariantGuidanceSlots: SKU_SOURCE_VARIANT_GUIDANCE_SLOTS, variantDisambiguationSlots: SKU_VARIANT_DISAMBIGUATION_SLOTS },
  'key-finder': { moduleId: 'keyFinder', defaultTemplate: KEY_FINDER_DEFAULT_TEMPLATE },
});
