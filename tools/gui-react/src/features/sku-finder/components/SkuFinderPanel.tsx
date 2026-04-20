import { GenericScalarFinderPanel } from '../../../shared/ui/finder/index.ts';
import {
  useSkuFinderQuery,
  useDeleteSkuFinderRunMutation,
  useDeleteSkuFinderAllMutation,
} from '../api/skuFinderQueries.generated.ts';
import { skuHowItWorksSections } from '../skuHowItWorksContent.ts';

interface SkuFinderPanelProps {
  readonly productId: string;
  readonly category: string;
}

export function SkuFinderPanel({ productId, category }: SkuFinderPanelProps) {
  return (
    <GenericScalarFinderPanel
      productId={productId}
      category={category}
      finderId="skuFinder"
      useQuery={useSkuFinderQuery}
      useDeleteRunMutation={useDeleteSkuFinderRunMutation}
      useDeleteAllMutation={useDeleteSkuFinderAllMutation}
      howItWorksSections={skuHowItWorksSections}
    />
  );
}
