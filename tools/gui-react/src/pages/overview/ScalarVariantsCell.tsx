import type { ScalarVariantProgressGen } from '../../types/product.generated.ts';
import type { LlmOverridePhaseId } from '../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';
import { useRunningVariantKeysAny } from '../../features/operations/hooks/useFinderOperations.ts';
import { ScalarVariantPopover } from './ScalarVariantPopover.tsx';
import type { IndexLabLinkTabId } from './IndexLabLink.tsx';
import './PifVariantRings.css';

export interface ScalarVariantsCellProps {
  readonly productId: string;
  readonly category: string;
  readonly variants: readonly ScalarVariantProgressGen[];
  readonly hexMap: ReadonlyMap<string, string>;
  /** Module type used by the operations tracker — e.g. 'skf' or 'rdf'. */
  readonly moduleType: 'skf' | 'rdf';
  /** Finder id for the prompt-preview API — 'sku' or 'rdf'. */
  readonly finderId: 'sku' | 'rdf';
  /** Module id used by the Discovery History drawer — 'skuFinder' / 'releaseDateFinder'. */
  readonly historyFinderId: string;
  /** Route prefix matching the runs endpoint, e.g. 'sku-finder' / 'release-date-finder'. */
  readonly historyRoutePrefix: string;
  /** LLM phase id for useResolvedFinderModel. */
  readonly phaseId: LlmOverridePhaseId;
  /** Full-name title shown in the popover header. */
  readonly title: string;
  /** Short prefix shown on the model badge + ARIA label. */
  readonly labelPrefix: string;
  /** Base run URL — Loop is derived as `${runUrl}/loop`. */
  readonly runUrl: string;
  /** Tooltip field name — e.g. "SKU" or "Release Date". */
  readonly valueLabel: string;
  /** Optional label formatter for the truncated value under each diamond. */
  readonly formatLabel?: (value: string) => string;
  /** Optional full value formatter for popovers and tooltips. */
  readonly formatValue?: (value: string) => string;
  /** Tab id used by the IndexLabLink under the diamond — 'skuFinder' or 'releaseDateFinder'. */
  readonly linkTabId: IndexLabLinkTabId;
  /** Brand for the IndexLab picker. */
  readonly brand: string;
  /** base_model for the IndexLab picker. */
  readonly baseModel: string;
}

/**
 * Overview scalar-finder cell (SKU + RDF). Each variant becomes its own
 * clickable popover trigger with Run / Loop actions scoped to that variant.
 */
export function ScalarVariantsCell({
  productId, category, variants, hexMap,
  moduleType, finderId, historyFinderId, historyRoutePrefix, phaseId, title, labelPrefix, runUrl,
  valueLabel, formatLabel, formatValue, linkTabId, brand, baseModel,
}: ScalarVariantsCellProps) {
  // Subscribe once per product — each variant reads its own pulse bool from the shared set.
  const runningKeys = useRunningVariantKeysAny(moduleType, productId);
  if (!variants.length) {
    return <span className="sf-text-subtle text-xs italic">—</span>;
  }
  return (
    <span className="inline-flex gap-2.5 flex-wrap items-start">
      {variants.map((v) => (
        <ScalarVariantPopover
          key={v.variant_id}
          productId={productId}
          category={category}
          variant={v}
          hexMap={hexMap}
          moduleType={moduleType}
          finderId={finderId}
          historyFinderId={historyFinderId}
          historyRoutePrefix={historyRoutePrefix}
          phaseId={phaseId}
          title={title}
          labelPrefix={labelPrefix}
          runUrl={runUrl}
          valueLabel={valueLabel}
          formatLabel={formatLabel}
          formatValue={formatValue}
          pulsing={runningKeys.has(v.variant_key)}
          linkTabId={linkTabId}
          brand={brand}
          baseModel={baseModel}
        />
      ))}
    </span>
  );
}
