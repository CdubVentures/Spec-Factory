/**
 * Product Image Finder — LLM adapter (per-variant).
 *
 * Each LLM call targets ONE variant (a specific color or edition).
 * The prompt asks for direct-download URLs for requested views of
 * that exact variant. Web-capable models browse to find images.
 *
 * Identity-aware: uses base_model, variant, and sibling exclusion
 * to ensure the correct product is targeted (same pattern as CEF).
 *
 * View vocabulary aligned with the Photoshop cut-out pipeline
 * (webp-all-options.jsx) so downloaded filenames feed directly
 * into the image-processing toolchain.
 */

import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { productImageFinderResponseSchema } from './productImageSchema.js';

/* ── Canonical view vocabulary ───────────────────────────────────── */

/**
 * The 8 canonical product-photography views. Key names match the
 * Photoshop pipeline's PRESET_BASENAMES for cut-out processing.
 */
export const CANONICAL_VIEWS = Object.freeze([
  { key: 'top',    label: 'Top' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left',   label: 'Left' },
  { key: 'right',  label: 'Right' },
  { key: 'front',  label: 'Front' },
  { key: 'rear',   label: 'Rear' },
  { key: 'sangle', label: 'S-Angle (Front/Side 3/4)' },
  { key: 'angle',  label: 'Angle (Rear/Top 3/4)' },
]);

export const CANONICAL_VIEW_KEYS = Object.freeze(CANONICAL_VIEWS.map(v => v.key));

/**
 * Per-category default view configs. Order = priority.
 * Each entry: { key, description } — description is injected into
 * the LLM prompt so it understands what the angle looks like.
 */
export const CATEGORY_VIEW_DEFAULTS = Object.freeze({
  mouse: [
    { key: 'top',   description: 'Bird\'s-eye shot looking directly down at the mouse from above — camera is directly overhead, mouse flat on surface, showing full shape outline' },
    { key: 'left',  description: 'Strict side profile from the left at eye level — camera level with the mouse, no tilt, showing the full side silhouette, button profile, and scroll wheel' },
    { key: 'angle', description: 'Rear/top 3/4 angle showing the mouse from above and behind at roughly 30–45 degrees — common press/marketing hero shot' },
  ],
  monitor: [
    { key: 'front',  description: 'Head-on front view of the monitor — camera faces the display straight on, showing the full screen, bezels, and stand' },
    { key: 'angle',  description: 'Rear/top 3/4 angle showing the monitor from behind and slightly above — showing the back panel design and stand' },
    { key: 'rear',   description: 'Head-on rear view showing the back panel, ports, VESA mount area, and cable management' },
  ],
  keyboard: [
    { key: 'top',    description: 'Bird\'s-eye shot looking directly down at the keyboard from above — camera directly overhead, showing the full key layout and keycap legends' },
    { key: 'left',   description: 'Strict side profile from the left at eye level — showing the keyboard height profile, key travel, and wrist-rest if present' },
    { key: 'angle',  description: 'Front/top 3/4 angle showing the keyboard from the front and slightly above at roughly 30–45 degrees' },
  ],
});

const DEFAULT_FALLBACK_VIEWS = CATEGORY_VIEW_DEFAULTS.mouse;

/**
 * Resolve effective view config for a category.
 * Priority: explicit viewConfig setting → category defaults → fallback.
 */
export function resolveViewConfig(viewConfigSetting, category) {
  // 1. Explicit viewConfig JSON from settings
  if (viewConfigSetting && typeof viewConfigSetting === 'string' && viewConfigSetting.trim()) {
    try {
      const parsed = JSON.parse(viewConfigSetting);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fall through */ }
  }

  // 2. Category defaults
  if (category && CATEGORY_VIEW_DEFAULTS[category]) {
    return CATEGORY_VIEW_DEFAULTS[category];
  }

  // 3. Fallback
  return DEFAULT_FALLBACK_VIEWS;
}

/**
 * Legacy migration: build viewConfig from old view1/view2 settings.
 */
export function migrateFromLegacyViews(view1, view2, category) {
  const defaults = CATEGORY_VIEW_DEFAULTS[category] || DEFAULT_FALLBACK_VIEWS;
  const defaultDescMap = Object.fromEntries(defaults.map(v => [v.key, v.description]));

  const views = [];
  if (view1) {
    views.push({
      key: view1,
      description: defaultDescMap[view1] || `${view1} view of the product`,
    });
  }
  if (view2) {
    views.push({
      key: view2,
      description: defaultDescMap[view2] || `${view2} view of the product`,
    });
  }
  return views.length > 0 ? views : defaults;
}

/* ── Prompt builder ──────────────────────────────────────────────── */

/**
 * Build the system prompt for a single variant image search.
 *
 * @param {object} opts
 * @param {object} opts.product — { brand, model, base_model, variant }
 * @param {string} opts.variantLabel — marketing name, atom, or edition display_name
 * @param {string} opts.variantType — "color" or "edition"
 * @param {Array<{key:string, description:string}>} opts.viewConfig — ordered priority views
 * @param {number} opts.minWidth — minimum image width in pixels
 * @param {number} opts.minHeight — minimum image height in pixels
 * @param {string[]} opts.siblingsExcluded — sibling model names to avoid (from CEF)
 * @returns {string}
 */
export function buildProductImageFinderPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  viewConfig = [],
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

  const siblingLine = siblingsExcluded.length > 0
    ? `\nKnown sibling models to EXCLUDE (do NOT return images of these): ${siblingsExcluded.join(', ')}\n`
    : '';

  // Priority views with full descriptions
  const priorityKeys = new Set(viewConfig.map(v => v.key));
  const prioritySection = viewConfig.map((v, i) =>
    `${i + 1}. "${v.key}" — ${v.description}`
  ).join('\n');

  // Bonus views: canonical views NOT in priority list
  const bonusViews = CANONICAL_VIEWS.filter(v => !priorityKeys.has(v.key));
  const bonusLine = bonusViews.length > 0
    ? `\nBONUS VIEWS — if you find clean product shots from these angles, include them:\n${bonusViews.map(v => `- "${v.key}" (${v.label})`).join('\n')}\n`
    : '';

  const allViewKeys = CANONICAL_VIEW_KEYS.join(', ');

  return `Find high-resolution product images for: ${brand} ${model} — ${variantDesc}

IDENTITY: You are looking for the EXACT product "${brand} ${model}"${variant ? ` (variant: ${variant})` : ''}. Not a different model in the same product family. If you encounter sibling models, skip them.
${siblingLine}
PRIORITY VIEWS — find these first, they are the most important:
${prioritySection}

For each priority view, find up to 3 candidate images ranked by resolution and clarity.
${bonusLine}
Every image you return MUST be classified with one of these exact view names: ${allViewKeys}

Image requirements:
- Clean product shot — the product isolated on a white or plain background, or a clean studio/press shot
- NOT: lifestyle photos, hero banners, marketing collages, box art, screenshots, in-use/in-hand photos, group shots
- The image must show the EXACT product: ${brand} ${model} in ${variantDesc}
- Minimum resolution: ${minWidth}px wide, ${minHeight}px tall — bigger is always better
- The URL must be a DIRECT link to the image file (.jpg, .png, .webp or image content-type). Not a page URL.
- If a site uses dynamic image URLs (e.g. query-string sizing), find or construct the highest-resolution static variant
- Prefer images where the product fills most of the frame with minimal background
- Images below the minimum resolution will be rejected — do not return small thumbnails or icons

Search strategy:
- Search broadly: manufacturer product pages, Amazon, Best Buy, Newegg, retailer CDNs, press kits, review sites with high-res product galleries
- Look for the specific ${variantType === 'edition' ? 'edition' : 'color'} variant page or color selector
- Prioritize the highest-resolution version you can find from ANY reliable source

If a specific view is genuinely unavailable for this variant, omit it from the results rather than substituting a wrong angle.

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
    viewConfig: domainArgs.viewConfig || [],
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
