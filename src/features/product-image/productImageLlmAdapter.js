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
import { resolvePromptTemplate } from '../../core/llm/resolvePromptTemplate.js';
import { resolveGlobalPrompt } from '../../core/llm/prompts/globalPromptRegistry.js';
import { buildPreviousDiscoveryBlock } from '../../core/finder/discoveryLog.js';
import { buildSiblingVariantsPromptBlock } from '../../core/finder/siblingVariantsPromptFragment.js';
import { buildIdentityWarning } from '../../core/llm/prompts/identityContext.js';
import { createPhaseCallLlm } from '../indexing/pipeline/shared/createPhaseCallLlm.js';
import { productImageFinderResponseSchema } from './productImageSchema.js';
import { formatProductImageIdentityFactsBlock } from './productImageIdentityDependencies.js';

// WHY: PIF is the evidence-refs exception across finders — the image URL IS
// the evidence, and images don't flow through the publisher candidate gate.
// The shared evidencePromptFragment is deliberately NOT imported here.
// Identity warning + siblings exclusion ARE shared via buildIdentityWarning.

const FIELD_DOMAIN_NOUN = 'product images';

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
    { key: 'sangle', priority: true,  description: 'primary Dynamic View mouse showcase shot: best clean angled product image for the site\'s Dynamic View slot. Prefer front/side, low side, or top-side 3/4 where the mouse shape, buttons, logo, lighting, or front/side detail is visible; exact 30-45 degree geometry is not required.' },
    { key: 'angle',  priority: true,  description: 'secondary distinct angled mouse product shot: second-best clean angled/technical perspective for carousel depth. Prefer a viewpoint different from sangle, such as opposite side, rear/top, side/top, or alternate 3/4; avoid near-duplicates of sangle and do not require exact rear/top geometry.' },
    { key: 'bottom', priority: false, description: 'Underside/belly view showing the base, sensor, mouse feet/skates, and any bottom labels or DPI switch' },
    { key: 'right',  priority: false, description: 'True right-side profile mouse product shot: long horizontal side silhouette with the right side wall, grip, or side buttons dominant and only minimal top surface visible; not a top-down or three-quarter shot.' },
    { key: 'front',  priority: false, description: 'Nose/front-facing mouse product shot: camera faces the front edge of the mouse, with the front lip, USB/cable exit, scroll wheel/button-front shape, or nose profile visible; not a top-down shell shot.' },
    { key: 'rear',   priority: false, description: 'Head-on rear view showing the back/rear of the mouse, the palm rest curvature from behind' },
  ],
  monitor: [
    { key: 'front',  priority: true,  description: 'Head-on front view of the monitor — camera faces the display straight on, showing the full screen, bezels, and stand' },
    { key: 'sangle', priority: true,  description: 'primary Dynamic View monitor showcase shot: best clean angled product image for the site\'s Dynamic View slot. Prefer front/side 3/4 or low side perspective showing the screen, bezels, stand depth, and overall form; exact 30-45 degree geometry is not required.' },
    { key: 'angle',  priority: true,  description: 'secondary distinct angled monitor product shot: second-best clean angled/technical perspective for carousel depth. Prefer a viewpoint different from sangle, such as rear/side, stand/back design, or top/side form; avoid near-duplicates of sangle.' },
    { key: 'rear',   priority: true,  description: 'Head-on rear view showing the back panel, ports, VESA mount area, and cable management' },
    { key: 'left',   priority: false, description: 'Strict side profile from the left at eye level — showing the monitor thickness, stand profile, and panel depth' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level — mirror of left view' },
    { key: 'top',    priority: false, description: 'Bird\'s-eye shot looking down at the monitor from above — showing the top edge, thickness, and stand base' },
    { key: 'bottom', priority: false, description: 'Underside view showing the bottom bezel and any bottom-mounted ports, buttons, or joystick' },
  ],
  keyboard: [
    { key: 'top',    priority: true,  description: 'Bird\'s-eye shot looking directly down at the keyboard from above — camera directly overhead, showing the full key layout and keycap legends' },
    { key: 'left',   priority: true,  description: 'Strict side profile from the left at eye level — showing the keyboard height profile, key travel, and wrist-rest if present' },
    { key: 'sangle', priority: true,  description: 'primary Dynamic View keyboard showcase shot: best clean angled product image for the site\'s Dynamic View slot. Prefer front/top or front/side 3/4 showing keycaps plus case depth; exact 30-45 degree geometry is not required.' },
    { key: 'angle',  priority: true,  description: 'secondary distinct angled keyboard product shot: second-best clean angled/technical perspective for carousel depth. Prefer a viewpoint different from sangle, such as opposite side, rear/top, side/top, or low profile angle; avoid near-duplicates of sangle.' },
    { key: 'bottom', priority: false, description: 'Underside view showing the base, rubber feet, tilt legs, and any bottom labels' },
    { key: 'right',  priority: false, description: 'Strict side profile from the right at eye level — mirror of left view' },
    { key: 'front',  priority: false, description: 'Head-on front view — camera faces the front edge showing the spacebar and front bezel' },
    { key: 'rear',   priority: false, description: 'Head-on rear view showing the back edge, ports, cable routing, and any rear features' },
  ],
});

/**
 * Per-category view budgets: which of the 8 canonical views are worth
 * actively searching for this category. These are FALLBACK DEFAULTS only —
 * the SSOT is the per-category `viewBudget` setting in product_image_finder_settings.
 *
 * Budget controls what we ASK for, not what we ACCEPT. If the LLM returns
 * a valid canonical view not in the budget, we keep it.
 */
export const CATEGORY_VIEW_BUDGET_DEFAULTS = Object.freeze({
  mouse:    ['top', 'left', 'sangle', 'angle', 'front', 'bottom'],  // 6 — sangle real, right extremely rare
  keyboard: ['top', 'left', 'sangle', 'angle'],                      // 4
  monitor:  ['front', 'sangle', 'angle', 'rear', 'left'],            // 5
  mousepad: ['top', 'angle'],                                         // 2
});

export const GENERIC_VIEW_BUDGET_DEFAULT = Object.freeze(['top', 'left', 'angle']);

/**
 * Resolve view budget from setting value + category fallback.
 * @param {string} viewBudgetSetting — JSON array string or empty
 * @param {string} category
 * @returns {string[]} — array of canonical view keys
 */
export function resolveViewBudget(viewBudgetSetting, category) {
  if (viewBudgetSetting && viewBudgetSetting.trim()) {
    try {
      const parsed = JSON.parse(viewBudgetSetting);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((k) => CANONICAL_VIEW_KEYS.includes(k));
        if (valid.length > 0) return valid;
      }
    } catch { /* fall through to defaults */ }
  }
  return CATEGORY_VIEW_BUDGET_DEFAULTS[category] || [...GENERIC_VIEW_BUDGET_DEFAULT];
}

