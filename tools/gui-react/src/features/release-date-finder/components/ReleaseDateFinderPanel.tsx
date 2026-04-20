import { GenericScalarFinderPanel } from '../../../shared/ui/finder/index.ts';
import {
  useReleaseDateFinderQuery,
  useDeleteReleaseDateFinderRunMutation,
  useDeleteReleaseDateFinderAllMutation,
} from '../api/releaseDateFinderQueries.generated.ts';
import { rdfHowItWorksSections } from '../rdfHowItWorksContent.ts';
import { maybeFormatDateValue } from '../../../utils/dateTime.ts';

interface ReleaseDateFinderPanelProps {
  readonly productId: string;
  readonly category: string;
}

export function ReleaseDateFinderPanel({ productId, category }: ReleaseDateFinderPanelProps) {
  return (
    <GenericScalarFinderPanel
      productId={productId}
      category={category}
      finderId="releaseDateFinder"
      useQuery={useReleaseDateFinderQuery}
      useDeleteRunMutation={useDeleteReleaseDateFinderRunMutation}
      useDeleteAllMutation={useDeleteReleaseDateFinderAllMutation}
      howItWorksSections={rdfHowItWorksSections}
      formatValue={maybeFormatDateValue}
    />
  );
}
