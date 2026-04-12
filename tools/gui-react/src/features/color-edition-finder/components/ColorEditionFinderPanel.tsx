import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { PubMark, PubLegend } from '../../../shared/ui/feedback/PubMark.tsx';
import {
  FinderPanelHeader,
  FinderKpiCard,
  FinderCooldownStrip,
  FinderPanelFooter,
  FinderDeleteConfirmModal,
  DiscoverySummaryBar,
  FinderRunPromptDetails,
  FinderRunTimestamp,
  FinderSectionCard,
  useResolvedFinderModel,
  deriveCooldownState,
  deriveFinderStatusChip,
} from '../../../shared/ui/finder/index.ts';
import type { DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { usePublishedFields } from '../../../hooks/usePublishedFields.ts';
import {
  useColorEditionFinderQuery,
  useDeleteColorEditionFinderRunMutation,
  useDeleteColorEditionFinderAllMutation,
} from '../api/colorEditionFinderQueries.ts';
import {
  deriveFinderKpiCards,
  deriveSelectedStateDisplay,
  deriveRunHistoryRows,
} from '../selectors/colorEditionFinderSelectors.ts';
import type { RunHistoryRow, RunDiscoveryLog, ColorPill } from '../selectors/colorEditionFinderSelectors.ts';
import type { ColorRegistryEntry } from '../types.ts';
import { useOperationsStore } from '../../../stores/operationsStore.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';

/* ── Color circle (mirrors site's getCircleStyle gradient logic) ──── */

function colorCircleStyle(hexParts: readonly string[]): React.CSSProperties {
  const colors = hexParts.filter(Boolean);
  if (colors.length === 0) return { backgroundColor: 'var(--sf-text-muted)' };
  if (colors.length === 1) return { backgroundColor: colors[0] };
  if (colors.length === 2) {
    return { background: `linear-gradient(45deg, ${colors[0]} 50%, ${colors[1]} 50%)` };
  }
  const angle = 360 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * angle}deg ${(i + 1) * angle}deg`);
  const from = colors.length === 3 ? 240 : (270 - angle / 2);
  return { background: `conic-gradient(from ${from}deg, ${stops.join(', ')})` };
}

function ColorSwatch({ hexParts, size = 'md' }: { readonly hexParts: readonly string[]; readonly size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <span
      className={`inline-block ${sizeClass} rounded-sm border sf-border-soft shadow-[0_0_0_0.5px_rgba(0,0,0,0.15)] shrink-0`}
      style={colorCircleStyle(hexParts)}
    />
  );
}

/* ── CEF-specific sub-components ──────────────────────────────────── */

function ColorPillInline({ pill }: { readonly pill: ColorPill }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-1 sf-surface-panel border sf-border-soft rounded-md text-[11px] font-semibold sf-text-primary">
      <ColorSwatch hexParts={pill.hexParts} />
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

function SelectedStateCard({ display, isPublished }: {
  readonly display: ReturnType<typeof deriveSelectedStateDisplay>;
  readonly isPublished: (fieldKey: string) => boolean;
}) {
  if (display.colors.length === 0 && display.editions.length === 0) return null;

  return (
    <div className="sf-surface-elevated border sf-border-soft rounded-lg p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] sf-text-muted">
          Selected State
        </span>
        <div className="flex items-center gap-3">
          <PubLegend />
          {display.ssotRunNumber > 0 && (
            <Chip label={`SSOT \u00B7 Run #${display.ssotRunNumber}`} className="sf-chip-teal-strong" />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Colors */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-2 inline-flex items-center gap-1.5">
            Colors ({display.colors.length})
            <PubMark published={isPublished('colors')} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {display.colors.map(pill => (
              <ColorPillInline key={pill.name} pill={pill} />
            ))}
          </div>
        </div>

        {/* Editions with paired colors */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-2 inline-flex items-center gap-1.5">
            Editions ({display.editions.length})
            <PubMark published={isPublished('editions')} />
          </div>
          {display.editions.length === 0 ? (
            <span className="text-[11px] sf-text-muted">None</span>
          ) : (
            <div className="flex flex-col gap-2">
              {display.editions.map(ed => (
                <div key={ed.slug} className="sf-surface-panel border sf-border-soft rounded-md px-3 py-2">
                  <div className="mb-1.5 inline-flex items-center gap-1.5">
                    {ed.displayName && (
                      <span className="text-[12px] font-semibold sf-text-primary">{ed.displayName}</span>
                    )}
                    <span className="text-[12px] font-mono font-bold sf-chip-purple inline-block px-1.5 py-0.5 rounded">
                      {ed.slug}
                    </span>
                    {ed.sourceCount > 0 && (
                      <span className="px-1 py-0.5 rounded text-[9px] font-bold sf-text-muted sf-surface-soft">
                        {ed.sourceCount}x
                      </span>
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

function DiscoveryDetailsSection({ log, siblingsExcluded }: { readonly log: RunDiscoveryLog; readonly siblingsExcluded: readonly string[] }) {
  const hasAny = log.confirmedCount > 0 || log.addedNewCount > 0 || log.rejectedCount > 0
    || log.urlsCheckedCount > 0 || log.queriesRunCount > 0 || siblingsExcluded.length > 0;
  if (!hasAny) return null;

  return (
    <details className="sf-surface-panel border sf-border-soft rounded-md">
      <summary className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle">
        Discovery Details
      </summary>
      <div className="px-3 pb-3 flex flex-col gap-2.5">
        {siblingsExcluded.length > 0 && (
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Siblings Excluded</div>
            <div className="flex flex-wrap gap-1">
              {siblingsExcluded.map(s => (
                <Chip key={s} label={s} className="sf-chip-danger" />
              ))}
            </div>
          </div>
        )}
        {log.confirmedCount > 0 && (
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Confirmed from Known</div>
            <div className="flex flex-wrap gap-1">
              {log.confirmedFromKnown.map(c => (
                <Chip key={c} label={c} className="sf-chip-success" />
              ))}
            </div>
          </div>
        )}
        {log.addedNewCount > 0 && (
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Added New</div>
            <div className="flex flex-wrap gap-1">
              {log.addedNew.map(c => (
                <Chip key={c} label={c} className="sf-chip-accent" />
              ))}
            </div>
          </div>
        )}
        {log.rejectedCount > 0 && (
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Rejected from Known</div>
            <div className="flex flex-wrap gap-1">
              {log.rejectedFromKnown.map(c => (
                <Chip key={c} label={c} className="sf-chip-danger" />
              ))}
            </div>
          </div>
        )}
        {log.urlsCheckedCount > 0 && (
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">URLs Checked ({log.urlsCheckedCount})</div>
            <div className="flex flex-col gap-0.5">
              {log.urlsChecked.map(url => (
                <span key={url} className="text-[10px] font-mono sf-text-subtle truncate max-w-full" title={url}>
                  {url}
                </span>
              ))}
            </div>
          </div>
        )}
        {log.queriesRunCount > 0 && (
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-1">Queries Run ({log.queriesRunCount})</div>
            <div className="flex flex-col gap-0.5">
              {log.queriesRun.map(q => (
                <span key={q} className="text-[10px] font-mono sf-text-subtle">
                  {q}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

/* ── Run History Row ─────────────────────────────────────────────── */

function CefRunHistoryRow({
  row,
  colorRegistry,
  onDelete,
}: {
  readonly row: RunHistoryRow;
  readonly colorRegistry: ColorRegistryEntry[];
  readonly onDelete: (runNumber: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hexMap = useMemo(() => new Map(colorRegistry.map(c => [c.name, c.hex])), [colorRegistry]);
  const selColors = row.selected?.colors ?? [];
  const selEditions = row.selected?.editions ?? {};

  return (
    <div className={`sf-surface-panel rounded-lg overflow-hidden${row.isLatest ? ' border-l-2 border-[var(--sf-token-accent-strong)]' : ''}`}>
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:opacity-80"
      >
        <span className="text-[10px] sf-text-muted shrink-0" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          {'\u25B6'}
        </span>
        <span className="text-[13px] font-mono font-bold text-[var(--sf-token-accent-strong)]">
          #{row.runNumber}
        </span>
        <span className="font-mono text-[10px] sf-text-muted">{row.ranAt?.split('T')[0] ?? ''}</span>
        <FinderRunTimestamp startedAt={row.startedAt} durationMs={row.durationMs} />
        {row.model && <Chip label={row.model} className="sf-chip-neutral" />}
        {row.fallbackUsed && <Chip label="Fallback" className="sf-chip-warning" />}
        <Chip label={`${row.colorCount} colors`} className="sf-chip-accent" />
        <Chip label={`${row.editionCount} editions`} className="sf-chip-purple" />
        <div className="flex-1" />
        {row.validationStatus === 'rejected' ? (
          <Chip label="Rejected" className="sf-chip-danger" />
        ) : (
          <Chip label="Valid" className="sf-chip-success" />
        )}
        {row.isLatest && <Chip label={`LATEST \u00B7 SSOT`} className="sf-chip-teal-strong" />}
        {row.rejectionSummary && (
          <span className="text-[9px] font-mono sf-text-muted truncate max-w-[180px]" title={row.rejectionSummary}>
            {row.rejectionSummary}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(row.runNumber); }}
          className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded sf-status-text-danger border sf-border-soft opacity-50 hover:opacity-100"
        >
          Del
        </button>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t sf-border-soft flex flex-col gap-3">
          {/* Selected output summary */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-1.5">Selected Output</div>
            <div className="flex flex-wrap gap-1 mb-1">
              {selColors.map(name => {
                const parts = name.split('+').map(a => hexMap.get(a.trim()) || '');
                return (
                  <span key={name} className="inline-flex items-center gap-1 px-1.5 py-0.5 sf-surface-panel rounded text-[10px] font-mono sf-text-primary">
                    <ColorSwatch hexParts={parts} size="sm" />
                    {name}
                  </span>
                );
              })}
            </div>
            {Object.keys(selEditions).length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {Object.keys(selEditions).map(slug => (
                  <span key={slug} className="text-[10px] font-mono font-semibold sf-chip-purple px-1.5 py-0.5 rounded">
                    {slug}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Discovery summary + details */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-1.5">Discovery Summary</div>
            <DiscoverySummaryBar log={row.discoveryLog} />
          </div>

          <DiscoveryDetailsSection log={row.discoveryLog} siblingsExcluded={row.siblingsExcluded} />

          {/* System prompt, user message, LLM response */}
          <FinderRunPromptDetails
            systemPrompt={row.systemPrompt}
            userMessage={row.userMessage}
            response={row.responseJson}
          />
        </div>
      )}
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
  const { isPublished } = usePublishedFields(category, productId);

  const { data: result = null, isLoading, isError } = useColorEditionFinderQuery(category, productId);
  const fire = useFireAndForget({ type: 'cef', category, productId });
  const cefRunUrl = `/color-edition-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`;
  const deleteRunMut = useDeleteColorEditionFinderRunMutation(category, productId);
  const deleteAllMut = useDeleteColorEditionFinderAllMutation(category, productId);
  const { model: resolvedModel, accessMode: resolvedAccessMode, modelDisplay } = useResolvedFinderModel('colorFinder');

  const { data: colorRegistry = [] } = useQuery<ColorRegistryEntry[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorRegistryEntry[]>('/colors'),
  });

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const isAnyDeletePending = deleteRunMut.isPending || deleteAllMut.isPending;

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'run' && deleteTarget.runNumber) {
      deleteRunMut.mutate(deleteTarget.runNumber, {
        onSuccess: () => setDeleteTarget(null),
      });
    } else {
      deleteAllMut.mutate(undefined, {
        onSuccess: () => setDeleteTarget(null),
      });
    }
  }, [deleteTarget, deleteRunMut, deleteAllMut]);

  const ops = useOperationsStore((s) => s.operations);
  const isRunningCef = useMemo(
    () => [...ops.values()].some((o) => o.type === 'cef' && o.productId === productId && o.status === 'running'),
    [ops, productId],
  );

  if (!productId || !category) return null;

  const effectiveResult = isError ? null : result;
  const statusChip = deriveFinderStatusChip(effectiveResult);
  const kpiCards = deriveFinderKpiCards(effectiveResult);
  const cooldown = deriveCooldownState(effectiveResult);
  const selectedState = deriveSelectedStateDisplay(effectiveResult, colorRegistry);
  const runHistoryRows = deriveRunHistoryRows(effectiveResult);

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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {kpiCards.map(card => (
              <FinderKpiCard key={card.label} value={card.value} label={card.label} tone={card.tone} />
            ))}
          </div>

          {/* Cooldown Strip */}
          {effectiveResult.run_count > 0 && <FinderCooldownStrip cooldown={cooldown} />}

          {/* Selected State */}
          <SelectedStateCard display={selectedState} isPublished={isPublished} />

          {/* Run History — collapsible, default closed */}
          {runHistoryRows.length > 0 && (
            <FinderSectionCard
              title="Run History"
              count={`${runHistoryRows.length} run${runHistoryRows.length !== 1 ? 's' : ''}`}
              storeKey={`cef:history:${productId}`}
              trailing={
                <button
                  onClick={() => setDeleteTarget({ kind: 'all', count: runHistoryRows.length })}
                  disabled={isAnyDeletePending}
                  className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Delete All
                </button>
              }
            >
              <div className="space-y-1.5">
                {runHistoryRows.map((row) => (
                  <CefRunHistoryRow
                    key={row.runNumber}
                    row={row}
                    colorRegistry={colorRegistry}
                    onDelete={(rn) => setDeleteTarget({ kind: 'run', runNumber: rn })}
                  />
                ))}
              </div>
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
              </span>
            }
          >
            {selectedState.ssotRunNumber > 0 && (
              <>
                <span>&middot;</span>
                <span>SSOT source: <strong className="sf-text-subtle">Run #{selectedState.ssotRunNumber}</strong></span>
              </>
            )}
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
        />
      )}
    </div>
  );
}