function hasSiblingVariantContext(allVariants = [], currentVariantKey = '') {
  if (!Array.isArray(allVariants) || allVariants.length === 0) return false;
  return allVariants.some((variant) => variant && typeof variant === 'object' && variant.key !== currentVariantKey);
}

function buildDiscoveryIdentityGate({
  familyModelCount = 1,
  siblingsExcluded = [],
  allVariants = [],
  currentVariantKey = '',
} = {}) {
  const hasFamilyContext = Number(familyModelCount) > 1 || (siblingsExcluded || []).length > 0;
  const hasVariantContext = hasSiblingVariantContext(allVariants, currentVariantKey);
  const sections = [
    `DISCOVERY IDENTITY GATE:
- Return only images for the exact target product and target variant.
- Same brand or same product family is not enough.
- Search query intent, filename, alt text, page label, and gallery order are not identity proof.
- Use source page title, selected variant, structured data, official gallery grouping, and visible product design to confirm identity.`,
  ];

  if (hasFamilyContext) {
    sections.push(`FAMILY AMBIGUITY RULE:
- This product has sibling models in the same family. Reject images from sibling models even when they look similar or have the correct view.
- Check model-size/version tokens, wired/wireless status, product page title, URL slug, selected variant, and visible design before accepting.`);
  }

  if (hasVariantContext) {
    sections.push(`VARIANT COLLISION RULE:
- This product has multiple variants. Do not accept a sibling color/edition as the target variant.
- If retailer naming conflicts with the target label, do not decide from the phrase alone. Use source evidence plus visible product design.
- If source evidence clearly identifies a different sibling variant, omit the image and mention the naming collision in discovery_log.notes.`);
  }

  sections.push(`SOURCE CONFIDENCE ORDER:
When identity signals conflict, prefer:
1. Official manufacturer product page or structured variant data
2. Manufacturer CDN image tied to a product/variant gallery
3. Reputable retailer page title + selected variant + gallery image
4. Review page with exact product title and matching visual product
5. Image filename or alt text
6. Search query or search result title`);

  sections.push(`REQUIRED ACCEPTANCE CHECKLIST:
- exact product/model match
- not a sibling model
- not a sibling color/edition unless source evidence proves it is an accepted alias for the target
- product-image-dependent facts do not conflict
- clean product shot
- direct image URL
- meets minimum dimensions for its actual view
- view classified from pixels`);

  return sections.join('\n\n');
}

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
  sangle: 'primary Dynamic View product showcase shot: best clean angled image for the site\'s Dynamic View slot, usually front/side or low side 3/4; exact 30-45 degree geometry is not required.',
  angle:  'secondary distinct angled product shot: second-best clean angled/technical perspective for carousel depth, different from sangle; use the next best unique angled product image.',
});

/* ── Category-specific view eval criteria ─────────────────────────── */

/**
 * Generic eval criteria — fallback for unknown categories/views.
 * Extracted from the former defaultCriteria in buildViewEvalPrompt.
 */
export const GENERIC_VIEW_EVAL_CRITERIA = `Evaluation criteria — pick the BEST candidate as winner:
- Resolution: Each image label includes original dimensions and file size. Higher resolution originals are preferred — the thumbnails shown are downscaled so you cannot judge resolution visually.
- Background removal: Product alpha must be solid throughout — no transparent holes in the product body, no halo or fringing at edges, no remnant background pixels. These images display on white and black backgrounds where any artifact is visible.
- Single product: Image must contain exactly one product — not two color variants side-by-side, not product + accessories combo.
- Identity: Must be the correct model and correct color/edition variant.
- Watermarks: Getty, Shutterstock, retailer logos, "SAMPLE" text, copyright overlays → disqualify (flag: "watermark")
- Badges / overlays: Sale stickers, "NEW" badges, retailer branding, promotional text → disqualify (flag: "badge")
- Cropping: Product cut off at edges, missing parts, too tight framing → penalty (flag: "cropped")
- Wrong product: Different model, wrong color, accessory instead of product → disqualify (flag: "wrong_product")
- Sharpness: Blur, compression artifacts, noise → prefer the better candidate
- Composition: View angle matches the requested view, product centered, clean background → prefer the better candidate`;

const GENERIC_SANGLE_VIEW_EVAL_CRITERIA = `Evaluation criteria — pick the BEST candidate for SANGLE (primary Dynamic View):
- Resolution: Each image label includes original dimensions and file size. Higher resolution originals are preferred — the thumbnails shown are downscaled so you cannot judge resolution visually.
- Expected role: primary Dynamic View for the site. Pick the first good angled/showcase product shot. Prefer a clean front/side, low side, top-side, or elevated 3/4 product image; exact 30-45 degree geometry is not required.
- Slot priority: If this is the only good angled shot, it belongs in sangle before angle.
- Background removal: Product alpha must be solid throughout — no transparent holes in the product body, no halo or fringing at edges, no remnant background pixels.
- Single product: Image must contain exactly one product — not two color variants side-by-side, not product + accessories combo.
- Identity: Must be the correct model and correct color/edition variant.
- Watermarks: Getty, Shutterstock, retailer logos, "SAMPLE" text, copyright overlays → disqualify (flag: "watermark")
- Badges / overlays: Sale stickers, "NEW" badges, retailer branding, promotional text → disqualify (flag: "badge")
- Cropping: Product cut off at edges, missing parts, too tight framing → penalty (flag: "cropped")
- Wrong product: Different model, wrong color, accessory instead of product → disqualify (flag: "wrong_product")
- Sharpness and composition → prefer the better candidate`;

const GENERIC_ANGLE_VIEW_EVAL_CRITERIA = `Evaluation criteria — pick the BEST candidate for ANGLE (secondary distinct angled):
- Resolution: Each image label includes original dimensions and file size. Higher resolution originals are preferred — the thumbnails shown are downscaled so you cannot judge resolution visually.
- Expected role: secondary distinct angled/technical carousel slot. Pick the best angled product shot that is visually different from the existing sangle/context shot. Prefer opposite side, rear/top, side/top, alternate 3/4, or another unique angled perspective; exact geometry is not required.
- Duplicate control: reject or down-rank near-duplicate composition of the current sangle/context winner.
- Background removal: Product alpha must be solid throughout — no transparent holes in the product body, no halo or fringing at edges, no remnant background pixels.
- Single product: Image must contain exactly one product — not two color variants side-by-side, not product + accessories combo.
- Identity: Must be the correct model and correct color/edition variant.
- Watermarks: Getty, Shutterstock, retailer logos, "SAMPLE" text, copyright overlays → disqualify (flag: "watermark")
- Badges / overlays: Sale stickers, "NEW" badges, retailer branding, promotional text → disqualify (flag: "badge")
- Cropping: Product cut off at edges, missing parts, too tight framing → penalty (flag: "cropped")
- Wrong product: Different model, wrong color, accessory instead of product → disqualify (flag: "wrong_product")
- Sharpness and composition → prefer the better candidate`;

