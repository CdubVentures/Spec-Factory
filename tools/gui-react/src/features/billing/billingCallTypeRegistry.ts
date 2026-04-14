// WHY: Single source of truth for billing reason → display label + chart color.
// Adding a new LLM call source = add one row here. O(1) scaling.
// Entries are grouped by feature domain with gradient colors (lighter → darker within each group).

export interface BillingCallTypeEntry {
  readonly reason: string;
  readonly label: string;
  readonly color: string;
  readonly group: string;
}

// WHY: Group ordering and gradient colors follow the Stripe/Linear dashboard pattern —
// each feature domain gets a distinct hue family (indigo, orange, grape, teal, gray)
// with consistent luminance steps from light to dark within each group.
// Palette sourced from Open Color / Mantine design system for data-viz readability.
export const BILLING_CALL_TYPE_REGISTRY: readonly BillingCallTypeEntry[] = Object.freeze([
  // ── Pipeline (indigo — "data flow" feel, Stripe-adjacent) ──
  { reason: 'needset_search_planner',     label: 'NeedSet',         color: 'var(--sf-billing-pipeline-1, #748ffc)', group: 'Pipeline' },
  { reason: 'brand_resolution',           label: 'Brand',           color: 'var(--sf-billing-pipeline-2, #5c7cfa)', group: 'Pipeline' },
  { reason: 'search_planner_enhance',     label: 'Search Planner',  color: 'var(--sf-billing-pipeline-3, #4c6ef5)', group: 'Pipeline' },
  { reason: 'serp_url_selector',          label: 'SERP Selector',   color: 'var(--sf-billing-pipeline-4, #4263eb)', group: 'Pipeline' },

  // ── Product Image (orange — warm "creative content" feel) ──
  { reason: 'product_image_finding',      label: 'Image Finder',    color: 'var(--sf-billing-image-1, #ff922b)', group: 'Product Image' },
  { reason: 'image_view_evaluation',      label: 'View Eval',       color: 'var(--sf-billing-image-2, #fd7e14)', group: 'Product Image' },
  { reason: 'image_hero_selection',       label: 'Hero Eval',       color: 'var(--sf-billing-image-3, #f76707)', group: 'Product Image' },
  { reason: 'hero_image_finding',         label: 'Hero Finder',     color: 'var(--sf-billing-image-4, #e8590c)', group: 'Product Image' },

  // ── Color Edition (grape — distinct pink-purple, separates from indigo) ──
  { reason: 'color_edition_finding',      label: 'CEF',             color: 'var(--sf-billing-color-1, #da77f2)', group: 'Color Edition' },
  { reason: 'variant_identity_check',     label: 'Variant ID',      color: 'var(--sf-billing-color-2, #be4bdb)', group: 'Color Edition' },

  // ── Validation (teal — cool "verification" feel, distinct from indigo) ──
  { reason: 'validate_enum_consistency',  label: 'Enum Validator',  color: 'var(--sf-billing-val-1, #38d9a9)', group: 'Validation' },
  { reason: 'validate_component_matches', label: 'Component Match', color: 'var(--sf-billing-val-2, #20c997)', group: 'Validation' },
  { reason: 'field_repair',              label: 'Repair',           color: 'var(--sf-billing-val-3, #12b886)', group: 'Validation' },

  // ── Other (neutral gray — stays out of the way) ──
  { reason: 'extract',                   label: 'Extract',          color: 'var(--sf-billing-other-1, #868e96)', group: 'Other' },
  { reason: 'health',                    label: 'Health Check',     color: 'var(--sf-billing-other-2, #495057)', group: 'Other' },
]);

export const BILLING_CALL_TYPE_FALLBACK: BillingCallTypeEntry = Object.freeze({
  reason: 'unknown',
  label: 'Other',
  color: 'var(--sf-billing-other-1, #94a3b8)',
  group: 'Other',
});

export const BILLING_CALL_TYPE_MAP: Readonly<Record<string, BillingCallTypeEntry>> = Object.freeze(
  Object.fromEntries(BILLING_CALL_TYPE_REGISTRY.map((e) => [e.reason, e])),
);

export function resolveBillingCallType(reason: string): BillingCallTypeEntry {
  return BILLING_CALL_TYPE_MAP[reason] ?? BILLING_CALL_TYPE_FALLBACK;
}

// WHY: Derived group list for filter bar. Preserves registry order.
export const BILLING_CALL_TYPE_GROUPS: readonly string[] = Object.freeze(
  [...new Set(BILLING_CALL_TYPE_REGISTRY.map((e) => e.group))],
);
