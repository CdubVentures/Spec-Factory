/**
 * Product Image Finder — LLM adapter (per-variant).
 *
 * Each LLM call targets ONE variant (a specific color or edition).
 * The prompt asks for direct-download URLs for view1 + view2 of
 * that exact variant. Web-capable models browse to find images.
 */

import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { productImageFinderResponseSchema } from './productImageSchema.js';

/**
 * Build the system prompt for a single variant image search.
 *
 * @param {object} opts
 * @param {object} opts.product — { brand, model }
 * @param {string} opts.variantLabel — marketing name, atom, or edition display_name
 * @param {string} opts.variantType — "color" or "edition"
 * @param {string} opts.view1 — primary view angle
 * @param {string} opts.view2 — secondary view angle (empty = skip)
 * @param {number} opts.minWidth — minimum image width in pixels
 * @returns {string}
 */
export function buildProductImageFinderPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  view1 = 'top',
  view2 = 'left',
  minWidth = 800,
}) {
  const brand = product.brand || '';
  const model = product.model || '';

  const variantDesc = variantType === 'edition'
    ? `the "${variantLabel}" edition`
    : `the "${variantLabel}" color variant`;

  const requestedViews = [view1, view2].filter(Boolean);
  const viewList = requestedViews.map((v, i) => `${i + 1}. "${v}" view`).join('\n');

  return `Find official product identity images for: ${brand} ${model} — ${variantDesc}

Find the following views:
${viewList}

Image requirements:
- Official manufacturer product shots ONLY (not lifestyle, not review site photos, not user-generated)
- The image must show the EXACT variant: ${variantDesc}
- Clean product-only image on white or transparent background preferred
- Minimum resolution: ${minWidth}px wide
- The URL must be a DIRECT link to the image file (.jpg, .png, .webp or image content-type). Not a page URL.
- Prefer the manufacturer's media/press CDN or official product page image assets
- If the manufacturer uses dynamic image URLs, find the highest-resolution static variant

Search strategy:
- Start with the manufacturer's official product page for ${brand} ${model}
- Look for the specific ${variantType === 'edition' ? 'edition' : 'color'} variant page or color selector
- Check the manufacturer's press/media kit if available
- Check major retailer product pages (Amazon, Best Buy, Newegg) for high-res images of this variant
- For each view, find the BEST single image — do not return multiple candidates per view

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
      variant_label: domainArgs.variantLabel || '',
      variant_type: domainArgs.variantType || 'color',
    }),
  }));
}
