import { useReleaseDateFinderQuery } from './api/releaseDateFinderQueries.generated.ts';
import { useColorEditionFinderQuery } from '../color-edition-finder/index.ts';
import {
  deriveScalarPublishedSummary,
  type FinderTabSummary,
} from '../../shared/ui/finder/tabSummary.ts';

export function useRdfTabSummary(productId: string, category: string): FinderTabSummary {
  const { data: rdfData } = useReleaseDateFinderQuery(category, productId);
  const { data: cefData } = useColorEditionFinderQuery(category, productId);
  return deriveScalarPublishedSummary({
    candidates: rdfData?.candidates ?? [],
    totalVariants: cefData?.variant_registry?.length ?? 0,
  });
}
