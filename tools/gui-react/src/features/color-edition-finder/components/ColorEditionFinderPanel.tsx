import { useMemo } from 'react';
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
import { useColorEditionFinderQuery, useColorEditionFinderRunMutation } from '../api/colorEditionFinderQueries.ts';
import {
  deriveFinderKpiCards,
  deriveCooldownState,
  deriveColorTableRows,
  deriveEditionTableRows,
  deriveFinderStatusChip,
} from '../selectors/colorEditionFinderSelectors.ts';
import type { KpiCard, ColorTableRow, EditionTableRow } from '../selectors/colorEditionFinderSelectors.ts';
import type { ColorRegistryEntry } from '../types.ts';

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
  return 'text-[var(--sf-token-accent-strong)]';
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

/* ── Column defs ──────────────────────────────────────────────────── */

const colorColumns: ColumnDef<ColorTableRow, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Color',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.hex && (
          <span
            className="inline-block w-4 h-4 rounded-sm border border-white/10 shrink-0"
            style={{ backgroundColor: row.original.hex }}
          />
        )}
        <span className="font-semibold sf-text-primary text-[12px]">{row.original.name}</span>
        {row.original.isDefault && <Chip label="Default" className="sf-chip-accent" />}
      </div>
    ),
    size: 200,
  },
  {
    accessorKey: 'hex',
    header: 'Hex',
    cell: ({ row }) => <span className="font-mono text-[10px] sf-text-muted">{row.original.hex}</span>,
    size: 90,
  },
  {
    accessorKey: 'foundRun',
    header: 'Run',
    cell: ({ row }) => <span className="font-mono text-[10px] font-semibold text-[var(--sf-token-accent-strong)]">{row.original.foundRun}</span>,
    size: 60,
  },
  {
    accessorKey: 'foundAt',
    header: 'Discovered',
    cell: ({ row }) => <span className="font-mono text-[10px] sf-text-muted">{row.original.foundAt}</span>,
    size: 100,
  },
  {
    accessorKey: 'model',
    header: 'Model',
    cell: ({ row }) => row.original.model ? <Chip label={row.original.model} className="sf-chip-purple" /> : <span className="sf-text-muted">-</span>,
    size: 120,
  },
];

const editionColumns: ColumnDef<EditionTableRow, unknown>[] = [
  {
    accessorKey: 'slug',
    header: 'Edition',
    cell: ({ row }) => <span className="font-mono font-semibold sf-text-primary text-[12px]">{row.original.slug}</span>,
    size: 200,
  },
  {
    accessorKey: 'foundRun',
    header: 'Run',
    cell: ({ row }) => <span className="font-mono text-[10px] font-semibold text-[var(--sf-token-accent-strong)]">{row.original.foundRun}</span>,
    size: 60,
  },
  {
    accessorKey: 'foundAt',
    header: 'Discovered',
    cell: ({ row }) => <span className="font-mono text-[10px] sf-text-muted">{row.original.foundAt}</span>,
    size: 100,
  },
  {
    accessorKey: 'model',
    header: 'Model',
    cell: ({ row }) => row.original.model ? <Chip label={row.original.model} className="sf-chip-purple" /> : <span className="sf-text-muted">-</span>,
    size: 120,
  },
];

/* ── LLM model resolver ───────────────────────────────────────────── */

interface ColorEditionFinderPanelProps {
  readonly productId: string;
  readonly category: string;
}

function useResolvedFinderModel() {
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);
  return useMemo(() => {
    if (!storeValues) return null;
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
    return resolvePhaseModel(overrides, 'colorFinder', globalDraft);
  }, [storeValues]);
}

/* ── Main Component ───────────────────────────────────────────────── */

export function ColorEditionFinderPanel({ productId, category }: ColorEditionFinderPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:finder:collapsed:${productId}`, false);

  const { data: result = null, isLoading } = useColorEditionFinderQuery(category, productId);
  const runMut = useColorEditionFinderRunMutation(category, productId);
  const resolvedModel = useResolvedFinderModel();

  const { data: colorRegistry = [] } = useQuery<ColorRegistryEntry[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorRegistryEntry[]>('/colors'),
  });

  if (!productId || !category) return null;

  const statusChip = deriveFinderStatusChip(result);
  const kpiCards = deriveFinderKpiCards(result);
  const cooldown = deriveCooldownState(result);
  const colorRows = deriveColorTableRows(result, colorRegistry);
  const editionRows = deriveEditionTableRows(result);

  const modelDisplay = resolvedModel?.effectiveModel || 'not configured';
  const webSearchEnabled = resolvedModel?.webSearch ?? false;

  const runStatus = runMut.isPending ? 'running'
    : runMut.isError ? 'error'
    : runMut.isSuccess ? 'success'
    : 'idle';

  return (
    <div className="sf-surface-panel p-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-6 pt-4 pb-0">
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
          <ModelBadgeGroup
            role={resolvedModel?.useReasoning ? 'reasoning' : 'primary'}
            thinking={resolvedModel?.thinking ?? false}
            webSearch={webSearchEnabled}
          />
          {modelDisplay}
        </span>

        <Tip text="Discovers color variants and edition slugs for this product via LLM analysis." />

        <button
          onClick={(e) => { e.stopPropagation(); runMut.mutate(); }}
          disabled={runMut.isPending}
          className="ml-auto px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded sf-primary-button disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {runMut.isPending ? 'Running...' : 'Run Now'}
        </button>
      </div>

      {/* Body */}
      {collapsed ? null : isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : !result ? (
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
          {result.run_count > 0 && (
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

          {/* Colors Table */}
          {colorRows.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-2">
                Colors <span className="font-mono sf-text-subtle">{colorRows.length} variants</span>
              </div>
              <DataTable data={colorRows} columns={colorColumns} persistKey="cef-colors" maxHeight="max-h-[400px]" />
            </div>
          )}

          {/* Editions Table */}
          {editionRows.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] sf-text-muted mb-2">
                Editions <span className="font-mono sf-text-subtle">{editionRows.length} edition{editionRows.length !== 1 ? 's' : ''}</span>
              </div>
              <DataTable data={editionRows} columns={editionColumns} persistKey="cef-editions" maxHeight="max-h-[400px]" />
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-3 pt-4 border-t sf-border-soft text-[10px] sf-text-muted">
            <span>Last run: <strong className="sf-text-subtle">{result.last_ran_at?.split('T')[0] ?? '--'}</strong></span>
            <span>&middot;</span>
            <span className="inline-flex items-center gap-1.5">Model:
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-[0.04em] sf-chip-purple border-[1.5px] border-current">
                <ModelBadgeGroup
                  role={resolvedModel?.useReasoning ? 'reasoning' : 'primary'}
                  thinking={resolvedModel?.thinking ?? false}
                  webSearch={webSearchEnabled}
                />
                {modelDisplay}
              </span>
            </span>
            <span>&middot;</span>
            <span>Runs: <strong className="sf-text-subtle">{result.run_count}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}
