import { isVariantBackedField } from '../../color-edition-finder/index.ts';

export type DrawerBadgeKind = 'variant' | 'value';

/**
 * Decide which published-state badge (if any) to render in the review drawer header.
 *
 * Priority:
 *   - nothing published → null
 *   - CEF-backed fields (colors/editions) OR caller-signalled variant-dependent → 'variant'
 *   - otherwise → 'value'
 *
 * The `variantDependent` flag is the backend's signal (ReviewLayoutRow.field_rule.variant_dependent)
 * for fields whose published state is per-variant (release_date, future discontinued/SKU/price).
 */
export function resolveDrawerBadge(
  fieldKey: string,
  hasPublished: boolean,
  variantDependent = false,
): DrawerBadgeKind | null {
  if (!hasPublished) return null;
  if (isVariantBackedField(fieldKey) || variantDependent) return 'variant';
  return 'value';
}
