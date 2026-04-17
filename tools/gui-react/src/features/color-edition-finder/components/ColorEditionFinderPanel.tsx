import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { PubMark, PubLegend } from '../../../shared/ui/feedback/PubMark.tsx';
import {
  FinderPanelHeader,
  FinderKpiCard,
  FinderPanelFooter,
  FinderDeleteConfirmModal,
  FinderSectionCard,
  FinderHowItWorks,
  useResolvedFinderModel,
  deriveFinderStatusChip,
  ColorSwatch,
  usePagination,
  PagerSizeSelector,
  PagerNavFooter,
} from '../../../shared/ui/finder/index.ts';
import type { DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { usePersistedExpandMap } from '../../../stores/tabStore.ts';
import { usePublishedFields } from '../../../hooks/usePublishedFields.ts';
import {
  useColorEditionFinderQuery,
  useDeleteColorEditionFinderRunMutation,
  useDeleteColorEditionFinderAllMutation,
  useDeleteAllVariantsMutation,
  useDeleteVariantMutation,
} from '../api/colorEditionFinderQueries.ts';
import {
  deriveFinderKpiCards,
  deriveSelectedStateDisplay,
  deriveRunHistoryRows,
} from '../selectors/colorEditionFinderSelectors.ts';
import { cefHowItWorksSections } from '../cefHowItWorksContent.ts';
import { CefRunHistoryRow } from './CefRunHistoryRow.tsx';
import type { ColorPill } from '../selectors/colorEditionFinderSelectors.ts';
import type { ColorRegistryEntry } from '../types.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning } from '../../operations/hooks/useFinderOperations.ts';

/* ── CEF-specific sub-components ──────────────────────────────────── */

function ColorPillInline({ pill }: { readonly pill: ColorPill }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 sf-surface-panel border sf-border-soft rounded-md text-[11px] font-semibold sf-text-primary">
      <ColorSwatch hexParts={pill.hexParts} size="md" />
      {pill.displayName && (
        <span className="sf-text-primary">{pill.displayName}</span>
      )}
      <span className="font-mono sf-text-subtle">{pill.name}</span>
      {pill.isDefault && (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--sf-token-accent-strong)] shrink-0" />
      )}
      {pill.sourceCount > 0 && (
        <span className="px-1 py-0.5 rounded text-[9px] font-bold sf-text-muted sf-surface-soft">
          {pill.sourceCount}x
        </span>
      )}
    </span>
  );
}

function VariantDeleteButton({ variantId, variantLabel, onDelete, isPending }: {
  readonly variantId: string | null;
  readonly variantLabel: string;
  readonly onDelete: (variantId: string, variantLabel: string) => void;
  readonly isPending: boolean;
}) {
  if (!variantId) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDelete(variantId, variantLabel); }}
      disabled={isPending}
      className="ml-auto px-1.5 py-0.5 text-[9px] font-bold uppercase rounded sf-status-text-danger border sf-border-soft opacity-50 hover:opacity-100 disabled:opacity-40"
    >
      Del
    </button>
  );
}

