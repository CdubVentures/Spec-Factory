import { useSkuFinderQuery } from './api/skuFinderQueries.generated.ts';
import { useColorEditionFinderQuery } from '../color-edition-finder/index.ts';
import {
  deriveScalarPublishedSummary,
  type FinderTabSummary,
} from '../../shared/ui/finder/tabSummary.ts';

export function useSkuTabSummary(productId: string, category: string): FinderTabSummary {
  const { data: skuData } = useSkuFinderQuery(category, productId);
  const { data: cefData } = useColorEditionFinderQuery(category, productId);
  return deriveScalarPublishedSummary({
    candidates: skuData?.candidates ?? [],
    totalVariants: cefData?.variant_registry?.length ?? 0,
  });
}
