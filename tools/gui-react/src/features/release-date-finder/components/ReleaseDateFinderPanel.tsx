import { useState, useCallback, useMemo } from 'react';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import {
  FinderPanelHeader,
  FinderKpiCard,
  FinderPanelFooter,
  FinderRunModelBadge,
  FinderDeleteConfirmModal,
  FinderSectionCard,
  FinderHowItWorks,
  FinderVariantRow,
  FinderRunHistoryRow,
  FinderDiscoveryDetails,
  FinderRunPromptDetails,
  ColorSwatch,
  DiscoveryHistoryButton,
  useResolvedFinderModel,
  useFinderColorHexMap,
  resolveVariantColorAtoms,
  buildFinderVariantRows,
  buildEditionsMap,
} from '../../../shared/ui/finder/index.ts';
import type { DeleteTarget, DiscoverySection } from '../../../shared/ui/finder/index.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { usePersistedExpandMap } from '../../../stores/tabStore.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import { useIsModuleRunning, useRunningVariantKeys } from '../../operations/hooks/useFinderOperations.ts';
import { useColorEditionFinderQuery } from '../../color-edition-finder/index.ts';
import {
  useReleaseDateFinderQuery,
  useDeleteReleaseDateFinderRunMutation,
  useDeleteReleaseDateFinderAllMutation,
} from '../api/releaseDateFinderQueries.ts';
import { deriveFinderKpiCards, deriveVariantRows, sortRunsNewestFirst } from '../selectors/rdfSelectors.ts';
import { rdfHowItWorksSections } from '../rdfHowItWorksContent.ts';
import type { EvidenceSource } from '../types.ts';

interface ReleaseDateFinderPanelProps {
  readonly productId: string;
  readonly category: string;
}

function tierTone(tier: EvidenceSource['tier']): string {
  if (tier === 'tier1') return 'sf-chip-success';
  if (tier === 'tier2') return 'sf-chip-info';
  if (tier === 'tier3') return 'sf-chip-warning';
  return 'sf-chip-neutral';
}

