import { useMemo, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api } from '../../../api/client.ts';
import { DataTable } from '../../../shared/ui/data-display/DataTable.tsx';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { ModelBadgeGroup } from '../../llm-config/components/ModelAccessBadges.tsx';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import { resolvePhaseModel } from '../../llm-config/state/llmPhaseOverridesBridge.generated.ts';
import type { GlobalDraftSlice } from '../../llm-config/state/llmPhaseOverridesBridge.generated.ts';
import type { LlmPhaseOverrides } from '../../llm-config/types/llmPhaseOverrideTypes.generated.ts';
import { assembleLlmPolicyFromFlat } from '../../llm-config/state/llmPolicyAdapter.generated.ts';
import { resolveProviderForModel } from '../../llm-config/state/llmProviderRegistryBridge.ts';
import type { LlmAccessMode, LlmProviderEntry } from '../../llm-config/types/llmProviderRegistryTypes.ts';
import {
  useColorEditionFinderQuery,
  useColorEditionFinderRunMutation,
  useDeleteColorEditionFinderRunMutation,
  useDeleteColorEditionFinderAllMutation,
} from '../api/colorEditionFinderQueries.ts';
import { CefDeleteConfirmModal } from './CefDeleteConfirmModal.tsx';
import {
  deriveFinderKpiCards,
  deriveCooldownState,
  deriveSelectedStateDisplay,
  deriveRunHistoryRows,
  deriveFinderStatusChip,
} from '../selectors/colorEditionFinderSelectors.ts';
import type { KpiCard, SelectedStateDisplay, RunHistoryRow, RunDiscoveryLog, ColorPill } from '../selectors/colorEditionFinderSelectors.ts';
import type { ColorRegistryEntry } from '../types.ts';
import { useOperationsStore } from '../../../stores/operationsStore.ts';

/* ── Helpers ──────────────────────────────────────────────────────── */

function toneToChipClass(tone: string): string {
  if (tone === 'success') return 'sf-chip-success';
  if (tone === 'warning') return 'sf-chip-warning';
  if (tone === 'danger') return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

function toneToValueClass(tone: string): string {
  if (tone === 'success') return 'sf-status-text-success';
  if (tone === 'warning') return 'sf-status-text-warning';
  if (tone === 'danger') return 'sf-status-text-danger';
  if (tone === 'info') return 'sf-status-text-info';
  if (tone === 'teal') return 'sf-status-text-success';
  return 'text-[var(--sf-token-accent-strong)]';
}

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

/* ── Sub-components ───────────────────────────────────────────────── */

function FinderKpiCard({ value, label, tone }: KpiCard) {
  return (
    <div className="sf-surface-elevated rounded-lg p-5 flex flex-col gap-1">
      <div className={`text-[28px] font-bold font-mono leading-none tracking-tight tabular-nums ${toneToValueClass(tone)}`}>
        {value}
      </div>
      <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] sf-text-muted">
        {label}
      </div>
    </div>
  );
}

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
    </span>
  );
}