const GENERIC_VIEW_EVAL_CRITERIA_BY_VIEW = Object.freeze({
  sangle: GENERIC_SANGLE_VIEW_EVAL_CRITERIA,
  angle: GENERIC_ANGLE_VIEW_EVAL_CRITERIA,
});

// WHY: Uncommon views get a lighter criteria block — fewer candidates expected,
// so we want basic quality gates without over-filtering.
const UNCOMMON_VIEW_CRITERIA = `Evaluation criteria — pick the BEST candidate (lighter bar — uncommon view):
- Resolution: Check the original dimensions in image labels. Higher resolution preferred.
- Background removal: Product alpha must be solid — no transparent holes, no halo or fringing at edges, no remnant background pixels.
- Single product: Exactly one product, not a multi-product composite.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Product significantly cut off → penalty (flag: "cropped")
- Angle: Approximately matches the requested view — does not need to be geometrically perfect.
- Sharpness and composition → prefer the better candidate but apply a lenient bar. Having the shot matters more than perfection.`;

/**
 * Per-category, per-view eval criteria for the vision LLM.
 * Common views (per category view budget) get detailed criteria with
 * category-specific BG removal traps. Uncommon views get lighter criteria.
 */
export const CATEGORY_VIEW_EVAL_CRITERIA = Object.freeze({

  /* ── Mouse ──────────────────────────────────────────────────────── */
  mouse: Object.freeze({
    top: `Evaluation criteria — pick the BEST candidate for MOUSE — TOP (bird's-eye overhead):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Portrait-oriented overhead shot. Camera directly above. Full mouse outline visible including scroll wheel, side buttons, and grip edges.
- Background removal: Product alpha must be solid throughout — no transparent holes in the mouse body. The scroll wheel gap between wheel and shell must NOT be transparent. RGB underglow strip edges must be cleanly preserved.
- Single product: Exactly one mouse — not two color variants side-by-side.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full mouse outline must be visible — no edges cut off → penalty (flag: "cropped")
- Sharpness: Sharp detail on button seams, scroll wheel texture, surface finish → prefer the better candidate
- Composition: Mouse centered, fills most of the frame, minimal dead space → prefer the better candidate`,

    left: `Evaluation criteria — pick the BEST candidate for MOUSE — LEFT (side profile):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Landscape-oriented strict side profile from the left at eye level. Full silhouette from nose to rear, scroll wheel profile visible, side buttons on left side visible.
- Background removal: Product alpha must be solid. RGB underglow strip edges and thumb rest area where grip texture meets background must be clean — no eaten edges, no halo. Thin cable/dongle area must not have remnant pixels.
- Single product: Exactly one mouse.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full silhouette nose-to-rear must be visible → penalty (flag: "cropped")
- Sharpness: Side button detail, scroll wheel profile, grip texture visible → prefer the better candidate
- Composition: Full side profile at eye level, no tilt → prefer the better candidate`,

    sangle: `Evaluation criteria — pick the BEST candidate for MOUSE — SANGLE (primary Dynamic View):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected role: primary Dynamic View for the site. Pick the first good angled/showcase mouse product shot. Prefer front/side, low side, or top-side 3/4 where shape, buttons, logo, lighting, or front-side detail are visible; exact 30-45 degree geometry is not required.
- Slot priority: If this is the only good angled shot, it belongs in sangle before angle.
- Background removal: Product alpha must be solid. Shadow remnants under the product must be fully removed. Edge between mouse body and removed background must be clean.
- Single product: Exactly one mouse.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full mouse visible from this angle → penalty (flag: "cropped")
- Sharpness: Surface detail, logo, RGB lighting crisp → prefer the better candidate
- Composition: Product fills frame, attractive angle showing design → prefer the better candidate`,

    angle: `Evaluation criteria — pick the BEST candidate for MOUSE — ANGLE (secondary distinct angled):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected role: secondary distinct angled/technical carousel slot. Pick the best angled mouse product shot that is visually different from the existing sangle/context shot. Prefer opposite side, rear/top, side/top, or alternate 3/4; exact rear/top geometry is not required.
- Duplicate control: reject or down-rank near-duplicate composition of the current sangle/context winner.
- Background removal: Product alpha must be solid. Shadow remnants and edge artifacts must be clean.
- Single product: Exactly one mouse.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full mouse visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    front: `Evaluation criteria — pick the BEST candidate for MOUSE — FRONT (head-on):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Head-on front view — camera faces the nose of the mouse. Scroll wheel, primary buttons, and front profile visible. USB-C/micro-USB port may be visible.
- Background removal: Product alpha must be solid. Scroll wheel gap between wheel and shell must NOT be transparent. Cable/dongle exit area must be clean.
- Single product: Exactly one mouse.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full front profile visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    bottom: `Evaluation criteria — pick the BEST candidate for MOUSE — BOTTOM (underside):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Underside/belly view showing the base — sensor opening, mouse feet/skates, DPI switch, and any bottom labels.
- Background removal: Product alpha must be solid. Sensor opening is a real feature of the product and must NOT be treated as a transparent hole. Mouse feet at edges must be cleanly preserved.
- Single product: Exactly one mouse.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full underside visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    right: UNCOMMON_VIEW_CRITERIA,
    rear: UNCOMMON_VIEW_CRITERIA,
  }),

  /* ── Keyboard ───────────────────────────────────────────────────── */
  keyboard: Object.freeze({
    top: `Evaluation criteria — pick the BEST candidate for KEYBOARD — TOP (bird's-eye overhead):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Ultra-wide landscape-oriented overhead shot. Camera directly above. Full key layout visible, keycap legends readable, wrist rest if present.
- Background removal: Product alpha must be solid throughout — gaps between keys must NOT be transparent. The keyboard body/plate visible between keys is part of the product. RGB lighting bleed at edges must be cleanly contained. Cable exit area must be clean.
- Single product: Exactly one keyboard (wrist rest counts as part of the keyboard).
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full keyboard layout visible — no keys cut off at edges → penalty (flag: "cropped")
- Sharpness: Keycap legends readable, switch/stabilizer detail visible → prefer the better candidate
- Composition: Keyboard centered, fills frame width → prefer the better candidate`,

    left: `Evaluation criteria — pick the BEST candidate for KEYBOARD — LEFT (side profile):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Wide landscape side profile showing height/thickness, key travel distance, wrist rest if present. Camera at eye level with the keyboard edge.
- Background removal: Product alpha must be solid. Thin rubber feet/risers at base edge must be preserved. Cable exit area must be clean.
- Single product: Exactly one keyboard.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full side visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    sangle: `Evaluation criteria — pick the BEST candidate for KEYBOARD — SANGLE (primary Dynamic View):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected role: primary Dynamic View for the site. Pick the first good angled/showcase keyboard product shot. Prefer front/top or front/side 3/4 showing keycaps plus case depth; exact 30-45 degree geometry is not required.
- Slot priority: If this is the only good angled shot, it belongs in sangle before angle.
- Background removal: Product alpha must be solid. Edge artifacts at thin profile sections must be clean.
- Single product: Exactly one keyboard.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full keyboard visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    angle: `Evaluation criteria — pick the BEST candidate for KEYBOARD — ANGLE (secondary distinct angled):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected role: secondary distinct angled/technical carousel slot. Pick the best angled keyboard product shot that is visually different from the existing sangle/context shot. Prefer opposite side, rear/top, side/top, or low profile angle; exact 30-45 degree geometry is not required.
- Duplicate control: reject or down-rank near-duplicate composition of the current sangle/context winner.
- Background removal: Product alpha must be solid. Thin profile edges must not be eaten by BG removal.
- Single product: Exactly one keyboard.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full keyboard visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    bottom: UNCOMMON_VIEW_CRITERIA,
    right: UNCOMMON_VIEW_CRITERIA,
    front: UNCOMMON_VIEW_CRITERIA,
    rear: UNCOMMON_VIEW_CRITERIA,
  }),

  /* ── Monitor ────────────────────────────────────────────────────── */
  monitor: Object.freeze({
    front: `Evaluation criteria — pick the BEST candidate for MONITOR — FRONT (head-on):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Landscape head-on front view. Full screen, bezels, and stand visible. Camera centered on the display.
- Background removal: Product alpha must be solid. CRITICAL: The black/dark screen area is part of the product and must NOT be removed — a transparent screen is a BG removal failure. Thin bezels must be cleanly preserved. Stand base edges must be clean.
- Single product: Exactly one monitor — not a dual-monitor setup.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full monitor including stand visible → penalty (flag: "cropped")
- Sharpness: Bezel detail, stand design visible → prefer the better candidate
- Composition: Monitor centered, fills frame → prefer the better candidate`,

    sangle: `Evaluation criteria — pick the BEST candidate for MONITOR — SANGLE (primary Dynamic View):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected role: primary Dynamic View for the site. Pick the first good angled/showcase monitor product shot. Prefer front/side 3/4 or low side perspective showing the screen, bezels, stand depth, and overall form; exact 30-45 degree geometry is not required.
- Slot priority: If this is the only good angled shot, it belongs in sangle before angle.
- Background removal: Product alpha must be solid. Stand joint/hinge area must be cleanly preserved. Thin profile sections must not be partially eaten.
- Single product: Exactly one monitor.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full monitor and stand visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    angle: `Evaluation criteria — pick the BEST candidate for MONITOR — ANGLE (secondary distinct angled):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected role: secondary distinct angled/technical carousel slot. Pick the best angled monitor product shot that is visually different from the existing sangle/context shot. Prefer rear/side, stand/back design, or top/side form; exact rear/top geometry is not required.
- Duplicate control: reject or down-rank near-duplicate composition of the current sangle/context winner.
- Background removal: Product alpha must be solid. Stand joint/hinge area must be cleanly preserved. Thin profile sections must not be partially eaten.
- Single product: Exactly one monitor.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full monitor and stand visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    rear: `Evaluation criteria — pick the BEST candidate for MONITOR — REAR (back panel):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Head-on rear view showing the back panel, port layout, VESA mount area, ventilation, and cable management features.
- Background removal: Product alpha must be solid. Dark port openings and ventilation grilles are features of the product — they must NOT appear as transparent holes.
- Single product: Exactly one monitor.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full back panel visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    left: `Evaluation criteria — pick the BEST candidate for MONITOR — LEFT (side profile):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Strict side profile from the left showing panel thickness, stand profile, and overall depth. Monitors are very thin — this is a narrow/tall shot.
- Background removal: Product alpha must be solid. Very thin panel profile must be fully preserved — BG removal must not eat into the thin edge. Stand arm must be clean.
- Single product: Exactly one monitor.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full side profile and stand visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    right: UNCOMMON_VIEW_CRITERIA,
    top: UNCOMMON_VIEW_CRITERIA,
    bottom: UNCOMMON_VIEW_CRITERIA,
  }),

  /* ── Mousepad ───────────────────────────────────────────────────── */
  mousepad: Object.freeze({
    top: `Evaluation criteria — pick the BEST candidate for MOUSEPAD — TOP (overhead):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected geometry: Overhead shot showing the full pad surface, edge stitching, logo/branding, and surface texture.
- Background removal: Product alpha must be solid. Thin pad edges are tricky for BG removal — the full rectangular outline must be preserved without eaten corners or edges.
- Single product: Exactly one mousepad.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full pad visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    sangle: `Evaluation criteria — pick the BEST candidate for MOUSEPAD — SANGLE (primary Dynamic View):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected role: primary Dynamic View for the site. Pick the first good angled/showcase mousepad product shot. Prefer an elevated 3/4 or low side view that shows pad surface plus edge thickness; exact 30-45 degree geometry is not required.
- Slot priority: If this is the only good angled shot, it belongs in sangle before angle.
- Background removal: Product alpha must be solid. Thin edges must be preserved.
- Single product: Exactly one mousepad.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full pad visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    angle: `Evaluation criteria — pick the BEST candidate for MOUSEPAD — ANGLE (secondary distinct angled):
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Expected role: secondary distinct angled/technical carousel slot. Pick the best angled mousepad product shot that is visually different from the existing sangle/context shot. Prefer alternate elevated, side-edge, rolled-edge, or thickness perspective; exact 30-45 degree geometry is not required.
- Duplicate control: reject or down-rank near-duplicate composition of the current sangle/context winner.
- Background removal: Product alpha must be solid. Thin edges must be preserved.
- Single product: Exactly one mousepad.
- Identity: Correct model and color/edition variant.
- Watermarks / badges / overlays → disqualify (flag: "watermark" or "badge")
- Wrong product → disqualify (flag: "wrong_product")
- Cropping: Full pad visible → penalty (flag: "cropped")
- Sharpness and composition → prefer the better candidate`,

    bottom: UNCOMMON_VIEW_CRITERIA,
    left: UNCOMMON_VIEW_CRITERIA,
    right: UNCOMMON_VIEW_CRITERIA,
    front: UNCOMMON_VIEW_CRITERIA,
    rear: UNCOMMON_VIEW_CRITERIA,
  }),
});

/* ── Category-specific hero eval criteria ─────────────────────────── */

/**
 * Generic hero eval criteria — fallback for unknown categories.
 */
const HERO_FIT_GATE = `HERO FIT (product-page usability gate):
- REJECT: Pure isolated cutouts or single-product renders on a plain, transparent, solid, or empty background. Those are view images, not heroes.
- REJECT: Marketing collateral with large baked-in logos, headlines, product names, specs, prices, campaign copy, or decorative text.
- REJECT: Lineups or kit layouts where the target product is small, secondary, cropped, or hard to inspect.
- ACCEPT: Official lifestyle/contextual shots, styled promotional renders, desk setups, or kit/lineup compositions only when the target product is dominant and the image works as a clean product-page hero.`;

export const GENERIC_HERO_EVAL_CRITERIA = `Hero image evaluation — you are a LEGAL and QUALITY gatekeeper, not an art director.
Lifestyle shots, official promotional renders, studio lineups, kit layouts, and themed scenes are acceptable only when they pass these gates:

1. SOURCE SAFETY (copyright gate — most important):
   - ACCEPT: Manufacturer promotional images, official product pages, press kit photos, and regional/international retailer CDN or promotional images.
   - REJECT: Photos taken by review sites, tech publications, YouTubers, or bloggers (PC Gamer, Tom's Hardware, RTINGS, TechPowerUp, The Verge, LTT, TechRadar, etc.). These are copyrighted editorial content.
   - How to tell: Editorial photos show lab environments, test equipment, desk clutter, hands holding the product, inconsistent overhead lighting. Manufacturer promo images have polished studio lighting, consistent brand aesthetics, clean backgrounds, or stylized scenes.

2. CLEANLINESS (usability gate):
   - REJECT: Watermarks (Getty, Shutterstock, iStock, Alamy), "SAMPLE" text, copyright overlays.
   - REJECT: Sale stickers, "NEW" badges, retailer branding baked into the image, promotional text overlays.

${HERO_FIT_GATE}

3. IDENTITY (correct product gate):
   - Must be the correct model and correct color/edition variant, visible and identifiable. Wrong product or wrong color → skip.
   - Multi-color lineup shots (multiple colorways of the same model) are acceptable only when the target product remains dominant.

4. IMAGE QUALITY:
   - Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
   - Must not be blurry, heavily compressed, or look like a low-res screenshot.

When picking multiple heroes, prefer different shots over near-duplicates of the same angle.`;

/**
 * Per-category hero evaluation criteria.
 */
export const CATEGORY_HERO_EVAL_CRITERIA = Object.freeze({
  mouse: `Hero image evaluation for MOUSE — you are a LEGAL and QUALITY gatekeeper, not an art director.
Desk glamour shots, official promotional renders, RGB scenes, themed editions, and kit layouts are acceptable only when they pass these gates:

1. SOURCE SAFETY (copyright gate — most important):
   - ACCEPT: Manufacturer promotional images, official product pages, press kit photos, retailer CDN images.
   - REJECT: Photos taken by review sites or tech publications (PC Gamer, Tom's Hardware, RTINGS, TechPowerUp, The Verge, etc.). These are copyrighted editorial content.
   - How to tell: Editorial photos show lab environments, test equipment, desk clutter, hands holding the mouse, inconsistent overhead lighting. Manufacturer promo images have polished studio lighting, consistent brand aesthetics, clean backgrounds, or stylized scenes.

2. CLEANLINESS: REJECT watermarks, "SAMPLE" text, sale stickers, "NEW" badges, retailer branding baked into the image.

${HERO_FIT_GATE}

3. IDENTITY: Must be the correct mouse model and correct color/edition variant. Wrong product or wrong color → skip. Multi-color lineup shots (multiple colorways of the same model) are acceptable only when the target product remains dominant.

4. IMAGE QUALITY: Higher resolution preferred (check dimensions in image labels). Must not be blurry, heavily compressed, or a low-res screenshot.

When picking multiple heroes, prefer different shots over near-duplicates of the same angle.`,

  keyboard: `Hero image evaluation for KEYBOARD — you are a LEGAL and QUALITY gatekeeper, not an art director.
Desk shots, official promotional renders, RGB scenes, and kit layouts are acceptable only when they pass these gates:

1. SOURCE SAFETY (copyright gate — most important):
   - ACCEPT: Manufacturer promotional images, official product pages, press kit photos, retailer CDN images.
   - REJECT: Photos taken by review sites or tech publications (PC Gamer, Tom's Hardware, RTINGS, TechPowerUp, The Verge, etc.). These are copyrighted editorial content.
   - How to tell: Editorial photos show lab environments, test equipment, desk clutter, hands typing, inconsistent overhead lighting. Manufacturer promo images have polished studio lighting, consistent brand aesthetics, clean backgrounds, or stylized scenes.

2. CLEANLINESS: REJECT watermarks, "SAMPLE" text, sale stickers, "NEW" badges, retailer branding baked into the image.

${HERO_FIT_GATE}

3. IDENTITY: Must be the correct keyboard model and correct color/edition variant. Wrong product or wrong color → skip. Multi-color lineup shots (multiple colorways of the same model) are acceptable only when the target product remains dominant.

4. IMAGE QUALITY: Higher resolution preferred (check dimensions in image labels). Must not be blurry, heavily compressed, or a low-res screenshot.

When picking multiple heroes, prefer different shots over near-duplicates of the same angle.`,

  monitor: `Hero image evaluation for MONITOR — you are a LEGAL and QUALITY gatekeeper, not an art director.
Desk setups, official promotional renders, and screen-on lifestyle shots are acceptable only when they pass these gates:

1. SOURCE SAFETY (copyright gate — most important):
   - ACCEPT: Manufacturer promotional images, official product pages, press kit photos, retailer CDN images.
   - REJECT: Photos taken by review sites or tech publications (PC Gamer, Tom's Hardware, RTINGS, TechPowerUp, The Verge, etc.). These are copyrighted editorial content.
   - How to tell: Editorial photos show lab environments, colorimeter/calibration equipment, measurement charts on screen, inconsistent overhead lighting. Manufacturer promo images have polished studio lighting, consistent brand aesthetics, clean backgrounds, or stylized scenes.

2. CLEANLINESS: REJECT watermarks, "SAMPLE" text, sale stickers, "NEW" badges, retailer branding baked into the image.

${HERO_FIT_GATE}

3. IDENTITY: Must be the correct monitor model and correct color/edition variant. Wrong product or wrong color → skip. Multi-color lineup shots (multiple colorways of the same model) are acceptable only when the target product remains dominant.

4. IMAGE QUALITY: Higher resolution preferred (check dimensions in image labels). Must not be blurry, heavily compressed, or a low-res screenshot.

When picking multiple heroes, prefer different shots over near-duplicates of the same angle.`,

  mousepad: `Hero selection criteria for MOUSEPAD product page carousel:
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Product must be clearly visible and identifiable — full pad visible in desk context or close-up showing surface texture and branding.
- Identity: Must be the correct mousepad model and correct color/edition variant. Wrong product or wrong color → skip.
- Multi-color lineup shots (multiple colorways of the same model) are acceptable only when the target product remains dominant.
- Source: Only brand/manufacturer/retailer photography. Reject editorial review site photos (copyrighted).
- Watermarks: Getty, Shutterstock, retailer logos, "SAMPLE" text, copyright overlays → skip, do not select.
- Badges / overlays: Sale stickers, "NEW" badges, retailer branding, promotional text → skip, do not select.
${HERO_FIT_GATE}
- Desk context with the mousepad as the prominent surface is ideal.
- Cropped is OK if branding and surface design remain visible.
- Image quality: Sharp, well-composed, good lighting, no heavy compression artifacts.
- Perspective diversity — CRITICAL: Each selected hero MUST show a distinctly different perspective, angle, or composition. Do not pick near-duplicate shots. A good hero set covers different views of the mousepad.`,
});

/* ── Resolvers ────────────────────────────────────────────────────── */

/**
 * Resolve eval criteria for a specific category + view.
 * @param {string} category
 * @param {string} view — canonical view key
 * @returns {string} — criteria text (category-specific or generic fallback)
 */
export function resolveViewEvalCriteria(category, view) {
  return CATEGORY_VIEW_EVAL_CRITERIA[category]?.[view] ||
    GENERIC_VIEW_EVAL_CRITERIA_BY_VIEW[view] ||
    GENERIC_VIEW_EVAL_CRITERIA;
}

/**
 * Resolve hero eval criteria for a specific category.
 * @param {string} category
 * @returns {string} — criteria text (category-specific or generic fallback)
 */
export function resolveHeroEvalCriteria(category) {
  return CATEGORY_HERO_EVAL_CRITERIA[category] || GENERIC_HERO_EVAL_CRITERIA;
}

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
// WHY: Default template for PIF view search. {{VARIABLE}} placeholders mark dynamic injection points.
export const PIF_VIEW_DEFAULT_TEMPLATE = `Find high-resolution product images for: {{BRAND}} {{MODEL}} — {{VARIANT_DESC}}

{{IDENTITY_INTRO}}
{{IDENTITY_WARNING}}
{{SIBLING_VARIANTS}}
{{PRODUCT_IMAGE_IDENTITY_FACTS}}
{{DISCOVERY_IDENTITY_GATE}}

VIEW DEFINITIONS — classify every image with one of these exact view names:

{{PRIORITY_VIEWS}}
{{ADDITIONAL_VIEWS}}

For each priority view, find up to 3 candidate images ranked by resolution and clarity.{{ADDITIONAL_GUIDANCE}}

Every image you return MUST use one of these view names: {{ALL_VIEW_KEYS}}

{{IMAGE_REQUIREMENTS}}

{{PREVIOUS_DISCOVERY}}Search strategy:
- Search broadly: manufacturer product pages, press kits, retailer/distributor CDNs, regional and international retailer galleries, marketplace image assets, image-search leads, and review pages only as leads to official or product-gallery images
- Older or regional pages may retain legacy edition images that current local retailer pages no longer show
- Look for the specific {{VARIANT_TYPE_WORD}} variant page or color selector
- Prioritize the highest-resolution version you can find from ANY reliable source

If a specific view is genuinely unavailable for this variant, omit it rather than returning a wrong angle.

Return JSON:
- "images": [{ "view": "view-name", "url": "direct-image-url", "source_page": "page-where-found", "alt_text": "image alt text if available" }, ...]
{{DISCOVERY_LOG_SHAPE}}`;

export function buildProductImageFinderPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  variantKey = '',
  allVariants = [],
  priorityViews = [],
  additionalViews = [],
  minWidth = 800,
  minHeight = 600,
  viewQualityMap = null,
  siblingsExcluded = [],
  familyModelCount = 1,
  ambiguityLevel = 'easy',
  previousDiscovery = { urlsChecked: [], queriesRun: [] },
  scopeLabel = "this variant's view searches",
  promptOverride = '',
  templateOverride = '',
  productImageIdentityFacts = [],
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

  const identityWarning = buildIdentityWarning({
    familyModelCount,
    ambiguityLevel,
    brand,
    model,
    siblingModels: siblingsExcluded,
    fieldDomainNoun: FIELD_DOMAIN_NOUN,
  });

  // Build view definitions — each view gets its description + per-view minimums
  const viewMinLabel = (v) => {
    if (!viewQualityMap?.[v.key]) return '';
    const vq = viewQualityMap[v.key];
    return ` (min ${vq.minWidth}w × ${vq.minHeight}h)`;
  };

  const prioritySection = priorityViews.length > 0
    ? `PRIORITY (search for these first — most important):\n${priorityViews.map((v, i) => `  ${i + 1}. "${v.key}" — ${v.description}${viewMinLabel(v)}`).join('\n')}`
    : '';

  const additionalSection = additionalViews.length > 0
    ? `\n` + `ADDITIONAL (include if you find clean product shots matching these angles):\n${additionalViews.map(v => `  - "${v.key}" — ${v.description}${viewMinLabel(v)}`).join('\n')}`
    : '';

  const allViewKeys = CANONICAL_VIEW_KEYS.join(', ');
  const discoveryIdentityGate = buildDiscoveryIdentityGate({
    familyModelCount,
    siblingsExcluded,
    allVariants,
    currentVariantKey: variantKey,
  });

  const imageRequirements = `Image requirements:
- Clean product shot — the product isolated on a white or plain background, or a clean studio/press shot
- View slot rule: a clean product shot only satisfies a named view when the visible camera angle matches that view definition. If the pixels show another canonical view, label it as that actual view or omit it; do not let page labels, filenames, alt text, or gallery position override visible geometry.
- Query intent is not view evidence. A top-down image found during a front-view search must be returned as "top", never "front".
- Multiple unique clean images for the same actual view are useful. Return them under the same canonical view name; the carousel may use extras as numbered slots later.
- If a clean image is the exact product but does not satisfy the requested priority view, still label it by its actual visible view when that view is one of the allowed view names.
- NOT: lifestyle photos, styled banners, marketing collages, box art, screenshots, in-use/in-hand photos, group shots, images with decorative backgrounds
- The image must show the EXACT product: ${brand} ${model} in ${variantDesc}
- Minimum resolution per view is listed above in the view definitions — bigger is always better
- The URL must be a DIRECT link to the image file (.jpg, .png, .webp or image content-type). Not a page URL.
- If a site uses dynamic image URLs (e.g. query-string sizing), find or construct the highest-resolution static variant
- Prefer images where the product fills most of the frame with minimal background
- Images below the per-view minimum resolution will be rejected — do not return small thumbnails or icons`;

  const previousDiscoverySection = buildPreviousDiscoveryBlock({
    urlsChecked: previousDiscovery.urlsChecked,
    queriesRun: previousDiscovery.queriesRun,
    scopeLabel,
  });

  const template = templateOverride || promptOverride || PIF_VIEW_DEFAULT_TEMPLATE;

  const variantSuffix = variant ? ` (variant: ${variant})` : '';

  return resolvePromptTemplate(template, {
    BRAND: brand,
    MODEL: model,
    VARIANT_DESC: variantDesc,
    VARIANT_SUFFIX: variantSuffix,
    IDENTITY_INTRO: resolvePromptTemplate(resolveGlobalPrompt('identityIntro'), {
      BRAND: brand, MODEL: model, VARIANT_SUFFIX: variantSuffix,
    }),
    IDENTITY_WARNING: identityWarning,
    SIBLING_VARIANTS: buildSiblingVariantsPromptBlock({
      allVariants,
      currentVariantKey: variantKey,
      currentVariantLabel: variantLabel,
      whatToSkip: 'images',
    }),
    PRODUCT_IMAGE_IDENTITY_FACTS: formatProductImageIdentityFactsBlock(productImageIdentityFacts, { mode: 'discovery' }),
    DISCOVERY_IDENTITY_GATE: discoveryIdentityGate,
    PRIORITY_VIEWS: prioritySection,
    ADDITIONAL_VIEWS: additionalSection,
    ADDITIONAL_GUIDANCE: additionalViews.length > 0
      ? '\nFor additional views, include any clean product shots you encounter while searching.'
      : '',
    ALL_VIEW_KEYS: allViewKeys,
    IMAGE_REQUIREMENTS: imageRequirements,
    PREVIOUS_DISCOVERY: previousDiscoverySection,
    VARIANT_TYPE_WORD: variantType === 'edition' ? 'edition' : 'color',
    DISCOVERY_LOG_SHAPE: resolveGlobalPrompt('discoveryLogShape'),
  });
}

