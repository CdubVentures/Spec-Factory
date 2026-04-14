// WHY: Single source of truth for billing reason → display label + chart color.
// Adding a new LLM call source = add one row here. O(1) scaling.
// Color pattern matches modelRingColor() — var(--token, #fallback).

export interface BillingCallTypeEntry {
  readonly reason: string;
  readonly label: string;
  readonly color: string;
}

export const BILLING_CALL_TYPE_REGISTRY: readonly BillingCallTypeEntry[] = Object.freeze([
  { reason: 'needset_search_planner',     label: 'NeedSet',         color: 'var(--sf-token-accent)' },
  { reason: 'brand_resolution',           label: 'Brand',           color: 'var(--sf-teal-fg, #5eead4)' },
  { reason: 'search_planner_enhance',     label: 'Search Planner',  color: 'var(--sf-purple-fg, #d8b4fe)' },
  { reason: 'serp_url_selector',          label: 'SERP Selector',   color: 'var(--sf-token-state-success-fg)' },
  { reason: 'product_image_finding',      label: 'Image Finder',    color: 'var(--sf-token-state-warning-fg)' },
  { reason: 'image_view_evaluation',      label: 'View Eval',       color: 'var(--sf-token-state-error-fg)' },
  { reason: 'image_hero_selection',       label: 'Hero Eval',       color: 'var(--sf-pink-fg, #f472b6)' },
  { reason: 'hero_image_finding',         label: 'Hero Finder',     color: 'var(--sf-orange-fg, #fb923c)' },
  { reason: 'color_edition_finding',      label: 'CEF',             color: 'var(--sf-indigo-fg, #818cf8)' },
  { reason: 'variant_identity_check',     label: 'Variant ID',      color: 'var(--sf-cyan-fg, #22d3ee)' },
  { reason: 'validate_enum_consistency',  label: 'Enum Validator',  color: 'var(--sf-violet-fg, #a78bfa)' },
  { reason: 'validate_component_matches', label: 'Component Match', color: 'var(--sf-lime-fg, #a3e635)' },
  { reason: 'field_repair',              label: 'Repair',           color: 'var(--sf-rose-fg, #fb7185)' },
  { reason: 'health',                    label: 'Health Check',     color: 'var(--sf-token-text-muted)' },
  { reason: 'extract',                   label: 'Extract',          color: 'var(--sf-token-text-subtle)' },
]);

export const BILLING_CALL_TYPE_FALLBACK: BillingCallTypeEntry = Object.freeze({
  reason: 'unknown',
  label: 'Other',
  color: 'var(--sf-token-text-subtle)',
});

export const BILLING_CALL_TYPE_MAP: Readonly<Record<string, BillingCallTypeEntry>> = Object.freeze(
  Object.fromEntries(BILLING_CALL_TYPE_REGISTRY.map((e) => [e.reason, e])),
);

export function resolveBillingCallType(reason: string): BillingCallTypeEntry {
  return BILLING_CALL_TYPE_MAP[reason] ?? BILLING_CALL_TYPE_FALLBACK;
}
