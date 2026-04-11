/**
 * Product Image Finder — LLM adapter.
 *
 * Builds the discovery prompt that asks a web-capable LLM to find
 * official product images for specific views (e.g. top, left for mouse).
 * Injects the product's known colors and editions so the LLM targets
 * the correct default-color variant and avoids lifestyle/marketing shots.
 */

import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { productImageFinderResponseSchema } from './productImageSchema.js';

/**
 * Build known-inputs block from previous runs (URLs already checked).
 */
function buildKnownInputs(previousRuns) {
  const urlSet = new Set();
  for (const run of (previousRuns || [])) {
    const urls = run?.response?.discovery_log?.urls_checked;
    if (Array.isArray(urls)) {
      for (const u of urls) urlSet.add(u);
    }
  }
  return { urlsAlreadyChecked: [...urlSet] };
}

/**
 * Build the system prompt for the Product Image Finder.
 *
 * @param {object} opts
 * @param {object} opts.product — { brand, model, variant }
 * @param {string[]} opts.colors — discovered color atoms for this product
 * @param {Record<string,string>} opts.colorNames — { atom: "Marketing Name" }
 * @param {Record<string,object>} opts.editions — { slug: { display_name, colors } }
 * @param {string} opts.defaultColor — default color atom
 * @param {string} opts.view1 — primary view name (e.g. "top")
 * @param {string} opts.view2 — secondary view name (e.g. "left")
 * @param {number} opts.minWidth — minimum image width in pixels
 * @param {object[]} [opts.previousRuns]
 * @returns {string}
 */
export function buildProductImageFinderPrompt({
  product = {},
  colors = [],
  colorNames = {},
  editions = {},
  defaultColor = '',
  view1 = 'top',
  view2 = 'left',
  minWidth = 800,
  previousRuns = [],
}) {
  const brand = product.brand || '';
  const model = product.model || '';

  const known = buildKnownInputs(previousRuns);
  const urlsCheckedStr = known.urlsAlreadyChecked.length > 0
    ? `\nURLs already checked (skip these): ${JSON.stringify(known.urlsAlreadyChecked)}\n`
    : '';

  const colorContext = colors.length > 0
    ? `Known colors: ${colors.map(c => colorNames[c] ? `${c} ("${colorNames[c]}")` : c).join(', ')}`
    : '';
  const defaultColorStr = defaultColor ? `Default color: ${defaultColor}` : '';

  const editionContext = Object.keys(editions).length > 0
    ? `Known editions:\n${Object.entries(editions).map(([slug, ed]) =>
        `- ${slug}: "${ed.display_name}" (colors: ${(ed.colors || []).join(', ')})`
      ).join('\n')}`
    : '';

  const requestedViews = [view1, view2].filter(Boolean);
  const viewList = requestedViews.map((v, i) => `${i + 1}. "${v}" view`).join('\n');

  return `Find official product identity images for: ${brand} ${model}

${colorContext}
${defaultColorStr}
${editionContext}
${urlsCheckedStr}
Find the following views for the DEFAULT COLOR variant (${defaultColor || 'standard'}):
${viewList}

Image requirements:
- Official manufacturer product shots ONLY (not lifestyle, not review site photos, not user-generated)
- Clean product-only image on white or transparent background preferred
- Minimum resolution: ${minWidth}px wide
- The URL must be a DIRECT link to the image file (ending in .jpg, .png, .webp, or served as image content-type). Not a page URL.
- Prefer the manufacturer's media/press CDN or official product page image assets
- If the manufacturer site uses dynamic image URLs, find the highest-resolution static variant

Search strategy:
- Start with the manufacturer's official product page for ${brand} ${model}
- Check the manufacturer's press/media kit if available
- Check major retailer product pages (Amazon, Best Buy, Newegg) for high-res product images
- Right-click / inspect image sources to find the original full-resolution URL
- For each view, find the BEST single image — do not return multiple candidates per view

For each requested view, return the direct image URL. If a specific view is genuinely unavailable, omit it from the results rather than substituting a different angle.

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
    colors: domainArgs.colors || [],
    colorNames: domainArgs.colorNames || {},
    editions: domainArgs.editions || {},
    defaultColor: domainArgs.defaultColor || '',
    view1: domainArgs.view1 || 'top',
    view2: domainArgs.view2 || 'left',
    minWidth: domainArgs.minWidth || 800,
    previousRuns: domainArgs.previousRuns || [],
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
      variant: domainArgs.product?.variant || '',
    }),
  }));
}