export const PRODUCT_IMAGE_FINDER_SPEC = {
  phase: 'imageFinder',
  reason: 'product_image_finding',
  role: 'triage',
  system: (domainArgs) => buildProductImageFinderPrompt({
    product: domainArgs.product,
    variantLabel: domainArgs.variantLabel || '',
    variantType: domainArgs.variantType || 'color',
    variantKey: domainArgs.variantKey || '',
    allVariants: domainArgs.allVariants || [],
    priorityViews: domainArgs.priorityViews || [],
    additionalViews: domainArgs.additionalViews || [],
    minWidth: domainArgs.minWidth || 800,
    minHeight: domainArgs.minHeight || 600,
    siblingsExcluded: domainArgs.siblingsExcluded || [],
    familyModelCount: domainArgs.familyModelCount || 1,
    ambiguityLevel: domainArgs.ambiguityLevel || 'easy',
    previousDiscovery: domainArgs.previousDiscovery || { urlsChecked: [], queriesRun: [] },
    scopeLabel: domainArgs.scopeLabel,
    promptOverride: domainArgs.promptOverride || '',
    viewQualityMap: domainArgs.viewQualityMap || null,
    productImageIdentityFacts: domainArgs.productImageIdentityFacts || [],
  }),
  jsonSchema: zodToLlmSchema(productImageFinderResponseSchema),
};

