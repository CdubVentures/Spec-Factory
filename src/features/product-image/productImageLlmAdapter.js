/**
 * Product Image Finder — LLM adapter (per-variant).
 *
 * Each LLM call targets ONE variant (a specific color or edition).
 * The prompt asks for direct-download URLs for requested views of
 * that exact variant. Web-capable models browse to find images.
 *
 * Identity-aware: uses base_model, variant, and sibling exclusion
 * to ensure the correct product is targeted (same pattern as CEF).
 */

import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { productImageFinderResponseSchema } from './productImageSchema.js';

/**
 * Build the system prompt for a single variant image search.
 *
 * @param {object} opts
 * @param {object} opts.product — { brand, model, base_model, variant }
 * @param {string} opts.variantLabel — marketing name, atom, or edition display_name
 * @param {string} opts.variantType — "color" or "edition"
 * @param {string} opts.view1 — primary view angle
 * @param {string} opts.view2 — secondary view angle (empty = skip)
 * @param {number} opts.minWidth — minimum image width in pixels
 * @param {number} opts.minHeight — minimum image height in pixels
 * @param {string[]} opts.siblingsExcluded — sibling model names to avoid (from CEF)
 * @returns {string}
 */
export function buildProductImageFinderPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  view1 = 'top',
  view2 = 'left',
  minWidth = 800,
  minHeight = 600,
  siblingsExcluded = [],
}) {
  const brand = product.brand || '';
  const baseModel = product.base_model || '';
  const model = product.model || '';
  const variant = product.variant || '';

  // Identity: prefer base_model for search, append variant if present
  const queryModel = baseModel || model;
  const queryVariant = baseModel ? variant : '';
  const productLine = [brand, queryModel, queryVariant].filter(Boolean).join(' ');

  const variantDesc = variantType === 'edition'
    ? `the "${variantLabel}" edition`
    : `the "${variantLabel}" color variant`;

  const requestedViews = [view1, view2].filter(Boolean);
  const viewList = requestedViews.map((v, i) => `${i + 1}. "${v}" view`).join('\n');

  const siblingLine = siblingsExcluded.length > 0
    ? `\nKnown sibling models to EXCLUDE (do NOT return images of these): ${siblingsExcluded.join(', ')}\n`
    : '';

  return `Find high-resolution product images for: ${brand} ${model} — ${variantDesc}

IDENTITY: You are looking for the EXACT product "${brand} ${model}"${variant ? ` (variant: ${variant})` : ''}. Not a different model in the same product family. If you encounter sibling models, skip them.
${siblingLine}
Find the following views:
${viewList}

For each view, find up to 3 candidate images ranked by quality. More is better — download everything promising and we will evaluate.

Image requirements:
- Clean product shot — the product itself, not a lifestyle photo, not a hero banner, not a marketing collage
- The image must show the EXACT product: ${brand} ${model} in ${variantDesc}
- Minimum resolution: ${minWidth}px wide, ${minHeight}px tall — bigger is better
- The URL must be a DIRECT link to the image file (.jpg, .png, .webp or image content-type). Not a page URL.
- If a site uses dynamic image URLs (e.g. query-string sizing), find or construct the highest-resolution static variant
- Prefer images where the product fills most of the frame

Search strategy:
- Search broadly: manufacturer product pages, Amazon, Best Buy, Newegg, retailer CDNs, press kits, review sites with high-res product galleries
- Look for the specific ${variantType === 'edition' ? 'edition' : 'color'} variant page or color selector
- Prioritize the highest-resolution version you can find from ANY reliable source

If a specific view is genuinely unavailable for this variant, omit it from the results.

Return JSON:
- "images": [{ "view": "view-name", "url": "direct-image-url", "source_page": "page-where-found", "alt_text": "image alt text if available" }, ...]
- "discovery_log": { "urls_checked": [...], "queries_run": [...], "notes": [...] }`;
}

export const PRODUCT_IMAGE_FINDER_SPEC = {
  phase: 'imageFinder',
  reason: 'product_image_finding',
  role: 'triage',
  system: (domainArgs) => buildProductImageFinderPrompt({
    product: domainArgs.product,
    variantLabel: domainArgs.variantLabel || '',
    variantType: domainArgs.variantType || 'color',
    view1: domainArgs.view1 || 'top',
    view2: domainArgs.view2 || 'left',
    minWidth: domainArgs.minWidth || 800,
    minHeight: domainArgs.minHeight || 600,
    siblingsExcluded: domainArgs.siblingsExcluded || [],
  }),
  jsonSchema: zodToLlmSchema(productImageFinderResponseSchema),
};

/**
 * Factory: create a bound LLM caller for the Product Image Finder.
 */
export function createProductImageFinderCallLlm(deps) {
  return createPhaseCallLlm(deps, PRODUCT_IMAGE_FINDER_SPEC, (domainArgs) => ({
    user: JSON.stringify({
      brand: domainArgs.product?.brand || '',
      model: domainArgs.product?.model || '',
      base_model: domainArgs.product?.base_model || '',
      variant_label: domainArgs.variantLabel || '',
      variant_type: domainArgs.variantType || 'color',
    }),
  }));
}
