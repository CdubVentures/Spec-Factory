// AUTO-GENERATED from src/core/config/llmPhaseDefs.js — do not edit manually.
// Run: node tools/gui-react/scripts/generateLlmPhaseRegistry.js

// WHY: Single source of truth for billing reason → display label + chart color.
// Derived from billing blocks on LLM_PHASE_DEFS entries. Adding a new LLM call
// source = add a `billing` block to the owning phase in llmPhaseDefs.js.

export interface BillingCallTypeEntry {
  readonly reason: string;
  readonly label: string;
  readonly color: string;
  readonly group: string;
}

export const BILLING_CALL_TYPE_REGISTRY: readonly BillingCallTypeEntry[] = Object.freeze([
  { reason: 'writer_formatting', label: 'Writer', color: 'var(--sf-billing-writer-1, #495057)', group: 'Writer' },
  { reason: 'needset_search_planner', label: 'NeedSet', color: 'var(--sf-billing-pipeline-1, #748ffc)', group: 'Pipeline' },
  { reason: 'search_planner_enhance', label: 'Search Planner', color: 'var(--sf-billing-pipeline-3, #4c6ef5)', group: 'Pipeline' },
  { reason: 'brand_resolution', label: 'Brand', color: 'var(--sf-billing-pipeline-2, #5c7cfa)', group: 'Pipeline' },
  { reason: 'serp_url_selector', label: 'SERP Selector', color: 'var(--sf-billing-pipeline-4, #4263eb)', group: 'Pipeline' },
  { reason: 'validate', label: 'Validate', color: 'var(--sf-billing-val-1, #38d9a9)', group: 'Validation' },
  { reason: 'field_repair', label: 'Repair', color: 'var(--sf-billing-val-3, #12b886)', group: 'Validation' },
  { reason: 'color_edition_finding', label: 'CEF', color: 'var(--sf-billing-color-1, #da77f2)', group: 'Color Edition' },
  { reason: 'variant_identity_check', label: 'Variant ID', color: 'var(--sf-billing-color-2, #be4bdb)', group: 'Color Edition' },
  { reason: 'product_image_finding', label: 'Image Finder', color: 'var(--sf-billing-image-1, #ff922b)', group: 'Product Image' },
  { reason: 'hero_image_finding', label: 'Hero Finder', color: 'var(--sf-billing-image-4, #e8590c)', group: 'Product Image' },
  { reason: 'image_view_evaluation', label: 'View Eval', color: 'var(--sf-billing-image-2, #fd7e14)', group: 'Product Image' },
  { reason: 'image_hero_selection', label: 'Hero Eval', color: 'var(--sf-billing-image-3, #f76707)', group: 'Product Image' },
  { reason: 'release_date_finding', label: 'RDF', color: 'var(--sf-billing-releasedate-1, #fcc419)', group: 'Release Date' },
  { reason: 'sku_finding', label: 'SKF', color: 'var(--sf-billing-sku-1, #ae3ec9)', group: 'SKU' },
  { reason: 'key_finding_easy', label: 'Easy', color: 'var(--sf-billing-keyfinder-1, #66d9e8)', group: 'Key Finder' },
  { reason: 'key_finding_medium', label: 'Medium', color: 'var(--sf-billing-keyfinder-2, #22b8cf)', group: 'Key Finder' },
  { reason: 'key_finding_hard', label: 'Hard', color: 'var(--sf-billing-keyfinder-3, #0c8599)', group: 'Key Finder' },
  { reason: 'key_finding_very_hard', label: 'Very Hard', color: 'var(--sf-billing-keyfinder-4, #0b7285)', group: 'Key Finder' },
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

export const BILLING_CALL_TYPE_GROUPS: readonly string[] = Object.freeze(
  [...new Set(BILLING_CALL_TYPE_REGISTRY.map((e) => e.group))],
);