/**
 * Factory: create a bound LLM caller for the Product Image Finder.
 */
export function createProductImageFinderCallLlm(deps) {
  return createPhaseCallLlm(deps, PRODUCT_IMAGE_FINDER_SPEC, (domainArgs) => ({
    llmCallLabel: domainArgs.llmCallLabel || (domainArgs.mode === 'hero' ? 'Discovery Hero' : 'Discovery'),
    llmCallExtras: {
      ...(domainArgs.llmCallExtras || {}),
      variant: domainArgs.variantLabel || '',
      mode: domainArgs.mode || 'view',
    },
    user: JSON.stringify({
      brand: domainArgs.product?.brand || '',
      model: domainArgs.product?.model || '',
      base_model: domainArgs.product?.base_model || '',
      variant_label: domainArgs.variantLabel || '',
      variant_type: domainArgs.variantType || 'color',
    }),
  }));
}

/* ── Hero prompt builder ──────────────────────────────────────────── */

/**
 * Build the system prompt for hero/promotional image search.
 * Completely separate intent from angle-based view search.
 *
 * @param {object} opts
 * @param {object} opts.product — { brand, model, base_model, variant }
 * @param {string} opts.variantLabel
 * @param {string} opts.variantType — "color" or "edition"
 * @param {number} opts.minWidth
 * @param {number} opts.minHeight
 * @param {string[]} opts.siblingsExcluded
 * @param {number} opts.familyModelCount
 * @param {string} opts.ambiguityLevel
 * @param {object} opts.previousDiscovery — { urlsChecked, queriesRun }
 * @param {string} [opts.promptOverride] — custom full prompt template replacing default
 * @returns {string}
 */
