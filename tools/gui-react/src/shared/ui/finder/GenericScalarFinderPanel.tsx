/**
 * GenericScalarFinderPanel — full panel scaffold for variantFieldProducer
 * (scalar) finders. RDF is the canonical consumer; future scalar finders
 * (sku, pricing, msrp, discontinued, upc) wrap this with their generated
 * hooks + HIW content.
 *
 * Wiring:
 *   - finderId → FINDER_PANELS lookup → moduleType / phase / label / routePrefix
 *     / panelTitle / panelTip / valueKey / valueLabelPlural
 *   - 3 React Query hook props (use*-prefixed so ESLint rules-of-hooks accepts them)
 *   - howItWorksSections (per-finder domain content)
 *   - optional formatValue (default identity) + renderEvidenceRow (default
 *     <FinderEvidenceRow>)
 */

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import type { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { Spinner } from '../feedback/Spinner.tsx';
import { Chip } from '../feedback/Chip.tsx';
import { FinderPanelHeader } from './FinderPanelHeader.tsx';
import { AnimatedDots } from './AnimatedDots.tsx';
import { FinderKpiCard } from './FinderKpiCard.tsx';
import { FinderPanelFooter } from './FinderPanelFooter.tsx';
import { FinderRunModelBadge } from './FinderRunModelBadge.tsx';
import { FinderDeleteConfirmModal } from './FinderDeleteConfirmModal.tsx';
import { FinderSectionCard } from './FinderSectionCard.tsx';
import { FinderHowItWorks, type HiwSection } from './FinderHowItWorks.tsx';
import { FinderVariantRow } from './FinderVariantRow.tsx';
import { FinderRunHistoryRow } from './FinderRunHistoryRow.tsx';
import { ConfidenceRing } from './ConfidenceRing.tsx';
import { FinderDiscoveryDetails, type DiscoverySection } from './FinderDiscoveryDetails.tsx';
import { FinderRunPromptDetails } from './FinderRunPromptDetails.tsx';
import { ColorSwatch } from './ColorSwatch.tsx';
import { DiscoveryHistoryButton } from './DiscoveryHistoryButton.tsx';
import { FinderEvidenceRow, type FinderEvidenceRowSource } from './FinderEvidenceRow.tsx';
import { PromptDrawerChevron } from './PromptDrawerChevron.tsx';
import { PromptPreviewModal } from './PromptPreviewModal.tsx';
import { useResolvedFinderModel } from './useResolvedFinderModel.ts';
import { useFinderColorHexMap } from './useFinderColorHexMap.ts';
import { resolveVariantColorAtoms } from './finderSelectors.ts';
import { buildFinderVariantRows, buildEditionsMap } from './variantRowHelpers.ts';
import { deriveFinderKpiCards, deriveVariantRows, sortRunsNewestFirst } from './scalarFinderSelectors.ts';
import type { DeleteTarget } from './types.ts';
import { FINDER_PANELS } from '../../../features/indexing/state/finderPanelRegistry.generated.ts';
import type { LlmOverridePhaseId } from '../../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';
import { ModelBadgeGroup } from '../../../features/llm-config/components/ModelAccessBadges.tsx';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { usePersistedExpandMap } from '../../../stores/tabStore.ts';
import { useFireAndForget } from '../../../features/operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning, useRunningVariantKeys } from '../../../features/operations/hooks/useFinderOperations.ts';
import { useColorEditionFinderQuery } from '../../../features/color-edition-finder/index.ts';
import { usePromptPreviewQuery } from '../../../features/indexing/api/promptPreviewQueries.ts';
import type { PromptPreviewFinder, PromptPreviewRequestBody } from '../../../features/indexing/api/promptPreviewTypes.ts';

// ── Generic shapes (subset of every scalar finder's editorial schema) ──

interface GenericPublisherCandidate {
  readonly candidate_id: number;
  readonly status: string;
  readonly value: string;
  readonly confidence: number;
  readonly model: string;
}

interface GenericRejectionReason {
  readonly reason_code: string;
}

export interface GenericScalarCandidate {
  readonly variant_id: string | null;
  readonly variant_key: string;
  readonly variant_label: string;
  readonly variant_type: string;
  readonly value: string;
  readonly confidence: number;
  readonly unknown_reason?: string;
  readonly sources: readonly FinderEvidenceRowSource[];
  readonly ran_at: string;
  readonly rejected_by_gate?: boolean;
  readonly rejection_reasons?: readonly GenericRejectionReason[];
  readonly publisher_error?: string;
  readonly publisher_candidates?: readonly GenericPublisherCandidate[];
}

export interface GenericScalarRunResponse {
  readonly variant_id?: string | null;
  readonly variant_key?: string;
  readonly variant_label?: string;
  readonly confidence?: number;
  readonly unknown_reason?: string;
  readonly evidence_refs?: readonly unknown[];
  readonly discovery_log?: {
    readonly queries_run?: readonly string[];
    readonly urls_checked?: readonly string[];
    readonly notes?: readonly string[];
  };
  readonly loop_id?: string;
  readonly started_at?: string;
  readonly duration_ms?: number;
  readonly [k: string]: unknown;
}

export interface GenericScalarRun {
  readonly run_number: number;
  readonly ran_at: string;
  readonly model: string;
  readonly fallback_used: boolean;
  readonly effort_level?: string;
  readonly access_mode?: string;
  readonly thinking?: boolean;
  readonly web_search?: boolean;
  readonly started_at?: string | null;
  readonly duration_ms?: number | null;
  readonly prompt?: { readonly system?: string; readonly user?: string };
  readonly response?: GenericScalarRunResponse;
}

export interface GenericScalarResult {
  readonly product_id?: string;
  readonly category?: string;
  readonly run_count?: number;
  readonly last_ran_at?: string;
  readonly candidates?: readonly GenericScalarCandidate[];
  readonly runs?: readonly GenericScalarRun[];
}

// ── Props ──

export interface GenericScalarFinderPanelProps<
  TResult extends GenericScalarResult = GenericScalarResult,
> {
  readonly productId: string;
  readonly category: string;
  readonly finderId: string;
  // use*-prefixed so ESLint rules-of-hooks recognizes the props as hooks.
  readonly useQuery: (category: string, productId: string) => UseQueryResult<TResult | null>;
  readonly useDeleteRunMutation: (category: string, productId: string) => UseMutationResult<unknown, Error, number>;
  readonly useDeleteAllMutation: (category: string, productId: string) => UseMutationResult<unknown, Error, void>;
  readonly howItWorksSections: HiwSection[];
  readonly formatValue?: (value: string) => string;
  readonly renderEvidenceRow?: (source: FinderEvidenceRowSource, index: number) => ReactNode;
  /** When set, mounts a per-variant prompt-preview chevron drawer with Run/Loop
   *  actions and renders a single panel-level PromptPreviewModal. */
  readonly previewFinder?: PromptPreviewFinder;
}

type ScalarPromptModalState = {
  readonly variantKey: string;
  readonly variantLabel: string;
  readonly mode: 'run' | 'loop';
};

// ── Component ──

export function GenericScalarFinderPanel<TResult extends GenericScalarResult>({
  productId,
  category,
  finderId,
  useQuery,
  useDeleteRunMutation,
  useDeleteAllMutation,
  howItWorksSections,
  formatValue,
  renderEvidenceRow,
  previewFinder,
}: GenericScalarFinderPanelProps<TResult>) {
  const panelMeta = FINDER_PANELS.find((p) => p.id === finderId);
  if (!panelMeta) {
    throw new Error(`GenericScalarFinderPanel: finderId '${finderId}' not found in FINDER_PANELS registry`);
  }
  const moduleType = (panelMeta as { moduleType?: string }).moduleType ?? finderId;
  const moduleLabel = panelMeta.label;
  const phase = (panelMeta as { phase?: string }).phase ?? finderId;
  const routePrefix = panelMeta.routePrefix;
  const panelTitle = (panelMeta as { panelTitle?: string }).panelTitle ?? moduleLabel;
  const panelTip = (panelMeta as { panelTip?: string }).panelTip ?? '';
  const valueKey = (panelMeta as { valueKey?: string }).valueKey ?? 'value';
  const valueLabelPlural = (panelMeta as { valueLabelPlural?: string }).valueLabelPlural ?? 'Values';

  const fmt = formatValue ?? ((v: string) => v);
  const renderEv = renderEvidenceRow ?? ((source: FinderEvidenceRowSource, i: number) => <FinderEvidenceRow key={i} source={source} />);

  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:${moduleType}:collapsed:${productId}`, true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [variantExpand, toggleVariantExpand] = usePersistedExpandMap(`indexing:${moduleType}:variantExpand:${productId}`);
  const [runExpand, toggleRunExpand] = usePersistedExpandMap(`indexing:${moduleType}:runExpand:${productId}`);
  const [activePromptModal, setActivePromptModal] = useState<ScalarPromptModalState | null>(null);

  const promptPreviewBody: PromptPreviewRequestBody = useMemo(() => (
    activePromptModal
      ? { variant_key: activePromptModal.variantKey, mode: activePromptModal.mode }
      : {}
  ), [activePromptModal]);
  const promptPreviewQuery = usePromptPreviewQuery(
    previewFinder ?? 'rdf',
    category,
    productId,
    promptPreviewBody,
    Boolean(previewFinder) && Boolean(activePromptModal),
  );

  const { data: cefData } = useColorEditionFinderQuery(category, productId);
  const { data: result = null, isLoading, isError } = useQuery(category, productId);

  const hexMap = useFinderColorHexMap();
  const editions = useMemo(() => buildEditionsMap(cefData), [cefData]);
  const cefVariants = useMemo(() => buildFinderVariantRows(cefData), [cefData]);

  const fire = useFireAndForget({ type: moduleType, category, productId });
  const runAllUrl = `/${routePrefix}/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const loopUrl = `${runAllUrl}/loop`;

  const deleteRunMut = useDeleteRunMutation(category, productId);
  const deleteAllMut = useDeleteAllMutation(category, productId);

  const { model: resolvedModel, accessMode, modelDisplay, effortLevel } = useResolvedFinderModel(phase as LlmOverridePhaseId);

  const isRunningModule = useIsModuleRunning(moduleType, productId);
  const loopingVariantKeys = useRunningVariantKeys(moduleType, productId, 'loop');

  const effectiveResult = isError ? null : result;
  const kpiCards = useMemo(
    () => deriveFinderKpiCards({ result: effectiveResult, totalVariants: cefVariants.length, valueLabelPlural }),
    [effectiveResult, cefVariants.length, valueLabelPlural],
  );
  const variantRows = useMemo(
    () => deriveVariantRows<GenericScalarCandidate>(cefVariants, effectiveResult),
    [cefVariants, effectiveResult],
  );
  const runHistoryRuns = useMemo(() => sortRunsNewestFirst<GenericScalarRun>(effectiveResult), [effectiveResult]);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const dismiss = () => setDeleteTarget(null);
    if (deleteTarget.kind === 'run' && deleteTarget.runNumber) {
      deleteRunMut.mutate(deleteTarget.runNumber, { onSuccess: dismiss });
    } else if (deleteTarget.kind === 'all') {
      deleteAllMut.mutate(undefined, { onSuccess: dismiss });
    }
  }, [deleteTarget, deleteRunMut, deleteAllMut]);

  const handleRunVariant = useCallback((variantKey: string) => {
    fire(runAllUrl, { variant_key: variantKey });
  }, [fire, runAllUrl]);

  const handleRunAll = useCallback(() => {
    for (const row of variantRows) {
      fire(runAllUrl, { variant_key: row.variant_key });
    }
  }, [fire, runAllUrl, variantRows]);

  const handleLoopVariant = useCallback((variantKey: string) => {
    if (loopingVariantKeys.has(variantKey)) return;
    fire(loopUrl, { variant_key: variantKey }, { subType: 'loop', variantKey });
  }, [fire, loopUrl, loopingVariantKeys]);

  const handleLoopAll = useCallback(() => {
    for (const row of variantRows) {
      if (!loopingVariantKeys.has(row.variant_key)) {
        fire(loopUrl, { variant_key: row.variant_key }, { subType: 'loop', variantKey: row.variant_key });
      }
    }
  }, [fire, loopUrl, variantRows, loopingVariantKeys]);

  if (!productId || !category) return null;

  const badgeProps = {
    accessMode,
    role: (resolvedModel?.useReasoning ? 'reasoning' : 'primary') as 'reasoning' | 'primary',
    thinking: resolvedModel?.thinking ?? false,
    webSearch: resolvedModel?.webSearch ?? false,
  };

  const isAnyDeletePending = deleteRunMut.isPending || deleteAllMut.isPending;
  const withValueCount = variantRows.filter((r) => r.candidate?.value).length;

  return (
    <div className="sf-surface-panel p-0 flex flex-col">
      <FinderPanelHeader
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        title={panelTitle}
        tip={panelTip}
        isRunning={isRunningModule}
        onRun={handleRunAll}
        historyActionSlot={<DiscoveryHistoryButton finderId={finderId} productId={productId} category={category} />}
        actionSlot={
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); handleRunAll(); }}
              disabled={cefVariants.length === 0}
              className="w-28 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed text-center"
            >
              Run
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleLoopAll(); }}
              disabled={cefVariants.length === 0 || (variantRows.length > 0 && variantRows.every((r) => loopingVariantKeys.has(r.variant_key)))}
              className="w-28 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed text-center"
            >
              {variantRows.length > 0 && variantRows.every((r) => loopingVariantKeys.has(r.variant_key)) ? <>Loop <AnimatedDots /></> : 'Loop'}
            </button>
          </div>
        }
      >
        <FinderRunModelBadge
          labelPrefix={moduleLabel}
          model={modelDisplay}
          accessMode={accessMode}
          thinking={resolvedModel?.thinking ?? false}
          webSearch={resolvedModel?.webSearch ?? false}
          effortLevel={effortLevel}
        />
      </FinderPanelHeader>

      {collapsed ? null : isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : cefVariants.length === 0 ? (
        <div className="px-6 pb-6 pt-4">
          <div className="sf-callout sf-callout-warning px-4 py-3 rounded-lg sf-text-caption">
            Run the <strong>Color & Edition Finder</strong> first — {moduleLabel} needs the variant registry to iterate.
          </div>
        </div>
      ) : (
        <div className="px-6 pb-6 pt-4 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpiCards.map((card) => (
              <FinderKpiCard key={card.label} value={card.value} label={card.label} tone={card.tone} />
            ))}
          </div>

          <FinderHowItWorks
            storeKey={`${moduleType}:${productId}`}
            subtitle={`Per-variant ${valueLabelPlural.toLowerCase()} discovery, evidence & publish`}
            sections={howItWorksSections}
          />

          <FinderSectionCard
            title={`All ${valueLabelPlural}`}
            count={`${withValueCount} across ${variantRows.length} variant${variantRows.length !== 1 ? 's' : ''}`}
            storeKey={`${moduleType}:variants:${productId}`}
            defaultOpen
          >
            <div className="grid grid-cols-2 gap-3 items-start">
              {[0, 1].map((colIdx) => (
              <div key={colIdx} className="flex flex-col gap-3">
              {variantRows.filter((_, i) => i % 2 === colIdx).map((row) => {
                const atoms = resolveVariantColorAtoms(row.variant_key, editions);
                const hexParts = atoms.map((a) => hexMap.get(a.trim()) || '');
                const c = row.candidate;
                const isLooping = loopingVariantKeys.has(row.variant_key);
                const valueDisplay = fmt(c?.value || '');
                const hasValue = Boolean(c?.value);
                return (
                  <FinderVariantRow
                    key={row.variant_key}
                    variant={row}
                    hexParts={hexParts}
                    expandable={Boolean(c)}
                    expanded={Boolean(variantExpand[row.variant_key])}
                    onToggle={() => toggleVariantExpand(row.variant_key)}
                    secondary={
                      hasValue ? (
                        <span className="font-mono sf-text-primary">{valueDisplay}</span>
                      ) : c?.unknown_reason ? (
                        <span className="font-mono sf-status-text-warning italic">unknown</span>
                      ) : (
                        <span className="sf-text-muted italic">no value yet</span>
                      )
                    }
                    trailing={
                      <>
                        <ConfidenceRing
                          confidence={c && c.confidence > 0 ? c.confidence / 100 : null}
                        />
                        <div className="shrink-0 flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRunVariant(row.variant_key); }}
                            className="inline-flex items-center justify-center h-7 px-2 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
                          >
                            Run
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleLoopVariant(row.variant_key); }}
                            disabled={isLooping}
                            className="inline-flex items-center justify-center h-7 px-2 text-[9px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isLooping ? <>Loop <AnimatedDots /></> : 'Loop'}
                          </button>
                          {previewFinder && (
                            <>
                              <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
                              <PromptDrawerChevron
                                storageKey={`indexing:${moduleType}:prompt-drawer:${productId}:${row.variant_key}`}
                                openWidthClass="w-56"
                                ariaLabel={`Prompt previews for ${row.variant_label}`}
                                openTitle="Prompts:"
                                actions={[
                                  { label: 'Run',  onClick: () => setActivePromptModal({ variantKey: row.variant_key, variantLabel: row.variant_label, mode: 'run' }) },
                                  { label: 'Loop', onClick: () => setActivePromptModal({ variantKey: row.variant_key, variantLabel: row.variant_label, mode: 'loop' }) },
                                ]}
                              />
                            </>
                          )}
                        </div>
                      </>
                    }
                  >
                    {c && (
                      <div className="space-y-2">
                        {c.unknown_reason && (
                          <div className="text-[11px] sf-status-text-warning italic">
                            Unknown: {c.unknown_reason}
                          </div>
                        )}
                        {c.rejected_by_gate && (
                          <div className="text-[11px] sf-status-text-danger">
                            Rejected by publisher gate:
                            {(c.rejection_reasons || []).map((r, i) => (
                              <span key={i} className="ml-1 font-mono">{r.reason_code}</span>
                            ))}
                          </div>
                        )}
                        {c.publisher_error && (
                          <div className="text-[11px] sf-status-text-danger">
                            Publisher error: {c.publisher_error}
                          </div>
                        )}
                        {c.sources.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
                              Evidence ({c.sources.length})
                            </span>
                            {c.sources.map((s, i) => renderEv(s, i))}
                          </div>
                        ) : !c.unknown_reason && (
                          <div className="text-[11px] sf-text-muted italic">No evidence recorded.</div>
                        )}
                        {c.publisher_candidates && c.publisher_candidates.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted">
                              Publisher Candidates
                            </span>
                            {c.publisher_candidates.map((pc) => (
                              <div key={pc.candidate_id} className="flex items-center gap-2 text-[10px] font-mono sf-text-muted">
                                <span className={`px-1.5 py-0.5 rounded ${pc.status === 'resolved' ? 'sf-chip-success' : 'sf-chip-neutral'}`}>
                                  {pc.status}
                                </span>
                                <span className="sf-text-primary">{fmt(pc.value)}</span>
                                <span>· {pc.confidence}%</span>
                                <span className="sf-text-subtle">· {pc.model}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </FinderVariantRow>
                );
              })}
              </div>
              ))}
            </div>
          </FinderSectionCard>

          {runHistoryRuns.length > 0 && (
            <FinderSectionCard
              title="Run History"
              count={`${runHistoryRuns.length} run${runHistoryRuns.length !== 1 ? 's' : ''}`}
              storeKey={`${moduleType}:history:${productId}`}
              trailing={
                <button
                  onClick={() => setDeleteTarget({ kind: 'all', count: runHistoryRuns.length })}
                  disabled={isAnyDeletePending}
                  className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Delete All
                </button>
              }
            >
              <div className="space-y-1.5">
                {runHistoryRuns.map((run) => {
                  const expanded = Boolean(runExpand[String(run.run_number)]);
                  const resp = run.response;
                  const variantKey = resp?.variant_key ?? '';
                  const variantLabel = resp?.variant_label || variantKey || '--';
                  const atoms = resolveVariantColorAtoms(variantKey, editions);
                  const hexParts = atoms.map((a) => hexMap.get(a.trim()) || '');
                  const rawValue = resp ? (resp[valueKey] as string | undefined) : undefined;
                  const valueDisplay = fmt(rawValue || '');
                  const evidenceCount = (resp?.evidence_refs?.length) ?? 0;
                  const log = resp?.discovery_log;
                  const discoverySections: DiscoverySection[] = [];
                  if (log?.queries_run?.length) discoverySections.push({ title: 'Queries Run', format: 'lines', items: [...log.queries_run] });
                  if (log?.urls_checked?.length) discoverySections.push({ title: 'URLs Checked', format: 'lines', items: [...log.urls_checked] });
                  if (log?.notes?.length) discoverySections.push({ title: 'Notes', format: 'lines', items: [...log.notes] });

                  return (
                    <FinderRunHistoryRow
                      key={run.run_number}
                      runNumber={run.run_number}
                      ranAt={run.ran_at}
                      startedAt={run.started_at ?? resp?.started_at}
                      durationMs={run.duration_ms ?? resp?.duration_ms ?? null}
                      model={run.model}
                      accessMode={run.access_mode}
                      effortLevel={run.effort_level}
                      fallbackUsed={run.fallback_used}
                      thinking={run.thinking}
                      webSearch={run.web_search}
                      expanded={expanded}
                      onToggle={() => toggleRunExpand(String(run.run_number))}
                      onDelete={(rn) => setDeleteTarget({ kind: 'run', runNumber: rn })}
                      deleteDisabled={isAnyDeletePending}
                      leftContent={
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium sf-surface-panel border sf-border-soft">
                          <ColorSwatch hexParts={hexParts} />
                          <span className="sf-text-primary truncate max-w-[180px]">{variantLabel}</span>
                        </span>
                      }
                      rightContent={
                        <>
                          <Chip
                            label={valueDisplay || 'unk'}
                            className={valueDisplay ? 'sf-chip-success font-mono' : 'sf-chip-warning font-mono'}
                          />
                          {(resp?.confidence ?? 0) > 0 && (
                            <span className="text-[10px] font-mono sf-text-muted">{resp?.confidence}%</span>
                          )}
                          <Chip
                            label={`${evidenceCount} evidence`}
                            className={evidenceCount > 0 ? 'sf-chip-info' : 'sf-chip-neutral'}
                          />
                        </>
                      }
                    >
                      {log && discoverySections.length > 0 && (
                        <FinderDiscoveryDetails
                          title="Discovery Log"
                          sections={discoverySections}
                          storageKey={`${moduleType}:discoveryLog:${run.run_number}`}
                        />
                      )}
                      <FinderRunPromptDetails
                        systemPrompt={run.prompt?.system}
                        userMessage={run.prompt?.user}
                        response={resp}
                        storageKeyPrefix={`${moduleType}:runPrompt:${run.run_number}`}
                      />
                    </FinderRunHistoryRow>
                  );
                })}
              </div>
            </FinderSectionCard>
          )}

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
          />
        </div>
      )}

      {deleteTarget && (
        <FinderDeleteConfirmModal
          target={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isPending={isAnyDeletePending}
          moduleLabel={moduleLabel}
          descriptionOverrides={{
            run: `This will delete run #${deleteTarget.runNumber ?? ''}. Per-variant candidate rows are removed from field_candidates and the field re-publishes from remaining sources.`,
            all: `This will delete all ${deleteTarget.count ?? 0} run(s) and every candidate from this ${moduleLabel} module. Touches the ${moduleLabel} tables, JSON, and field_candidates.`,
          }}
        />
      )}

      {previewFinder && (
        <PromptPreviewModal
          open={Boolean(activePromptModal)}
          onClose={() => setActivePromptModal(null)}
          query={promptPreviewQuery}
          title={`${moduleLabel} — ${activePromptModal?.mode === 'loop' ? 'Loop (iter 1)' : 'Run'}`}
          subtitle={activePromptModal ? `variant: ${activePromptModal.variantLabel}` : undefined}
          storageKeyPrefix={`indexing:${moduleType}:preview:${productId}:${activePromptModal?.variantKey ?? ''}:${activePromptModal?.mode ?? ''}`}
        />
      )}
    </div>
  );
}
