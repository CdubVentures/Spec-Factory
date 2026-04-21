/**
 * Finder tab metadata — hand-maintained side-map keyed by FinderPanelId from
 * the auto-generated FINDER_PANELS registry. Adding a new finder tab:
 *   1) Add it to backend `src/core/finder/finderModuleRegistry.js`.
 *   2) Regenerate with `node tools/gui-react/scripts/generateLlmPhaseRegistry.js`.
 *   3) Create `features/<feature>/tabSummary.ts` exporting `useXxxTabSummary`.
 *   4) Add one row below. TypeScript will refuse to compile if missed (Record<FinderPanelId,...>).
 *
 * The __tests__/finderTabMeta.test.ts sync ward additionally catches stale
 * keys (removed finders) that Record<id,...> does not.
 */

import { FINDER_PANELS } from '../state/finderPanelRegistry.generated.ts';
import { useCefTabSummary } from '../../color-edition-finder/tabSummary.ts';
import { usePifTabSummary } from '../../product-image-finder/tabSummary.ts';
import { useRdfTabSummary } from '../../release-date-finder/tabSummary.ts';
import { useSkuTabSummary } from '../../sku-finder/tabSummary.ts';
import { useKeyFinderTabSummary } from '../../key-finder/tabSummary.ts';
import { usePipelineTabSummary } from './pipelineTabSummary.ts';
import type { FinderTabSummary } from '../../../shared/ui/finder/tabSummary.ts';

export type FinderPanelId = typeof FINDER_PANELS[number]['id'];

export const PIPELINE_TAB_ID = 'pipeline' as const;
export type IndexingTabId = typeof PIPELINE_TAB_ID | FinderPanelId;

export interface FinderTabMeta {
  /** Short icon glyph rendered in the tab button's icon slot. */
  readonly icon: string;
  /** Class suffix for the icon badge color (cef, pif, rdf, sku, ...). */
  readonly iconClass: string;
  /** Display name for the tab button. */
  readonly shortName: string;
  /** Hook returning the tab's KPI + status. Must reuse the panel's queryKey for cache sharing. */
  readonly useTabSummary: (productId: string, category: string) => FinderTabSummary;
}

export const FINDER_TAB_META: Record<FinderPanelId, FinderTabMeta> = {
  colorEditionFinder: {
    icon: '◈',
    iconClass: 'cef',
    shortName: 'Color & Edition',
    useTabSummary: useCefTabSummary,
  },
  productImageFinder: {
    icon: '▣',
    iconClass: 'pif',
    shortName: 'Product Image',
    useTabSummary: usePifTabSummary,
  },
  releaseDateFinder: {
    icon: '◷',
    iconClass: 'rdf',
    shortName: 'Release Date',
    useTabSummary: useRdfTabSummary,
  },
  skuFinder: {
    icon: '⌗',
    iconClass: 'sku',
    shortName: 'SKU',
    useTabSummary: useSkuTabSummary,
  },
  keyFinder: {
    icon: '⚙',
    iconClass: 'key',
    shortName: 'Key',
    useTabSummary: useKeyFinderTabSummary,
  },
};

export const PIPELINE_TAB_META: FinderTabMeta = {
  icon: '▶',
  iconClass: 'pipeline',
  shortName: 'Pipeline',
  useTabSummary: usePipelineTabSummary,
};

export const INDEXING_TAB_META: Record<IndexingTabId, FinderTabMeta> = {
  [PIPELINE_TAB_ID]: PIPELINE_TAB_META,
  ...FINDER_TAB_META,
};

export function getIndexingTabIds(): readonly IndexingTabId[] {
  return [PIPELINE_TAB_ID, ...FINDER_PANELS.map((p) => p.id as FinderPanelId)];
}