// WHY: Default template for PIF hero search. {{VARIABLE}} placeholders mark dynamic injection points.
export const PIF_HERO_DEFAULT_TEMPLATE = `{{HERO_INSTRUCTIONS}}

{{IDENTITY_INTRO}}
{{IDENTITY_WARNING}}
{{PRODUCT_IMAGE_IDENTITY_FACTS}}

Every image you return MUST use the view name "hero".

{{PREVIOUS_DISCOVERY}}Return JSON:
- "images": [{ "view": "hero", "url": "direct-image-url", "source_page": "page-where-found", "alt_text": "image alt text if available" }, ...]
{{DISCOVERY_LOG_SHAPE}}`;

export function buildHeroImageFinderPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  minWidth = 800,
  minHeight = 600,
  siblingsExcluded = [],
  familyModelCount = 1,
  ambiguityLevel = 'easy',
  previousDiscovery = { urlsChecked: [], queriesRun: [] },
  scopeLabel = "this variant's hero searches",
  promptOverride = '',
  templateOverride = '',
  productImageIdentityFacts = [],
}) {
  const brand = product.brand || '';
  const model = product.model || '';
  const variant = product.variant || '';

  const variantDesc = variantType === 'edition'
    ? `the "${variantLabel}" edition`
    : `the "${variantLabel}" color variant`;

  const identityWarning = buildIdentityWarning({
    familyModelCount,
    ambiguityLevel,
    brand,
    model,
    siblingModels: siblingsExcluded,
    fieldDomainNoun: FIELD_DOMAIN_NOUN,
  });

  const discoverySection = buildPreviousDiscoveryBlock({
    urlsChecked: previousDiscovery.urlsChecked,
    queriesRun: previousDiscovery.queriesRun,
    scopeLabel,
  });

  const heroInstructions = `Find high-quality lifestyle and contextual product images for: ${brand} ${model} — ${variantDesc}

You are looking for images that show this product IN CONTEXT — placed on a desk, in a gaming setup, on a workspace surface, or in any real-world environment. The background and setting are intentional and valuable. These are NOT ordinary cutout/studio shots.

ACCEPTANCE CLASSES:
1. lifestyle_context - the product is in a real or realistic scene, such as a desk setup, workspace, mousepad, keyboard/monitor context, textured surface, RGB glow, or room/environment lighting.
2. official_hero_scene - official manufacturer or authorized-retailer media that is text-free, high-resolution, polished, and clearly useful as a 16:9 product-page hero/card image. It still needs scene or composition value: visible surface, environmental lighting, contextual objects, deliberate kit/lineup arrangement, or a background that adds visual value.

WHAT MAKES A GOOD HERO IMAGE:
- Product placed in a real environment — desk setup, gaming station, workspace, lifestyle setting
- The environment/background is part of the image's value (moody lighting, RGB glow, natural surfaces)
- Other peripherals may be visible (keyboard, monitor, mousepad) as long as the target product is clearly identifiable in the scene
- Official manufacturer lifestyle photography, regional and international retailer lifestyle/promotional media, press kit contextual shots, and image-search leads that resolve to source-backed direct image URLs
- Official hero/card scenes are acceptable when they have meaningful scene or composition value
- High-resolution, landscape-oriented preferred (will be cropped to 16:9 later)
- Dramatic or atmospheric lighting that shows the product in its intended environment

HARD REJECTS — do NOT return any image that has:
- ordinary cutouts, plain PDP renders, or isolated angle/top/front/side product shots
- Product isolated on a solid/gradient background with no environment context
- Text overlays, watermarks, logos, price tags, or advertising copy of any kind
- Busy promotional banners, box art, or marketing collateral with graphics/text
- User photos, unboxing images, or screenshots
- The product too small or not clearly identifiable in the scene
- Generic category banners or brand-only imagery
- Small thumbnails or low-resolution images

QUALITY OVER QUANTITY: Return ONLY images you are confident fit lifestyle_context or official_hero_scene. If only cutouts are available, return 0 images.

Image requirements:
- Minimum resolution: ${minWidth}px wide, ${minHeight}px tall — bigger is always better
- Direct image URL (.jpg, .png, .webp or image content-type)
- Must show the EXACT product: ${brand} ${model} in ${variantDesc}

Allowed sources (in priority order):
1. Manufacturer's official product page gallery images for this ${variantType === 'edition' ? 'edition' : 'color'}
2. Manufacturer's press/media page or press kit photography/renders
3. Authorized, regional, and international retailer/distributor product galleries and promotional media, including older or regional pages that may retain legacy official assets
Image-search leads are useful when they resolve to direct image URLs with source-page evidence for the exact product and variant.
Do NOT use images from editorial review sites when they are original review photography; those are copyrighted editorial content.`;

  const template = templateOverride || promptOverride || PIF_HERO_DEFAULT_TEMPLATE;

  const variantSuffix = variant ? ` (variant: ${variant})` : '';

  return resolvePromptTemplate(template, {
    BRAND: brand,
    MODEL: model,
    VARIANT_SUFFIX: variantSuffix,
    IDENTITY_INTRO: resolvePromptTemplate(resolveGlobalPrompt('identityIntro'), {
      BRAND: brand, MODEL: model, VARIANT_SUFFIX: variantSuffix,
    }),
    IDENTITY_WARNING: identityWarning,
    PRODUCT_IMAGE_IDENTITY_FACTS: formatProductImageIdentityFactsBlock(productImageIdentityFacts, { mode: 'discovery' }),
    PREVIOUS_DISCOVERY: discoverySection,
    HERO_INSTRUCTIONS: heroInstructions,
    DISCOVERY_LOG_SHAPE: resolveGlobalPrompt('discoveryLogShape'),
  });
}

