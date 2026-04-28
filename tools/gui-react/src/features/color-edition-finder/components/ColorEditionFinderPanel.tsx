import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { PubMark, PubLegend } from '../../../shared/ui/feedback/PubMark.tsx';
import {
  IndexingPanelHeader,
  PromptPreviewTriggerButton,
  PromptDrawerChevron,
  FinderKpiCard,
  FinderPanelFooter,
  FinderEditablePhaseModelBadge,
  FinderDeleteConfirmModal,
  FinderSectionCard,
  FinderHowItWorks,
  DiscoveryHistoryButton,
  PromptPreviewModal,
  useResolvedFinderModel,
  ColorSwatch,
  usePagination,
  PagerSizeSelector,
  PagerNavFooter,
  getIndexingPanelCollapsedDefault,
  FinderContentLoadingSkeleton,
} from '../../../shared/ui/finder/index.ts';
import { HeaderActionButton, RowActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { usePromptPreviewQuery } from '../../indexing/api/promptPreviewQueries.ts';
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
      {pill.sources.length > 0 && (
        <span className="px-1 py-0.5 rounded text-[9px] font-bold sf-text-muted sf-surface-soft">
          {pill.sources.length} src
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
            <RowActionButton
              intent="delete"
              label="Delete All"
              onClick={() => onDeleteAllVariants(variantCount)}
              disabled={deleteAllVariantsPending || deleteVariantPending}
            />
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
              <span key={pill.variantId ?? pill.name} className="inline-flex items-center gap-1.5 px-2 py-1 sf-surface-panel border sf-border-soft rounded-md text-[11px] font-semibold sf-text-primary">
                <ColorSwatch hexParts={pill.hexParts} size="md" />
                <span className="sf-text-muted">—</span>
                <span className="font-mono sf-text-primary">{pill.name}</span>
                {pill.displayName && (
                  <>
                    <span className="sf-text-muted">·</span>
                    <span className="font-normal sf-text-muted">{pill.displayName}</span>
                  </>
                )}
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
                    {ed.sources.length > 0 && (
                      <span className="px-1 py-0.5 rounded text-[9px] font-bold sf-text-muted sf-surface-soft" title="evidence sources">
                        {ed.sources.length} src
                      </span>
                    )}
                    {ed.confidenceMax != null && (
                      <span className="px-1 py-0.5 rounded text-[9px] font-bold sf-text-muted sf-surface-soft" title="max per-source confidence">
                        {ed.confidenceMax}%
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
  const [collapsed, toggleCollapsed] = usePersistedToggle(
    `indexing:cef:collapsed:${productId}`,
    getIndexingPanelCollapsedDefault('cef'),
  );
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
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const promptPreviewQuery = usePromptPreviewQuery('cef', category, productId, {}, promptModalOpen);
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

  const effectiveResult = isError ? null : result;
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
    <div className="sf-surface-panel p-0 flex flex-col" data-panel="cef">
      {/* Header */}
      <IndexingPanelHeader
        panel="cef"
        icon="◈"
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        title="Color & Edition Finder"
        tip="Discovers color variants and edition slugs for this product via LLM analysis."
        isRunning={isRunningCef}
        modelStrip={<FinderEditablePhaseModelBadge phaseId="colorFinder" labelPrefix="CEF" title="CEF - Color & Edition Finder" />}
        defaultButtonWidth={ACTION_BUTTON_WIDTH.standardHeader}
        actionSlot={
          <>
            <HeaderActionButton
              intent="locked"
              label="Run"
              onClick={() => fire(cefRunUrl, {})}
              disabled={isRunningCef}
              width={ACTION_BUTTON_WIDTH.standardHeader}
            />
            <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
            <PromptDrawerChevron
              storageKey={`indexing:cef:panel-drawer:${productId}`}
              openWidthClass="w-[40rem]"
              drawerHeight="header"
              ariaLabel="Prompt + history + delete actions for CEF"
              closedTitle="Show Prompt / Hist / Data for CEF"
              openedTitle="Hide Prompt / Hist / Data for CEF"
              openTitle="Prompts:"
              primaryCustom={
                <PromptPreviewTriggerButton
                  onClick={() => setPromptModalOpen(true)}
                  disabled={!productId}
                  width={ACTION_BUTTON_WIDTH.standardHeader}
                />
              }
              secondaryTitle="Hist:"
              secondaryLabelClass="sf-history-label"
              secondaryCustom={
                <DiscoveryHistoryButton
                  finderId="colorEditionFinder"
                  productId={productId}
                  category={category}
                  width={ACTION_BUTTON_WIDTH.standardHeader}
                />
              }
              tertiaryTitle="Data:"
              tertiaryLabelClass="sf-delete-label"
              tertiaryActions={[
                {
                  id: 'del-all',
                  label: 'Delete All',
                  onClick: () => setDeleteTarget({ kind: 'all', count: runHistoryRows.length }),
                  disabled: isAnyDeletePending,
                  intent: isAnyDeletePending ? 'locked' : 'delete',
                  width: ACTION_BUTTON_WIDTH.standardHeader,
                  title: 'Permanently wipe ALL CEF data for this product (runs, URL/query history, candidates, published colors/editions, every variant, plus all variant-scoped downstream artifacts: PIF images/runs/evals/carousel and RDF/SKU per-variant entries). Cannot be undone.',
                },
              ]}
            />
          </>
        }
      />

      {/* Body */}
      {collapsed ? null : isLoading ? (
        <FinderContentLoadingSkeleton />
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
                  <RowActionButton
                    intent="delete"
                    label="Delete All"
                    onClick={() => setDeleteTarget({ kind: 'all', count: runHistoryRows.length })}
                    disabled={isAnyDeletePending}
                  />
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
            // WHY: Server-side onAfterDeleteAll cascade now invokes
            // deleteAllVariants alongside the runs cleanup. That cascade
            // wipes every variant + everything downstream — PIF
            // images/runs/evals/carousel and every variantFieldProducer
            // (RDF/SKU per-variant entries). Description must reflect
            // the full blast radius so users aren't surprised.
            all: `This will permanently wipe everything for this product\u2019s CEF data: all ${deleteTarget.count ?? 0} run(s) and discovery history (URLs + queries), every CEF candidate, every published color/edition, every variant in the registry, plus every variant-scoped artifact downstream — PIF images/runs/evals/carousel and all RDF/SKU per-variant entries. This cannot be undone.`,
          }}
        />
      )}

      <PromptPreviewModal
        open={promptModalOpen}
        onClose={() => setPromptModalOpen(false)}
        query={promptPreviewQuery}
        title="Color & Edition Finder — Compiled Prompt"
        subtitle={productId ? `product: ${productId}` : undefined}
        storageKeyPrefix={`indexing:cef:preview:${productId}`}
      />
    </div>
  );
}