function EvidenceRow({ source }: { readonly source: EvidenceSource }) {
  return (
    <div className="sf-surface-panel border sf-border-soft rounded-md p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`${tierTone(source.tier)} text-[9px] font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded`}>
          {source.tier}
        </span>
        <span className="text-[10px] font-semibold sf-text-muted uppercase tracking-[0.04em]">
          {source.source_type}
        </span>
        {source.source_url && (
          <a
            href={source.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-mono sf-text-accent hover:underline truncate max-w-full"
          >
            {source.source_url}
          </a>
        )}
      </div>
      {source.excerpt && (
        <div className="text-[11px] sf-text-primary italic leading-snug">
          &ldquo;{source.excerpt}&rdquo;
        </div>
      )}
    </div>
  );
}

export function ReleaseDateFinderPanel({ productId, category }: ReleaseDateFinderPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:rdf:collapsed:${productId}`, true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [variantExpand, toggleVariantExpand] = usePersistedExpandMap(`indexing:rdf:variantExpand:${productId}`);
  const [runExpand, toggleRunExpand] = usePersistedExpandMap(`indexing:rdf:runExpand:${productId}`);

  const { data: cefData } = useColorEditionFinderQuery(category, productId);
  const { data: result = null, isLoading, isError } = useReleaseDateFinderQuery(category, productId);

  const hexMap = useFinderColorHexMap();
  const editions = useMemo(() => buildEditionsMap(cefData), [cefData]);
  const cefVariants = useMemo(() => buildFinderVariantRows(cefData), [cefData]);

  const fire = useFireAndForget({ type: 'rdf', category, productId });
  const runAllUrl = `/release-date-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const loopUrl = `${runAllUrl}/loop`;

  const deleteRunMut = useDeleteReleaseDateFinderRunMutation(category, productId);
  const deleteAllMut = useDeleteReleaseDateFinderAllMutation(category, productId);

  const { model: resolvedModel, accessMode, modelDisplay, effortLevel } = useResolvedFinderModel('releaseDateFinder');

  const isRunningModule = useIsModuleRunning('rdf', productId);
  const loopingVariantKeys = useRunningVariantKeys('rdf', productId, 'loop');

  const effectiveResult = isError ? null : result;
  const kpiCards = useMemo(
    () => deriveFinderKpiCards(effectiveResult, cefVariants.length),
    [effectiveResult, cefVariants.length],
  );
  const variantRows = useMemo(
    () => deriveVariantRows(cefVariants, effectiveResult),
    [cefVariants, effectiveResult],
  );
  const runHistoryRuns = useMemo(() => sortRunsNewestFirst(effectiveResult), [effectiveResult]);

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
  const withDateCount = variantRows.filter((r) => r.candidate?.value).length;

  return (
    <div className="sf-surface-panel p-0 flex flex-col">
      <FinderPanelHeader
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        title="Release Date Finder"
        tip="Discovers per-variant first-availability release dates via web search. Candidates flow through the publisher gate."
        isRunning={isRunningModule}
        onRun={handleRunAll}
        historyActionSlot={<DiscoveryHistoryButton finderId="releaseDateFinder" productId={productId} category={category} />}
        actionSlot={
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); handleRunAll(); }}
              disabled={cefVariants.length === 0}
              className="w-28 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed text-center"
            >
              Run
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleLoopAll(); }}
              disabled={cefVariants.length === 0 || (variantRows.length > 0 && variantRows.every((r) => loopingVariantKeys.has(r.variant_key)))}
              className="w-28 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed text-center"
            >
              Loop
            </button>
          </div>
        }
      >
        <FinderRunModelBadge
          labelPrefix="RDF"
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
            Run the <strong>Color & Edition Finder</strong> first — RDF needs the variant registry to iterate.
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
            storeKey={`rdf:${productId}`}
            subtitle="Per-variant release date discovery, evidence & publish"
            sections={rdfHowItWorksSections}
          />

          <FinderSectionCard
            title="All Release Dates"
            count={`${withDateCount} across ${variantRows.length} variant${variantRows.length !== 1 ? 's' : ''}`}
            storeKey={`rdf:variants:${productId}`}
            defaultOpen
          >
            <div className="grid grid-cols-2 gap-3">
              {variantRows.map((row) => {
                const atoms = resolveVariantColorAtoms(row.variant_key, editions);
                const hexParts = atoms.map((a) => hexMap.get(a.trim()) || '');
                const c = row.candidate;
                const isLooping = loopingVariantKeys.has(row.variant_key);
                const valueDisplay = c?.value || '';
                const hasValue = Boolean(c?.value);
                return (
                  <FinderVariantRow
                    key={row.variant_key}
                    variant={row}
                    hexParts={hexParts}
                    expandable={Boolean(c)}
                    expanded={Boolean(variantExpand[row.variant_key])}
                    onToggle={() => toggleVariantExpand(row.variant_key)}
                    trailing={
                      <>
                        {hasValue ? (
                          <Chip label={valueDisplay} className="sf-chip-success font-mono" />
                        ) : c?.unknown_reason ? (
                          <Chip label="unk" className="sf-chip-warning font-mono" />
                        ) : (
                          <span className="text-[10px] sf-text-muted italic">no date</span>
                        )}
                        {c && c.confidence > 0 && (
                          <span className="text-[9px] sf-text-muted font-mono whitespace-nowrap">
                            {c.confidence}%
                          </span>
                        )}
                        <div className="shrink-0 flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRunVariant(row.variant_key); }}
                            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-primary-button"
                          >
                            Run
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleLoopVariant(row.variant_key); }}
                            disabled={isLooping}
                            className="px-2 py-1 text-[9px] font-bold uppercase tracking-wide rounded sf-action-button disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isLooping ? '...' : 'Loop'}
                          </button>
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
                            {c.sources.map((s, i) => <EvidenceRow key={i} source={s} />)}
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
                                <span className="sf-text-primary">{pc.value}</span>
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
          </FinderSectionCard>

          {runHistoryRuns.length > 0 && (
            <FinderSectionCard
              title="Run History"
              count={`${runHistoryRuns.length} run${runHistoryRuns.length !== 1 ? 's' : ''}`}
              storeKey={`rdf:history:${productId}`}
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
                  const dateValue = resp?.release_date || '';
                  const evidenceCount = resp?.evidence?.length ?? 0;
                  const log = resp?.discovery_log;
                  const discoverySections: DiscoverySection[] = [];
                  if (log?.queries_run?.length) discoverySections.push({ title: 'Queries Run', format: 'lines', items: log.queries_run });
                  if (log?.urls_checked?.length) discoverySections.push({ title: 'URLs Checked', format: 'lines', items: log.urls_checked });
                  if (log?.notes?.length) discoverySections.push({ title: 'Notes', format: 'lines', items: log.notes });

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
                            label={dateValue || 'unk'}
                            className={dateValue ? 'sf-chip-success font-mono' : 'sf-chip-warning font-mono'}
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
                          storageKey={`rdf:discoveryLog:${run.run_number}`}
                        />
                      )}
                      <FinderRunPromptDetails
                        systemPrompt={run.prompt?.system}
                        userMessage={run.prompt?.user}
                        response={resp}
                        storageKeyPrefix={`rdf:runPrompt:${run.run_number}`}
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
          moduleLabel="RDF"
          descriptionOverrides={{
            run: `This will delete run #${deleteTarget.runNumber ?? ''}. Deletes per-variant candidate rows in field_candidates and republishes from remaining sources.`,
            all: `This will delete all ${deleteTarget.count ?? 0} run(s) and every release_date candidate from this module. Touches RDF tables & JSON and field_candidates.`,
          }}
        />
      )}
    </div>
  );
}