function SelectedStateCard({ display }: { readonly display: SelectedStateDisplay }) {
  if (display.colors.length === 0 && display.editions.length === 0) return null;

  return (
    <div className="sf-surface-elevated border sf-border-soft rounded-lg p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] sf-text-muted">
          Selected State
        </span>
        {display.ssotRunNumber > 0 && (
          <Chip label={`SSOT \u00B7 Run #${display.ssotRunNumber}`} className="sf-chip-teal-strong" />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Colors */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-2">
            Colors ({display.colors.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {display.colors.map(pill => (
              <ColorPillInline key={pill.name} pill={pill} />
            ))}
          </div>
        </div>

        {/* Editions with paired colors */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-muted mb-2">
            Editions ({display.editions.length})
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

function DiscoverySummaryBar({ log }: { readonly log: RunDiscoveryLog }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip label={`${log.confirmedCount} confirmed`} className="sf-chip-success" />
      <Chip label={`${log.addedNewCount} new`} className="sf-chip-accent" />
      <Chip label={`${log.rejectedCount} rejected`} className="sf-chip-danger" />
      <Chip label={`${log.urlsCheckedCount} urls`} className="sf-chip-neutral" />
      <Chip label={`${log.queriesRunCount} queries`} className="sf-chip-neutral" />
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

function RunHistoryExpandedDetail({ row, colorRegistry }: { readonly row: RunHistoryRow; readonly colorRegistry: ColorRegistryEntry[] }) {
  const hexMap = useMemo(() => new Map(colorRegistry.map(c => [c.name, c.hex])), [colorRegistry]);
  const selColors = row.selected?.colors ?? [];
  const selEditions = row.selected?.editions ?? {};

  return (
    <div className="px-3 py-3 flex flex-col gap-3">
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

      {/* Discovery summary + details (v2 audit trail) */}
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-1.5">Discovery Summary</div>
        <DiscoverySummaryBar log={row.discoveryLog} />
      </div>

      <DiscoveryDetailsSection log={row.discoveryLog} siblingsExcluded={row.siblingsExcluded} />

      {/* System Prompt */}
      <details className="sf-surface-panel border sf-border-soft rounded-md">
        <summary className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle">
          System Prompt
        </summary>
        <pre className="sf-pre-block sf-text-caption font-mono rounded-b p-3 whitespace-pre-wrap leading-relaxed select-text cursor-text">
          {row.systemPrompt}
        </pre>
      </details>

      {/* User Message */}
      <details className="sf-surface-panel border sf-border-soft rounded-md">
        <summary className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle">
          User Message
        </summary>
        <pre className="sf-pre-block sf-text-caption font-mono rounded-b p-3 whitespace-pre-wrap leading-relaxed select-text cursor-text">
          {row.userMessage}
        </pre>
      </details>

      {/* LLM Response */}
      <details className="sf-surface-panel border sf-border-soft rounded-md">
        <summary className="px-3 py-2 text-[9px] font-bold uppercase tracking-[0.08em] sf-text-muted cursor-pointer select-none hover:sf-text-subtle">
          LLM Response
        </summary>
        <pre className="sf-pre-block sf-text-label font-mono rounded-b p-3 whitespace-pre-wrap leading-relaxed select-text cursor-text">
          {row.responseJson}
        </pre>
      </details>
    </div>
  );
}

/* ── Run history column defs ──────────────────────────────────────── */

function resolveAccessModeForModel(registry: LlmProviderEntry[], model: string): LlmAccessMode {
  const provider = resolveProviderForModel(registry, model);
  if (!provider) return 'api';
  const entry = provider.models.find((m) => m.modelId === model);
  return ((entry?.accessMode ?? provider.accessMode ?? 'api') as LlmAccessMode);
}

function buildRunHistoryColumns(
  onDeleteRun: (runNumber: number) => void,
  isDeletePending: boolean,
  registry: LlmProviderEntry[],
): ColumnDef<RunHistoryRow, unknown>[] {
  return [
    {
      accessorKey: 'runNumber',
      header: 'Run',
      cell: ({ row }) => {
        const isExpanded = row.getIsExpanded();
        return (
          <button
            onClick={(e) => { e.stopPropagation(); row.toggleExpanded(); }}
            className="inline-flex items-center gap-1.5 font-mono text-[13px] font-bold text-[var(--sf-token-accent-strong)] hover:opacity-80"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <span className={`text-[10px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>{'\u25B6'}</span>
            #{row.original.runNumber}
          </button>
        );
      },
      size: 80,
    },
    {
      accessorKey: 'ranAt',
      header: 'Date',
      cell: ({ row }) => (
        <span className="font-mono text-[10px] sf-text-muted">
          {row.original.ranAt?.split('T')[0] ?? ''}
        </span>
      ),
      size: 100,
    },
    {
      accessorKey: 'model',
      header: 'Model',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold sf-chip-purple border border-current">
            <ModelBadgeGroup accessMode={resolveAccessModeForModel(registry, row.original.model)} />
            {row.original.model || '?'}
          </span>
          {row.original.fallbackUsed && <Chip label="Fallback" className="sf-chip-warning" />}
        </div>
      ),
      size: 180,
    },
    {
      id: 'counts',
      header: 'Results',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Chip label={`${row.original.colorCount} colors`} className="sf-chip-accent" />
          <Chip label={`${row.original.editionCount} editions`} className="sf-chip-purple" />
        </div>
      ),
      size: 180,
    },
    {
      id: 'validation',
      header: 'Status',
      cell: ({ row }) => {
        const { validationStatus, rejectionSummary, isLatest } = row.original;
        return (
          <div className="flex items-center gap-1.5">
            {validationStatus === 'rejected' ? (
              <Chip label="Rejected" className="sf-chip-danger" />
            ) : (
              <Chip label="Valid" className="sf-chip-success" />
            )}
            {isLatest && <Chip label="LATEST \u00B7 SSOT" className="sf-chip-teal-strong" />}
            {rejectionSummary && (
              <span className="text-[9px] font-mono sf-text-muted truncate max-w-[180px]" title={rejectionSummary}>
                {rejectionSummary}
              </span>
            )}
          </div>
        );
      },
      size: 240,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteRun(row.original.runNumber); }}
          disabled={isDeletePending}
          className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Delete
        </button>
      ),
      size: 70,
    },
  ];
}

/* ── LLM model resolver ───────────────────────────────────────────── */

interface ColorEditionFinderPanelProps {
  readonly productId: string;
  readonly category: string;
}

interface ResolvedFinderModelResult {
  model: ReturnType<typeof resolvePhaseModel>;
  accessMode: LlmAccessMode;
  registry: LlmProviderEntry[];
}

function useResolvedFinderModel(): ResolvedFinderModelResult {
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);
  return useMemo(() => {
    const empty: ResolvedFinderModelResult = { model: null, accessMode: 'api' as LlmAccessMode, registry: [] };
    if (!storeValues) return empty;
    const policy = assembleLlmPolicyFromFlat(storeValues as Record<string, unknown>);
    const globalDraft: GlobalDraftSlice = {
      llmModelPlan: policy.models?.plan ?? '',
      llmModelReasoning: policy.models?.reasoning ?? '',
      llmPlanFallbackModel: policy.models?.planFallback ?? '',
      llmReasoningFallbackModel: policy.models?.reasoningFallback ?? '',
      llmPlanUseReasoning: policy.reasoning?.enabled ?? false,
      llmMaxOutputTokensPlan: policy.tokens?.plan ?? 0,
      llmMaxOutputTokensTriage: policy.tokens?.triage ?? 0,
      llmTimeoutMs: policy.timeoutMs ?? 0,
      llmMaxTokens: policy.tokens?.maxTokens ?? 0,
    };
    const overrides: LlmPhaseOverrides = (policy.phaseOverrides ?? {}) as LlmPhaseOverrides;
    const resolved = resolvePhaseModel(overrides, 'colorFinder', globalDraft);
    // WHY: Resolve accessMode + registry so badges show LAB vs API correctly
    // across header, footer, AND per-row in the run history table.
    const registry: LlmProviderEntry[] = Array.isArray(policy.providerRegistry) ? policy.providerRegistry as LlmProviderEntry[] : [];
    const rawModelKey = resolved?.useReasoning
      ? (overrides.colorFinder?.reasoningModel || globalDraft.llmModelReasoning)
      : (overrides.colorFinder?.baseModel || globalDraft.llmModelPlan);
    const accessMode = resolveAccessModeForModel(registry, rawModelKey);
    return { model: resolved, accessMode, registry };
  }, [storeValues]);
}

/* ── Main Component ───────────────────────────────────────────────── */

export function ColorEditionFinderPanel({ productId, category }: ColorEditionFinderPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:finder:collapsed:${productId}`, true);

  const { data: result = null, isLoading, isError } = useColorEditionFinderQuery(category, productId);
  const runMut = useColorEditionFinderRunMutation(category, productId);
  const deleteRunMut = useDeleteColorEditionFinderRunMutation(category, productId);
  const deleteAllMut = useDeleteColorEditionFinderAllMutation(category, productId);
  const { model: resolvedModel, accessMode: resolvedAccessMode, registry: providerRegistry } = useResolvedFinderModel();

  const { data: colorRegistry = [] } = useQuery<ColorRegistryEntry[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorRegistryEntry[]>('/colors'),
  });

  const [deleteTarget, setDeleteTarget] = useState<
    { kind: 'single'; runNumber: number } | { kind: 'all'; count: number } | null
  >(null);

  const requestDeleteRun = useCallback((runNumber: number) => {
    setDeleteTarget({ kind: 'single', runNumber });
  }, []);

  const isAnyDeletePending = deleteRunMut.isPending || deleteAllMut.isPending;

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'single') {
      deleteRunMut.mutate(deleteTarget.runNumber, {
        onSuccess: () => setDeleteTarget(null),
      });
    } else {
      deleteAllMut.mutate(undefined, {
        onSuccess: () => setDeleteTarget(null),
      });
    }
  }, [deleteTarget, deleteRunMut, deleteAllMut]);

  const runHistoryColumns = useMemo(
    () => buildRunHistoryColumns(requestDeleteRun, isAnyDeletePending, providerRegistry),
    [requestDeleteRun, isAnyDeletePending, providerRegistry],
  );

  if (!productId || !category) return null;

  // WHY: After deleting all runs, the GET returns 404 → isError. Treat as no data.
  const effectiveResult = isError ? null : result;

  const statusChip = deriveFinderStatusChip(effectiveResult);
  const kpiCards = deriveFinderKpiCards(effectiveResult);
  const cooldown = deriveCooldownState(effectiveResult);
  const selectedState = deriveSelectedStateDisplay(effectiveResult, colorRegistry);
  const runHistoryRows = deriveRunHistoryRows(effectiveResult);

  const modelDisplay = resolvedModel?.effectiveModel || 'not configured';

  // WHY: Derive badge props once — every ModelBadgeGroup site spreads this.
  // Avoids O(n) manual wiring per badge instance (CLAUDE.md O(1) Feature Scaling).
  const badgeProps = {
    accessMode: resolvedAccessMode,
    role: (resolvedModel?.useReasoning ? 'reasoning' : 'primary') as 'reasoning' | 'primary',
    thinking: resolvedModel?.thinking ?? false,
    webSearch: resolvedModel?.webSearch ?? false,
  };

  // WHY: Derive running state from the operations store (per-product), not from
  // the mutation hook (per-component-instance). This way "Running" reflects
  // the actual operation, survives navigation, and doesn't block other products.
  const ops = useOperationsStore((s) => s.operations);
  const isRunningCef = useMemo(
    () => [...ops.values()].some((o) => o.type === 'cef' && o.productId === productId && o.status === 'running'),
    [ops, productId],
  );

  const runStatus = isRunningCef ? 'running'
    : runMut.isError ? 'error'
    : runMut.isSuccess ? 'success'
    : 'idle';

  return (
    <div className="sf-surface-panel p-0 flex flex-col">
      {/* Header */}
      <div className={`flex items-center gap-2.5 px-6 pt-4 ${collapsed ? 'pb-3' : 'pb-0'}`}>
        <button
          onClick={toggleCollapsed}
          className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '+' : '-'}
        </button>
        <span className="text-[15px] font-bold sf-text-primary">Color & Edition Finder</span>

        {runStatus === 'running' ? (
          <Chip label="Running" className="sf-chip-purple animate-pulse" />
        ) : runStatus === 'error' ? (
          <Chip label="Failed" className="sf-chip-danger" />
        ) : (
          <Chip label={statusChip.label} className={toneToChipClass(statusChip.tone)} />
        )}

        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-[0.04em] sf-chip-purple border-[1.5px] border-current">
          <ModelBadgeGroup {...badgeProps} />
          {modelDisplay}
        </span>

        <Tip text="Discovers color variants and edition slugs for this product via LLM analysis." />

        <button
          onClick={(e) => { e.stopPropagation(); runMut.mutate(); }}
          disabled={isRunningCef}
          className="ml-auto px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isRunningCef ? 'Running...' : 'Run Now'}
        </button>
      </div>

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
          {effectiveResult.run_count > 0 && (
            <div className="flex items-center gap-3.5 px-4 py-2.5 sf-surface-elevated rounded-lg">
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted whitespace-nowrap">
                Cooldown
              </span>
              <div className="flex-1 h-1.5 rounded-full sf-surface-panel overflow-hidden">
                <div
                  className={`h-full rounded-full ${cooldown.onCooldown ? 'bg-[var(--sf-state-warning-fg)]' : 'bg-[var(--sf-state-success-fg)]'}`}
                  style={{ width: `${cooldown.progressPct}%` }}
                />
              </div>
              {cooldown.onCooldown ? (
                <>
                  <span className="text-[10px] font-bold font-mono sf-status-text-warning">
                    {cooldown.daysRemaining}d
                  </span>
                  <span className="text-[10px] font-mono sf-text-muted whitespace-nowrap">
                    Eligible: {cooldown.eligibleDate}
                  </span>
                </>
              ) : (
                <span className="text-[10px] font-bold font-mono sf-status-text-success">
                  Ready
                </span>
              )}
            </div>
          )}

          {/* Selected State */}
          <SelectedStateCard display={selectedState} />

          {/* Run History */}
          {runHistoryRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted">
                  Run History <span className="font-mono sf-text-subtle">{runHistoryRows.length} run{runHistoryRows.length !== 1 ? 's' : ''}</span>
                </div>
                <button
                  onClick={() => setDeleteTarget({ kind: 'all', count: runHistoryRows.length })}
                  disabled={isAnyDeletePending}
                  className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.04em] rounded sf-action-button sf-status-text-danger border sf-border-soft opacity-60 hover:opacity-100 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Delete All
                </button>
              </div>
              <DataTable
                data={runHistoryRows}
                columns={runHistoryColumns}
                persistKey="cef-runs"
                maxHeight="max-h-none"
                renderExpandedRow={(row) => (
                  <RunHistoryExpandedDetail row={row} colorRegistry={colorRegistry} />
                )}
                getRowClassName={(row) => row.isLatest ? 'border-l-2 border-[var(--sf-token-accent-strong)]' : ''}
              />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 pt-4 border-t sf-border-soft text-[10px] sf-text-muted">
            <span>Last run: <strong className="sf-text-subtle">{effectiveResult.last_ran_at?.split('T')[0] ?? '--'}</strong></span>
            <span>&middot;</span>
            <span className="inline-flex items-center gap-1.5">Model:
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-[0.04em] sf-chip-purple border-[1.5px] border-current">
                <ModelBadgeGroup {...badgeProps} />
                {modelDisplay}
              </span>
            </span>
            <span>&middot;</span>
            <span>Runs: <strong className="sf-text-subtle">{effectiveResult.run_count}</strong></span>
            {selectedState.ssotRunNumber > 0 && (
              <>
                <span>&middot;</span>
                <span>SSOT source: <strong className="sf-text-subtle">Run #{selectedState.ssotRunNumber}</strong></span>
              </>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <CefDeleteConfirmModal
          target={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isPending={isAnyDeletePending}
        />
      )}
    </div>
  );
}