function SelectedStateCard({ display, onDeleteVariant, deleteVariantPending, onDeleteAllVariants, deleteAllVariantsPending }: {
  readonly display: ReturnType<typeof deriveSelectedStateDisplay>;
  readonly onDeleteVariant?: (variantId: string, variantLabel: string) => void;
  readonly deleteVariantPending?: boolean;
  readonly onDeleteAllVariants?: (count: number) => void;
  readonly deleteAllVariantsPending?: boolean;
}) {
  if (display.colors.length === 0 && display.editions.length === 0) return null;

  const variantCount = display.colors.length + display.editions.length;

  return (
    <div className="sf-surface-elevated border sf-border-soft rounded-lg p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] sf-text-muted">
          Variant State
        </span>
        <div className="flex items-center gap-3">
          <PubLegend />
          {onDeleteAllVariants && variantCount > 0 && (
            <button
              onClick={() => onDeleteAllVariants(variantCount)}
              disabled={deleteAllVariantsPending || deleteVariantPending}
              className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Delete All
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Colors */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-2 inline-flex items-center gap-1.5">
            Colors ({display.colors.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {display.colors.map(pill => (
              <span key={pill.name} className="inline-flex items-center gap-1.5 px-2 py-1 sf-surface-panel border sf-border-soft rounded-md text-[11px] font-semibold sf-text-primary">
                <ColorSwatch hexParts={pill.hexParts} size="md" />
                {pill.displayName && <span className="sf-text-primary">{pill.displayName}</span>}
                <span className="font-mono sf-text-muted">{pill.name}</span>
                <PubMark published={pill.isPublished} size={10} />
                {onDeleteVariant && (
                  <VariantDeleteButton variantId={pill.variantId} variantLabel={pill.displayName || pill.name} onDelete={onDeleteVariant} isPending={deleteVariantPending ?? false} />
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Editions with paired colors */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-2 inline-flex items-center gap-1.5">
            Editions ({display.editions.length})
          </div>
          {display.editions.length === 0 ? (
            <span className="text-[11px] sf-text-muted">None</span>
          ) : (
            <div className="flex flex-col gap-2">
              {display.editions.map(ed => (
                <div key={ed.slug} className="sf-surface-panel border sf-border-soft rounded-md px-3 py-2">
                  <div className="mb-1.5 inline-flex items-center gap-1.5 w-full">
                    {ed.displayName && (
                      <span className="text-[12px] font-semibold sf-text-primary">{ed.displayName}</span>
                    )}
                    <span className="text-[12px] font-mono font-bold sf-chip-purple inline-block px-1.5 py-0.5 rounded">
                      {ed.slug}
                    </span>
                    <PubMark published={ed.isPublished} size={10} />
                    {ed.sourceCount > 0 && (
                      <span className="px-1 py-0.5 rounded text-[9px] font-bold sf-text-muted sf-surface-soft">
                        {ed.sourceCount}x
                      </span>
                    )}
                    {onDeleteVariant && (
                      <VariantDeleteButton variantId={ed.variantId} variantLabel={ed.displayName || ed.slug} onDelete={onDeleteVariant} isPending={deleteVariantPending ?? false} />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ed.pairedColors.map(pc => (
                      <span key={pc.name} className="inline-flex items-center gap-1 px-1.5 py-0.5 sf-surface-elevated rounded text-[10px] font-mono sf-text-muted">
                        <ColorSwatch hexParts={pc.hexParts} size="sm" />
                        {pc.name}
                      </span>
                    ))}
                    {ed.pairedColors.length === 0 && (
                      <span className="text-[10px] sf-text-muted">no colors</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */

interface ColorEditionFinderPanelProps {
  readonly productId: string;
  readonly category: string;
}

export function ColorEditionFinderPanel({ productId, category }: ColorEditionFinderPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:cef:collapsed:${productId}`, true);
  const { published } = usePublishedFields(category, productId);

  const { data: result = null, isLoading, isError } = useColorEditionFinderQuery(category, productId);
  const fire = useFireAndForget({ type: 'cef', category, productId });
  const cefRunUrl = `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const deleteRunMut = useDeleteColorEditionFinderRunMutation(category, productId);
  const deleteAllMut = useDeleteColorEditionFinderAllMutation(category, productId);
  const deleteAllVariantsMut = useDeleteAllVariantsMutation(category, productId);
  const deleteVariantMut = useDeleteVariantMutation(category, productId);
  const { model: resolvedModel, accessMode: resolvedAccessMode, modelDisplay, effortLevel } = useResolvedFinderModel('colorFinder');

  const { data: colorRegistry = [] } = useQuery<ColorRegistryEntry[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorRegistryEntry[]>('/colors'),
  });

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [cefRunExpand, toggleCefRunExpand] = usePersistedExpandMap(`indexing:cef:runExpand:${productId}`);

  const isAnyDeletePending = deleteRunMut.isPending || deleteAllMut.isPending || deleteVariantMut.isPending || deleteAllVariantsMut.isPending;

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const dismiss = () => setDeleteTarget(null);
    switch (deleteTarget.kind) {
      case 'run':
        if (deleteTarget.runNumber) deleteRunMut.mutate(deleteTarget.runNumber, { onSuccess: dismiss });
        break;
      case 'variant':
        if (deleteTarget.variantId) deleteVariantMut.mutate(deleteTarget.variantId, { onSuccess: dismiss });
        break;
      case 'variant-all':
        deleteAllVariantsMut.mutate(undefined, { onSuccess: dismiss });
        break;
      default:
        deleteAllMut.mutate(undefined, { onSuccess: dismiss });
    }
  }, [deleteTarget, deleteRunMut, deleteAllMut, deleteVariantMut, deleteAllVariantsMut]);

  const isRunningCef = useIsModuleRunning('cef', productId);

  if (!productId || !category) return null;

  const effectiveResult = isError ? null : result;
  const statusChip = deriveFinderStatusChip(effectiveResult);
  const kpiCards = deriveFinderKpiCards(effectiveResult);
  const publishedColors = Array.isArray(published.colors?.value) ? published.colors.value : [];
  const publishedEditions = Array.isArray(published.editions?.value) ? published.editions.value : [];
  const selectedState = deriveSelectedStateDisplay(effectiveResult, colorRegistry, { colors: publishedColors, editions: publishedEditions });
  const runHistoryRows = deriveRunHistoryRows(effectiveResult);
  const cefPag = usePagination({ totalItems: runHistoryRows.length, storageKey: 'finder-page-size:cef-history' });
  const visibleCefRows = runHistoryRows.slice(cefPag.startIndex, cefPag.endIndex);

  const badgeProps = {
    accessMode: resolvedAccessMode,
    role: (resolvedModel?.useReasoning ? 'reasoning' : 'primary') as 'reasoning' | 'primary',
    thinking: resolvedModel?.thinking ?? false,
    webSearch: resolvedModel?.webSearch ?? false,
  };

  return (
    <div className="sf-surface-panel p-0 flex flex-col">
      {/* Header */}
      <FinderPanelHeader
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        title="Color & Edition Finder"
        tip="Discovers color variants and edition slugs for this product via LLM analysis."
        isRunning={isRunningCef}
        onRun={() => fire(cefRunUrl, {})}
      >
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-[0.04em] sf-chip-purple border-[1.5px] border-current">
          <ModelBadgeGroup {...badgeProps} />
          {modelDisplay}
          {effortLevel && <span className="sf-text-muted font-normal">{effortLevel}</span>}
        </span>
      </FinderPanelHeader>

      {/* Body */}
      {collapsed ? null : isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : !effectiveResult ? (
        <div className="text-center py-12 sf-text-muted">
          <p className="text-sm">No color or edition data yet.</p>
          <p className="sf-text-caption mt-1">Click <strong>Run Now</strong> to discover variants.</p>
        </div>
      ) : (
        <div className="px-6 pb-6 pt-4 space-y-5">
          {/* KPI Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpiCards.map(card => (
              <FinderKpiCard key={card.label} value={card.value} label={card.label} tone={card.tone} />
            ))}
          </div>

          {/* How It Works — collapsed by default */}
          <FinderHowItWorks
            storeKey={`cef:${productId}`}
            subtitle="Color & edition discovery"
            sections={cefHowItWorksSections}
          />

          {/* Selected State */}
          <SelectedStateCard
            display={selectedState}
            onDeleteVariant={(variantId, variantLabel) => setDeleteTarget({ kind: 'variant', variantId, label: variantLabel })}
            deleteVariantPending={deleteVariantMut.isPending}
            onDeleteAllVariants={(count) => setDeleteTarget({ kind: 'variant-all', count })}
            deleteAllVariantsPending={deleteAllVariantsMut.isPending}
          />

          {/* Run History — collapsible, default closed */}
          {runHistoryRows.length > 0 && (
            <FinderSectionCard
              title="Run History"
              count={`${runHistoryRows.length} run${runHistoryRows.length !== 1 ? 's' : ''}`}
              storeKey={`cef:history:${productId}`}
              trailing={
                <div className="flex items-center gap-2">
                  <PagerSizeSelector pageSize={cefPag.pageSize} onPageSizeChange={cefPag.setPageSize} />
                  <button
                    onClick={() => setDeleteTarget({ kind: 'all', count: runHistoryRows.length })}
                    disabled={isAnyDeletePending}
                    className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Delete All
                  </button>
                </div>
              }
            >
              <div className="space-y-1.5">
                {visibleCefRows.map((row) => (
                  <CefRunHistoryRow
                    key={row.runNumber}
                    row={row}
                    colorRegistry={colorRegistry}
                    onDelete={(rn) => setDeleteTarget({ kind: 'run', runNumber: rn })}
                    expanded={!!cefRunExpand[String(row.runNumber)]}
                    onToggle={() => toggleCefRunExpand(String(row.runNumber))}
                  />
                ))}
              </div>
              <PagerNavFooter page={cefPag.page} totalPages={cefPag.totalPages} showingLabel={cefPag.showingLabel} onPageChange={cefPag.setPage} />
            </FinderSectionCard>
          )}

          {/* Footer */}
          <FinderPanelFooter
            lastRanAt={effectiveResult?.last_ran_at}
            runCount={effectiveResult?.run_count ?? 0}
            modelSlot={
              <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold sf-text-subtle">
                <ModelBadgeGroup {...badgeProps} />
                {modelDisplay}
                {effortLevel && <span className="sf-text-muted font-normal">{effortLevel}</span>}
              </span>
            }
          >
          </FinderPanelFooter>
        </div>
      )}

      {deleteTarget && (
        <FinderDeleteConfirmModal
          target={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isPending={isAnyDeletePending}
          moduleLabel="CEF"
          descriptionOverrides={{
            run: `This will delete discovery source (run #${deleteTarget.runNumber ?? ''}). Deletes all candidates (evidence) in all fields. Touches CEF table & JSON and field_candidates table & JSON.`,
            loop: `This will delete all runs in this loop. Deletes all candidates (evidence) in all fields. Touches CEF table & JSON and field_candidates table & JSON.`,
            all: `This will delete all ${deleteTarget.count ?? 0} run(s) and all discovery sources. Deletes all candidates (evidence) in all fields. Touches CEF table & JSON and field_candidates table & JSON.`,
          }}
        />
      )}
    </div>
  );
}