export const HERO_IMAGE_FINDER_SPEC = {
  phase: 'imageFinder',
  reason: 'hero_image_finding',
  role: 'triage',
  system: (domainArgs) => buildHeroImageFinderPrompt({
    product: domainArgs.product,
    variantLabel: domainArgs.variantLabel || '',
    variantType: domainArgs.variantType || 'color',
    minWidth: domainArgs.minWidth || 800,
    minHeight: domainArgs.minHeight || 600,
    siblingsExcluded: domainArgs.siblingsExcluded || [],
    familyModelCount: domainArgs.familyModelCount || 1,
    ambiguityLevel: domainArgs.ambiguityLevel || 'easy',
    previousDiscovery: domainArgs.previousDiscovery || { urlsChecked: [], queriesRun: [] },
    scopeLabel: domainArgs.scopeLabel,
    promptOverride: domainArgs.promptOverride || '',
    productImageIdentityFacts: domainArgs.productImageIdentityFacts || [],
  }),
  jsonSchema: zodToLlmSchema(productImageFinderResponseSchema),
};

/**
 * Factory: create a bound LLM caller for hero image search.
 */
export function createHeroImageFinderCallLlm(deps) {
  return createPhaseCallLlm(deps, HERO_IMAGE_FINDER_SPEC, (domainArgs) => ({
    llmCallLabel: domainArgs.llmCallLabel || 'Discovery Hero',
    llmCallExtras: {
      ...(domainArgs.llmCallExtras || {}),
      variant: domainArgs.variantLabel || '',
      mode: 'hero',
    },
    user: JSON.stringify({
      brand: domainArgs.product?.brand || '',
      model: domainArgs.product?.model || '',
      base_model: domainArgs.product?.base_model || '',
      variant_label: domainArgs.variantLabel || '',
      variant_type: domainArgs.variantType || 'color',
    }),
  }));
}
