/**
 * Color Edition Finder — Public API
 *
 * Cross-feature consumers (e.g. PIF) import from here.
 * Internal components import directly from their source files.
 */
export { useColorEditionFinderQuery } from './api/colorEditionFinderQueries.ts';
export type { ColorRegistryEntry } from './types.ts';
