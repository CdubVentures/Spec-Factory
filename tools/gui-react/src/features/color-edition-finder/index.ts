/**
 * Color Edition Finder — Public API
 *
 * Cross-feature consumers (e.g. PIF) import from here.
 * Internal components import directly from their source files.
 */
export { useColorEditionFinderQuery } from './api/colorEditionFinderQueries.ts';
export type { ColorRegistryEntry } from './types.ts';

// WHY: Mirror of backend VARIANT_BACKED_FIELDS (src/features/color-edition/index.js).
// UI consumers (e.g. review drawer badge) decide rendering based on this list.
// Keep in sync with the backend when adding a new variant-backed field.
export const VARIANT_BACKED_FIELDS = ['colors', 'editions'] as const;
export const isVariantBackedField = (fieldKey: string): boolean =>
  (VARIANT_BACKED_FIELDS as readonly string[]).includes(fieldKey);
