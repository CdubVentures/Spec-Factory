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
 * Per-category defaults for ALL 8 views.
 * Every view has a description so the LLM can classify any shot.
 * `priority: true` marks the views the LLM should focus on first.
 * Order within priority views = search importance.
 */
export const CATEGORY_VIEW_DEFAULTS = Object.freeze({
  mouse: [
    { key: 'top',    priority: true,  description: 'Bird\'s-eye shot looking directly down at the mouse from above — camera directly overhead, showing full shape outline and button layout' },
    { key: 'left',   priority: true,  description: 'Strict side profile from the left at eye level — camera level with the mouse, no tilt, showing the full side silhouette, button profile, and scroll wheel' },
    { key: 'angle',  priority: true,  description: 'Rear/top 3/4 angle showing the mouse from above and behind at roughly 30–45 degrees — product-only on clean background' },
    { key: 'bottom', priority: false, description: 'Underside/belly view showing the base, sensor, mouse feet/skates, and any bottom labels or DPI switch' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level — mirror of the left view, showing right-side buttons and grip texture' },
    { key: 'front',  priority: false, description: 'Head-on front view — camera faces the nose of the mouse showing buttons, scroll wheel, and front profile straight on' },
    { key: 'rear',   priority: false, description: 'Head-on rear view showing the back/rear of the mouse, the palm rest curvature from behind' },
    { key: 'sangle', priority: false, description: 'Front/side 3/4 angle — showing the mouse from the front-left at roughly 30–45 degrees, camera slightly elevated' },
  ],
  monitor: [
    { key: 'front',  priority: true,  description: 'Head-on front view of the monitor — camera faces the display straight on, showing the full screen, bezels, and stand' },
    { key: 'angle',  priority: true,  description: 'Rear/top 3/4 angle showing the monitor from behind and slightly above — showing the back panel design and stand' },
    { key: 'rear',   priority: true,  description: 'Head-on rear view showing the back panel, ports, VESA mount area, and cable management' },
    { key: 'left',   priority: false, description: 'Strict side profile from the left at eye level — showing the monitor thickness, stand profile, and panel depth' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level — mirror of left view' },
    { key: 'top',    priority: false, description: 'Bird\'s-eye shot looking down at the monitor from above — showing the top edge, thickness, and stand base' },
    { key: 'bottom', priority: false, description: 'Underside view showing the bottom bezel and any bottom-mounted ports, buttons, or joystick' },
    { key: 'sangle', priority: false, description: 'Front/side 3/4 angle — showing the monitor from the front-left at roughly 30–45 degrees' },
  ],
  keyboard: [
    { key: 'top',    priority: true,  description: 'Bird\'s-eye shot looking directly down at the keyboard from above — camera directly overhead, showing the full key layout and keycap legends' },
    { key: 'left',   priority: true,  description: 'Strict side profile from the left at eye level — showing the keyboard height profile, key travel, and wrist-rest if present' },
    { key: 'angle',  priority: true,  description: 'Front/top 3/4 angle showing the keyboard from above and slightly in front at roughly 30–45 degrees' },
    { key: 'bottom', priority: false, description: 'Underside view showing the base, rubber feet, tilt legs, and any bottom labels' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level — mirror of left view' },
    { key: 'front',  priority: false, description: 'Head-on front view — camera faces the front edge showing the spacebar and front bezel' },
    { key: 'rear',   priority: false, description: 'Head-on rear view showing the back edge, ports, cable routing, and any rear features' },
    { key: 'sangle', priority: false, description: 'Front/side 3/4 angle — showing the keyboard from the front-left at roughly 30–45 degrees' },
  ],
});

/**
 * Generic default descriptions for any category not in CATEGORY_VIEW_DEFAULTS.
 */
export const GENERIC_VIEW_DESCRIPTIONS = Object.freeze({
  top:    'Bird\'s-eye shot looking directly down at the product from above — camera directly overhead',
  bottom: 'Underside/belly view showing the base and any bottom features',
  left:   'Strict side profile from the left at eye level — camera level, no tilt, full side silhouette',
  right:  'Strict side profile from the right at eye level — mirror of left view',
  front:  'Head-on front view — camera faces the front of the product straight on',
  rear:   'Head-on rear view showing the back panel, ports, and rear design',
  sangle: 'Front/side 3/4 angle — product shot from the front-left at roughly 30–45 degrees, slightly above',
  angle:  'Rear/top 3/4 angle — showing the product from above and behind at roughly 30–45 degrees',
});

/**
 * Ensure a view config contains ALL 8 canonical views.
 * Missing views are filled from category defaults or generic descriptions
 * with priority: false. Views without a `priority` field default to true
 * (backward compat with old configs that only stored priority views).
 */
function ensureAllViews(views, category) {
  const catDefaults = CATEGORY_VIEW_DEFAULTS[category] || [];
  const descMap = {};
  for (const d of catDefaults) descMap[d.key] = d.description;

  // Normalize existing entries: ensure priority field exists
  const normalized = views.map(v => ({
    key: v.key,
    description: v.description || descMap[v.key] || GENERIC_VIEW_DESCRIPTIONS[v.key] || '',
    priority: typeof v.priority === 'boolean' ? v.priority : true, // old configs without priority = priority
  }));

  // Add any missing canonical views as non-priority
  const existing = new Set(normalized.map(v => v.key));
  for (const canon of CANONICAL_VIEWS) {
    if (!existing.has(canon.key)) {
      normalized.push({
        key: canon.key,
        priority: false,
        description: descMap[canon.key] || GENERIC_VIEW_DESCRIPTIONS[canon.key] || `${canon.label} view of the product`,
      });
    }
  }

  return normalized;
}

/**
 * Resolve effective view config for a category.
 * ALWAYS returns all 8 canonical views with descriptions and priority flags.
 *
 * Priority: explicit viewConfig setting → category defaults → generic.
 */
export function resolveViewConfig(viewConfigSetting, category) {
  // 1. Explicit viewConfig JSON from settings
  if (viewConfigSetting && typeof viewConfigSetting === 'string' && viewConfigSetting.trim()) {
    try {
      const parsed = JSON.parse(viewConfigSetting);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return ensureAllViews(parsed, category);
      }
    } catch { /* fall through */ }
  }

  // 2. Category defaults (already has all 8)
  if (category && CATEGORY_VIEW_DEFAULTS[category]) {
    return [...CATEGORY_VIEW_DEFAULTS[category]];
  }

  // 3. Generic fallback — all views, first 3 are priority
  return CANONICAL_VIEWS.map((v, i) => ({
    key: v.key,
    priority: i < 3,
    description: GENERIC_VIEW_DESCRIPTIONS[v.key] || `${v.label} view of the product`,
  }));
}

/**
 * Legacy migration: build viewConfig from old view1/view2 settings.
 * Marks legacy views as priority, fills remaining from category defaults.
 */
export function migrateFromLegacyViews(view1, view2, category) {
  const base = resolveViewConfig('', category);
  const legacyKeys = new Set([view1, view2].filter(Boolean));

  return base.map(v => ({
    ...v,
    priority: legacyKeys.has(v.key) ? true : v.priority,
  }));
}

/* ── Per-variant discovery log accumulation ───────────────────────── */

/**
 * Accumulate discovery logs from previous PIF runs for a specific variant.
 * Unions urls_checked and queries_run across all runs matching the variant_key.
 *
 * @param {object[]} previousRuns — all PIF runs from the JSON store
 * @param {string} variantKey — e.g. "color:black" or "edition:cod-bo6"
 * @returns {{ urlsChecked: string[], queriesRun: string[] }}
 */
export function accumulateVariantDiscoveryLog(previousRuns, variantKey) {
  const urlSet = new Set();
  const querySet = new Set();

  for (const run of previousRuns) {
    // Only accumulate from runs that match this variant
    const rKey = run.response?.variant_key;
    if (rKey !== variantKey) continue;

    const log = run.response?.discovery_log;
    if (!log) continue;

    if (Array.isArray(log.urls_checked)) {
      for (const u of log.urls_checked) urlSet.add(u);
    }
    if (Array.isArray(log.queries_run)) {
      for (const q of log.queries_run) querySet.add(q);
    }
  }

  return {
    urlsChecked: [...urlSet],
    queriesRun: [...querySet],
  };
}

/* ── Prompt builder ──────────────────────────────────────────────── */

/**
 * Build the system prompt for a single variant image search.
 *
 * @param {object} opts
 * @param {object} opts.product — { brand, model, base_model, variant }
 * @param {string} opts.variantLabel — marketing name, atom, or edition display_name
 * @param {string} opts.variantType — "color" or "edition"
 * @param {Array<{key:string, description:string, priority:boolean}>} opts.viewConfig — all views with priority flags
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
  familyModelCount = 1,
  ambiguityLevel = 'easy',
  previousDiscovery = { urlsChecked: [], queriesRun: [] },
}) {
  const brand = product.brand || '';
  const baseModel = product.base_model || '';
  const model = product.model || '';
  const variant = product.variant || '';

  const queryModel = baseModel || model;
  const queryVariant = baseModel ? variant : '';

  const variantDesc = variantType === 'edition'
    ? `the "${variantLabel}" edition`
    : `the "${variantLabel}" color variant`;

  // Identity block scales with ambiguity
  const familyCount = Math.max(1, familyModelCount || 1);
  const ambiguity = ambiguityLevel || 'easy';

  let identityWarning = '';
  if (ambiguity === 'easy') {
    identityWarning = 'This product has no known siblings — standard identity matching applies.';
  } else if (ambiguity === 'medium') {
    identityWarning = `CAUTION: This product has ${familyCount} models in its family. Multiple similar products exist under the "${brand}" brand with similar names. You MUST verify you are looking at the exact "${model}" — not a related model. Check model numbers, product page titles, and URL slugs carefully.`;
  } else {
    // hard, very_hard, extra_hard
    identityWarning = `HIGH AMBIGUITY: This product has ${familyCount} models in its family. Many similar products exist under "${brand}" with overlapping names. TRIPLE-CHECK every image: verify the exact model name "${model}" appears on the product page, in the URL, or in the image alt text. Do NOT guess — if you cannot confirm the exact model, skip the image.`;
  }

  const siblingLine = siblingsExcluded.length > 0
    ? `\nKnown sibling models to EXCLUDE (do NOT return images of these): ${siblingsExcluded.join(', ')}\n`
    : '';

  // Split views into priority and additional
  const priorityViews = viewConfig.filter(v => v.priority);
  const additionalViews = viewConfig.filter(v => !v.priority);

  // Build view definitions — ALL views get full descriptions
  const prioritySection = priorityViews.length > 0
    ? `PRIORITY (search for these first — most important):\n${priorityViews.map((v, i) => `  ${i + 1}. "${v.key}" — ${v.description}`).join('\n')}`
    : '';

  const additionalSection = additionalViews.length > 0
    ? `ADDITIONAL (include if you find clean product shots matching these angles):\n${additionalViews.map(v => `  - "${v.key}" — ${v.description}`).join('\n')}`
    : '';

  const allViewKeys = CANONICAL_VIEW_KEYS.join(', ');

  return `Find high-resolution product images for: ${brand} ${model} — ${variantDesc}

IDENTITY: You are looking for the EXACT product "${brand} ${model}"${variant ? ` (variant: ${variant})` : ''}. Not a different model in the same product family. If you encounter sibling models, skip them.
${identityWarning}
${siblingLine}
VIEW DEFINITIONS — classify every image with one of these exact view names:

${prioritySection}
${additionalSection ? '\n' + additionalSection : ''}

For each priority view, find up to 3 candidate images ranked by resolution and clarity.
For additional views, include any clean product shots you encounter while searching.

Every image you return MUST use one of these view names: ${allViewKeys}

Image requirements:
- Clean product shot — the product isolated on a white or plain background, or a clean studio/press shot
- NOT: lifestyle photos, styled banners, marketing collages, box art, screenshots, in-use/in-hand photos, group shots, images with decorative backgrounds
- The image must show the EXACT product: ${brand} ${model} in ${variantDesc}
- Minimum resolution: ${minWidth}px wide, ${minHeight}px tall — bigger is always better
- The URL must be a DIRECT link to the image file (.jpg, .png, .webp or image content-type). Not a page URL.
- If a site uses dynamic image URLs (e.g. query-string sizing), find or construct the highest-resolution static variant
- Prefer images where the product fills most of the frame with minimal background
- Images below the minimum resolution will be rejected — do not return small thumbnails or icons

${previousDiscovery.urlsChecked.length > 0 || previousDiscovery.queriesRun.length > 0 ? `Previous searches for this variant (do not repeat — find NEW sources or verify these still work):
${previousDiscovery.urlsChecked.length > 0 ? `- URLs already checked: ${JSON.stringify(previousDiscovery.urlsChecked)}` : ''}
${previousDiscovery.queriesRun.length > 0 ? `- Queries already run: ${JSON.stringify(previousDiscovery.queriesRun)}` : ''}
` : ''}Search strategy:
- Search broadly: manufacturer product pages, Amazon, Best Buy, Newegg, retailer CDNs, press kits, review sites with high-res product galleries
- Look for the specific ${variantType === 'edition' ? 'edition' : 'color'} variant page or color selector
- Prioritize the highest-resolution version you can find from ANY reliable source

If a specific view is genuinely unavailable for this variant, omit it rather than returning a wrong angle.

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
    familyModelCount: domainArgs.familyModelCount || 1,
    ambiguityLevel: domainArgs.ambiguityLevel || 'easy',
    previousDiscovery: domainArgs.previousDiscovery || { urlsChecked: [], queriesRun: [] },
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
