import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import type { ScalarVariantProgressGen } from '../../types/product.generated.ts';
import type { LlmOverridePhaseId } from '../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';
import { ColorSwatch } from '../../shared/ui/finder/ColorSwatch.tsx';
import { FinderRunModelBadge, PromptPreviewModal, useResolvedFinderModel } from '../../shared/ui/finder/index.ts';
import { Popover } from '../../shared/ui/overlay/Popover.tsx';
import { FinderRunPopoverShell } from '../../shared/ui/overlay/FinderRunPopoverShell.tsx';
import { useFireAndForget } from '../../features/operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning } from '../../features/operations/hooks/useFinderOperations.ts';
import { usePromptPreviewQuery } from '../../features/indexing/api/promptPreviewQueries.ts';
import { useFinderDiscoveryHistoryStore } from '../../stores/finderDiscoveryHistoryStore.ts';
import { groupHistory, type FinderRun } from '../../shared/ui/finder/discoveryHistoryHelpers.ts';
import { ConfidenceDiamond } from './ConfidenceDiamond.tsx';
import { RunPreviewCell } from './RunPreviewCell.tsx';
import { IndexLabLink, type IndexLabLinkTabId } from './IndexLabLink.tsx';
import './PifVariantRings.css';

function truncate(str: string, max = 10): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '\u2026';
}
const DEFAULT_FORMAT = (v: string) => truncate(v, 10);
const DEFAULT_FORMAT_VALUE = (v: string) => v;

export interface ScalarVariantPopoverProps {
  readonly productId: string;
  readonly category: string;
  readonly variant: ScalarVariantProgressGen;
  readonly hexMap: ReadonlyMap<string, string>;
  /** Module type used by the operations tracker — e.g. 'skf' or 'rdf'. */
  readonly moduleType: 'skf' | 'rdf';
  /** Finder id used by the prompt-preview API — 'sku' or 'rdf'. */
  readonly finderId: 'sku' | 'rdf';
  /** Module id passed to `/finder/:cat/:pid` GET for runs (lazy-fetched
   *  when the popover opens). e.g. 'skuFinder' or 'releaseDateFinder'. */
  readonly historyFinderId: string;
  /** Route prefix matching the runs endpoint, e.g. 'sku-finder' / 'release-date-finder'. */
  readonly historyRoutePrefix: string;
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
  /** Label formatter for the value chip under the diamond. */
  readonly formatLabel?: (value: string) => string;
  /** Full value formatter for tooltip and popover meta. */
  readonly formatValue?: (value: string) => string;
  /** When true, the trigger SVG pulses (this variant has a run / loop op in flight). */
  readonly pulsing?: boolean;
  /** Tab id used by the IndexLabLink under the diamond. */
  readonly linkTabId: IndexLabLinkTabId;
  /** Brand for the IndexLab picker. */
  readonly brand: string;
  /** base_model for the IndexLab picker. */
  readonly baseModel: string;
}

type ScalarPromptMode = 'run' | 'loop';

/**
 * Per-variant Run / Loop popover for scalar finders (SKU, RDF). Trigger is the
 * color chip + confidence diamond + truncated value label; clicking opens a
 * popover with the resolved model and two actions, both scoped to this single
 * variant via `{ variant_key, variant_id }`.
 */
