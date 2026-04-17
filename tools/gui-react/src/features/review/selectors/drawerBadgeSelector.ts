import { isVariantBackedField } from '../../color-edition-finder/index.ts';

export type DrawerBadgeKind = 'variant' | 'value';

/**
 * Decide which published-state badge (if any) to render in the review drawer header.
 *
 * Returns 'variant' for CEF-owned fields (colors, editions), 'value' for everything
 * else, or null when the field has nothing published.
 */
export function resolveDrawerBadge(fieldKey: string, hasPublished: boolean): DrawerBadgeKind | null {
  if (!hasPublished) return null;
  return isVariantBackedField(fieldKey) ? 'variant' : 'value';
}
