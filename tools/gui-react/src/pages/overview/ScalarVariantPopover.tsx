import { useCallback, useState } from 'react';
import type { ScalarVariantProgressGen } from '../../types/product.generated.ts';
import type { LlmOverridePhaseId } from '../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';
import { ColorSwatch } from '../../shared/ui/finder/ColorSwatch.tsx';
import { FinderRunModelBadge, useResolvedFinderModel } from '../../shared/ui/finder/index.ts';
import { Popover } from '../../shared/ui/overlay/Popover.tsx';
import { FinderRunPopoverShell } from '../../shared/ui/overlay/FinderRunPopoverShell.tsx';
import { useFireAndForget } from '../../features/operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning } from '../../features/operations/hooks/useFinderOperations.ts';
import { ConfidenceDiamond } from './ConfidenceDiamond.tsx';
import './PifVariantRings.css';

function truncate(str: string, max = 10): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}
const DEFAULT_FORMAT = (v: string) => truncate(v, 10);

export interface ScalarVariantPopoverProps {
  readonly productId: string;
  readonly category: string;
  readonly variant: ScalarVariantProgressGen;
  readonly hexMap: ReadonlyMap<string, string>;
  /** Module type used by the operations tracker — e.g. 'skf' or 'rdf'. */
  readonly moduleType: 'skf' | 'rdf';
  /** LLM phase id for `useResolvedFinderModel` — e.g. 'skuFinder' or 'releaseDateFinder'. */
  readonly phaseId: LlmOverridePhaseId;
  /** Popover title — e.g. "SKU Finder" or "Release Date Finder". */
  readonly title: string;
  /** Short label shown before the model badge, e.g. "SKU" or "RDF". */
  readonly labelPrefix: string;
  /** Base URL for run — e.g. "/sku-finder/:cat/:pid". Loop appends "/loop". */
  readonly runUrl: string;
  /** Tooltip field label — e.g. "SKU" or "Release Date". */
  readonly valueLabel: string;
  /** Label formatter for the value chip under the diamond (e.g. YYYY-MM for RDF). */
  readonly formatLabel?: (value: string) => string;
  /** When true, the trigger SVG pulses (this variant has a run / loop op in flight). */
  readonly pulsing?: boolean;
}

/**
 * Per-variant Run / Loop popover for scalar finders (SKU, RDF). Trigger is the
 * color chip + confidence diamond + truncated value label; clicking opens a
 * popover with the resolved model and two actions, both scoped to this single
 * variant via `{ variant_key, variant_id }`.
 */
export function ScalarVariantPopover({
  productId, category, variant, hexMap,
  moduleType, phaseId, title, labelPrefix, runUrl,
  valueLabel, formatLabel = DEFAULT_FORMAT, pulsing = false,
}: ScalarVariantPopoverProps) {
  const [open, setOpen] = useState(false);
  const hexParts = variant.color_atoms.map((atom) => hexMap.get(atom) || '').filter(Boolean);
  const label = variant.variant_label || variant.variant_key || variant.variant_id;
  const hasValue = variant.value && variant.confidence > 0;

  const fire = useFireAndForget({ type: moduleType, category, productId });
  const isRunning = useIsModuleRunning(moduleType, productId);
  const { model, accessMode, modelDisplay, effortLevel } = useResolvedFinderModel(phaseId);

  const loopUrl = `${runUrl}/loop`;
  const variantKey = variant.variant_key || '';
  const variantId = variant.variant_id;

  const handleRun = useCallback(() => {
    fire(runUrl, { variant_key: variantKey, variant_id: variantId }, { variantKey });
    setOpen(false);
  }, [fire, runUrl, variantKey, variantId]);

  const handleLoop = useCallback(() => {
    fire(loopUrl, { variant_key: variantKey, variant_id: variantId }, { subType: 'loop', variantKey });
    setOpen(false);
  }, [fire, loopUrl, variantKey, variantId]);

  const triggerTooltip = hasValue
    ? `${label} \u00b7 ${valueLabel}: ${variant.value} \u00b7 conf ${Math.round(variant.confidence)}%`
    : `${label} \u00b7 ${valueLabel}: (no candidate)`;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      triggerLabel={`${labelPrefix} ${label} — click to run`}
      trigger={
        <span className={`sf-pif-rings-cluster${pulsing ? ' sf-pulsing' : ''}`} title={triggerTooltip}>
          <ColorSwatch hexParts={hexParts} size="md" />
          <ConfidenceDiamond confidence={variant.confidence} />
          <span className="sf-pif-rings-label">
            {hasValue ? formatLabel(variant.value) : '\u2014'}
          </span>
        </span>
      }
    >
      <FinderRunPopoverShell
        title={`${title} — ${label}`}
        meta={
          hasValue
            ? <>{valueLabel}: <span className="font-mono">{variant.value}</span> &middot; {Math.round(variant.confidence)}%</>
            : <>No candidate yet</>
        }
        modelSlot={
          <FinderRunModelBadge
            labelPrefix={labelPrefix}
            model={modelDisplay}
            accessMode={accessMode}
            thinking={model?.thinking ?? false}
            webSearch={model?.webSearch ?? false}
            effortLevel={effortLevel}
          />
        }
        actions={
          <>
            <button type="button" className="sf-frp-btn-primary" onClick={handleRun} disabled={isRunning}>
              Run
            </button>
            <button type="button" className="sf-frp-btn-secondary" onClick={handleLoop} disabled={isRunning}>
              Loop
            </button>
          </>
        }
      />
    </Popover>
  );
}