export function ScalarVariantPopover({
  productId, category, variant, hexMap,
  moduleType, finderId, historyFinderId, historyRoutePrefix, phaseId, title, labelPrefix, runUrl,
  valueLabel, formatLabel = DEFAULT_FORMAT, formatValue = DEFAULT_FORMAT_VALUE, pulsing = false,
  linkTabId, brand, baseModel,
}: ScalarVariantPopoverProps) {
  const [open, setOpen] = useState(false);
  const [promptPreview, setPromptPreview] = useState<ScalarPromptMode | null>(null);
  const hexParts = variant.color_atoms.map((atom) => hexMap.get(atom) || '').filter(Boolean);
  const label = variant.variant_label || variant.variant_key || variant.variant_id;
  const hasValue = variant.value && variant.confidence > 0;

  const fire = useFireAndForget({ type: moduleType, category, productId });
  const isRunning = useIsModuleRunning(moduleType, productId);
  const { model, accessMode, modelDisplay, effortLevel } = useResolvedFinderModel(phaseId);

  const loopUrl = `${runUrl}/loop`;
  const variantKey = variant.variant_key || '';
  const variantId = variant.variant_id;
  const displayValue = hasValue ? formatValue(variant.value) : '';

  // WHY: Action handlers below intentionally leave the popover open — users
  // spam-click to queue multiple runs and watch the active strip update
  // without having to re-open the popover each time.
  const handleRun = useCallback(() => {
    fire(runUrl, { variant_key: variantKey, variant_id: variantId }, { variantKey });
  }, [fire, runUrl, variantKey, variantId]);

  const handleLoop = useCallback(() => {
    fire(loopUrl, { variant_key: variantKey, variant_id: variantId }, { subType: 'loop', variantKey });
  }, [fire, loopUrl, variantKey, variantId]);

  // Lazy-fetched runs for the Hist count badge. Fires only when the popover
  // is open, so closed-row table render stays cheap.
  const { data: finderRuns } = useQuery<{ runs?: readonly FinderRun[] }>({
    queryKey: [historyRoutePrefix, category, productId],
    queryFn: () => api.get(`/${historyRoutePrefix}/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`),
    enabled: open && Boolean(productId) && Boolean(category),
    staleTime: 5_000,
  });
  const histCounts = useMemo(() => {
    if (!variantId) return null;
    const grouped = groupHistory((finderRuns?.runs ?? []) as readonly FinderRun[], 'variant');
    const bucket = grouped.byVariant.get(variantId);
    return { urls: bucket?.urls.size ?? 0, queries: bucket?.queries.size ?? 0 };
  }, [finderRuns?.runs, variantId]);

  const openHistoryDrawer = useFinderDiscoveryHistoryStore((s) => s.openDrawer);
  const handleOpenHistory = useCallback(() => {
    if (!variantId) return;
    openHistoryDrawer({
      finderId: historyFinderId,
      productId,
      category,
      variantIdFilter: variantId,
    });
  }, [openHistoryDrawer, historyFinderId, productId, category, variantId]);

  const promptPreviewBody = useMemo(() => (
    promptPreview
      ? { variant_key: variantKey, mode: promptPreview }
      : {}
  ), [promptPreview, variantKey]);
  const promptPreviewQuery = usePromptPreviewQuery(
    finderId,
    category,
    productId,
    promptPreviewBody,
    Boolean(promptPreview),
  );

  const triggerTooltip = hasValue
    ? `${label} \u00b7 ${valueLabel}: ${displayValue} \u00b7 conf ${Math.round(variant.confidence)}%`
    : `${label} \u00b7 ${valueLabel}: (no candidate)`;

  return (
    <span className={`sf-pif-rings-cluster${pulsing ? ' sf-pulsing' : ''}`}>
      <Popover
        open={open}
        onOpenChange={setOpen}
        triggerLabel={`${labelPrefix} ${label} — click to run`}
        trigger={
          <span className="sf-pif-rings-color-trigger" title={triggerTooltip}>
            <ColorSwatch hexParts={hexParts} size="md" />
            <ConfidenceDiamond confidence={variant.confidence} />
          </span>
        }
      >
      <FinderRunPopoverShell
        title={`${title} — ${label}`}
        meta={
          hasValue
            ? <>{valueLabel}: <span className="font-mono">{displayValue}</span> &middot; {Math.round(variant.confidence)}%</>
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
          <div className="sf-overview-scalar-actions">
            <RunPreviewCell
              label="Run"
              runTitle={`${title} — single Run`}
              previewTitle={`Preview the ${labelPrefix} Run prompt`}
              onRun={handleRun}
              onPreview={() => setPromptPreview('run')}
              primary
            />
            <RunPreviewCell
              label="Loop"
              runTitle={`${title} — Loop until budget exhausted`}
              previewTitle={`Preview the ${labelPrefix} Loop prompt (iteration 1)`}
              onRun={handleLoop}
              onPreview={() => setPromptPreview('loop')}
              disabled={isRunning}
            />
            <button
              type="button"
              className="sf-frp-btn-history sf-overview-scalar-hist"
              onClick={handleOpenHistory}
              disabled={!variantId}
              title={!variantId ? 'No variant_id — open the panel-level history.' : `Open Discovery History filtered to "${label}".`}
            >
              Hist
              <span className="ml-1 font-mono text-[11px]">
                (<span className="font-bold">{histCounts?.queries ?? 0}</span>
                <span className="font-normal opacity-70">qu</span>)
                (<span className="font-bold">{histCounts?.urls ?? 0}</span>
                <span className="font-normal opacity-70">url</span>)
              </span>
            </button>
          </div>
        }
      />

      <PromptPreviewModal
        open={Boolean(promptPreview)}
        onClose={() => setPromptPreview(null)}
        query={promptPreviewQuery}
        title={`${title} — ${promptPreview === 'loop' ? 'Loop' : 'Run'}`}
        subtitle={`variant: ${variantKey}`}
        storageKeyPrefix={`overview:${finderId}:preview:${productId}:${variantKey}:${promptPreview ?? ''}`}
      />
      </Popover>

      <IndexLabLink
        category={category}
        productId={productId}
        brand={brand}
        baseModel={baseModel}
        tabId={linkTabId}
        title={`Open ${title} for ${label}`}
        className="sf-pif-rings-label"
      >
        {hasValue ? formatLabel(variant.value) : '\u2014'}
      </IndexLabLink>
    </span>
  );
}
