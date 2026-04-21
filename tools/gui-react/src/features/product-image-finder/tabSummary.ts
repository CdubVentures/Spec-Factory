import { useProductImageFinderQuery } from './api/productImageFinderQueries.ts';
import { useColorEditionFinderQuery } from '../color-edition-finder/index.ts';
import type { ProductImageFinderResult } from './types.ts';
import type { ColorEditionFinderResult } from '../color-edition-finder/types.ts';
import type { FinderTabSummary, FinderTabStatus } from '../../shared/ui/finder/tabSummary.ts';

/**
 * PIF tab summary. Uses a lightweight image-count + variant-count KPI rather
 * than re-computing the carousel aggregate (which requires slot resolution and
 * lives inside ProductImageFinderPanel). The panel itself remains the source
 * of truth for carousel progress; the tab is a hint.
 *
 * Status thresholds:
 *   - 'idle'     → no CEF variants yet (nothing to discover against)
 *   - 'empty'    → variants exist, zero images
 *   - 'partial'  → some images, below rough target (variants × 4)
 *   - 'complete' → images >= variants × 4 (enough for every carousel slot)
 */
export function derivePifTabSummary(
  pifData: ProductImageFinderResult | null,
  cefData: ColorEditionFinderResult | null,
): FinderTabSummary {
  const images = pifData?.images?.length ?? 0;
  const variants = cefData?.variant_registry?.length ?? 0;
  if (variants === 0) {
    return { kpi: 'no variants', status: 'idle' };
  }
  const target = variants * 4;
  const status: FinderTabStatus =
    images === 0 ? 'empty' :
    images >= target ? 'complete' :
    'partial';
  return {
    kpi: `${images} img · ${variants} var`,
    status,
  };
}

export function usePifTabSummary(productId: string, category: string): FinderTabSummary {
  const { data: pifData } = useProductImageFinderQuery(category, productId);
  const { data: cefData } = useColorEditionFinderQuery(category, productId);
  return derivePifTabSummary(pifData ?? null, cefData ?? null);
}
