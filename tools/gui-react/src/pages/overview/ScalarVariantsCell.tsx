import type { ScalarVariantProgressGen } from '../../types/product.generated.ts';
import type { LlmOverridePhaseId } from '../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';
import { useRunningVariantKeysAny } from '../../features/operations/hooks/useFinderOperations.ts';
import { ScalarVariantPopover } from './ScalarVariantPopover.tsx';
import './PifVariantRings.css';

export interface ScalarVariantsCellProps {
  readonly productId: string;
  readonly category: string;
  readonly variants: readonly ScalarVariantProgressGen[];
  readonly hexMap: ReadonlyMap<string, string>;
  /** Module type used by the operations tracker — e.g. 'skf' or 'rdf'. */
  readonly moduleType: 'skf' | 'rdf';
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
}

/**
 * Overview scalar-finder cell (SKU + RDF). Each variant becomes its own
 * clickable popover trigger with Run / Loop actions scoped to that variant.
 */
export function ScalarVariantsCell({
  productId, category, variants, hexMap,
  moduleType, phaseId, title, labelPrefix, runUrl,
  valueLabel, formatLabel,
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
          phaseId={phaseId}
          title={title}
          labelPrefix={labelPrefix}
          runUrl={runUrl}
          valueLabel={valueLabel}
          formatLabel={formatLabel}
          pulsing={runningKeys.has(v.variant_key)}
        />
      ))}
    </span>
  );
}
