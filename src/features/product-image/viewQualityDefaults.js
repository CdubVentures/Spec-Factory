/**
 * Per-view per-category quality thresholds for the Product Image Finder.
 *
 * Rule: the "long" dimension for any view is always >= 600.
 * Portrait views (top/bottom) have height >= 600.
 * Landscape views (side/angle) have width >= 600.
 * The short axis reflects the product's natural shape from that angle.
 *
 * These are FALLBACK DEFAULTS only — the SSOT is the per-category
 * `viewQualityConfig` setting in product_image_finder_settings.
 */

import { CANONICAL_VIEW_KEYS } from './productImageLlmAdapter.js';

const q = (minWidth, minHeight, minFileSize = 30000) => ({ minWidth, minHeight, minFileSize });

export const CATEGORY_VIEW_QUALITY_DEFAULTS = Object.freeze({
  mouse: Object.freeze({
    top:    q(300, 600),  // portrait — mouse narrow from above
    bottom: q(300, 600),
    left:   q(600, 300),  // landscape side profile
    right:  q(600, 300),
    front:  q(400, 600),  // head-on, taller than wide
    rear:   q(400, 600),
    sangle: q(600, 350),  // front/side 3/4, landscape
    angle:  q(600, 350),  // rear/top 3/4, landscape
    hero:   q(600, 400),  // promotional, landscape
  }),
  monitor: Object.freeze({
    front:  q(600, 400),  // wide screen
    angle:  q(600, 350),
    rear:   q(600, 400),
    left:   q(250, 600),  // very thin side profile
    right:  q(250, 600),
    top:    q(600, 250),  // top edge, very wide
    bottom: q(600, 250),
    sangle: q(600, 350),
    hero:   q(600, 400),
  }),
  keyboard: Object.freeze({
    top:    q(600, 250),  // full layout, very wide
    left:   q(600, 250),  // side profile, wide & thin
    right:  q(600, 250),
    angle:  q(600, 300),
    sangle: q(600, 300),
    bottom: q(600, 250),
    front:  q(600, 200),  // front edge, very wide & thin
    rear:   q(600, 200),
    hero:   q(600, 400),
  }),
  mousepad: Object.freeze({
    top:    q(600, 400),
    angle:  q(600, 350),
    hero:   q(600, 350),
    bottom: q(600, 300),
    left:   q(600, 300),
    right:  q(600, 300),
    front:  q(600, 300),
    rear:   q(600, 300),
    sangle: q(600, 300),
  }),
});

export const GENERIC_VIEW_QUALITY_DEFAULT = Object.freeze(q(600, 400, 30000));

/**
 * Resolve per-view quality config from setting value + category fallback.
 *
 * Fallback chain:
 *   1. Per-view value from viewQualityConfig setting (JSON)
 *   2. Per-view value from CATEGORY_VIEW_QUALITY_DEFAULTS[category]
 *   3. GENERIC_VIEW_QUALITY_DEFAULT
 *
 * @param {string} viewQualityConfigSetting — JSON string or empty
 * @param {string} category
 * @param {number} flatMinWidth — global fallback (unused unless no category/generic default)
 * @param {number} flatMinHeight
 * @param {number} flatMinFileSize
 * @returns {Record<string, {minWidth: number, minHeight: number, minFileSize: number}>}
 */
export function resolveViewQualityConfig(viewQualityConfigSetting, category, flatMinWidth, flatMinHeight, flatMinFileSize) {
  // Parse JSON override if present
  let overrides = {};
  if (viewQualityConfigSetting && viewQualityConfigSetting.trim()) {
    try {
      const parsed = JSON.parse(viewQualityConfigSetting);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        overrides = parsed;
      }
    } catch { /* fall through to defaults */ }
  }

  const catDefaults = CATEGORY_VIEW_QUALITY_DEFAULTS[category] || {};
  const allViews = [...CANONICAL_VIEW_KEYS, 'hero'];
  const result = {};

  // Final fallback uses flat settings if provided, otherwise GENERIC_VIEW_QUALITY_DEFAULT
  const finalFallback = {
    minWidth:    flatMinWidth    || GENERIC_VIEW_QUALITY_DEFAULT.minWidth,
    minHeight:   flatMinHeight   || GENERIC_VIEW_QUALITY_DEFAULT.minHeight,
    minFileSize: flatMinFileSize || GENERIC_VIEW_QUALITY_DEFAULT.minFileSize,
  };

  for (const view of allViews) {
    const override = overrides[view] || {};
    const catDefault = catDefaults[view] || null;

    result[view] = {
      minWidth:    override.minWidth    ?? catDefault?.minWidth    ?? finalFallback.minWidth,
      minHeight:   override.minHeight   ?? catDefault?.minHeight   ?? finalFallback.minHeight,
      minFileSize: override.minFileSize ?? catDefault?.minFileSize ?? finalFallback.minFileSize,
    };
  }

  return result;
}
