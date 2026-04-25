/**
 * KeyRunHistorySection — collapsible Run History section shown below the
 * Keys sub-panel.
 *
 * Mirrors SKU/RDF's Run History (in `GenericScalarFinderPanel`) but keyFinder
 * groups by `primary_field_key` (shown as `leftContent` chip) instead of by
 * variant. Reuses the shared FinderRunHistoryRow / FinderRunPromptDetails /
 * FinderDiscoveryDetails primitives and persists each row's expand state via
 * `usePersistedToggle`.
 */

import { memo } from 'react';
import { usePersistedExpandMap } from '../../../stores/tabStore.ts';
import { FinderSectionCard } from '../../../shared/ui/finder/FinderSectionCard.tsx';
import { FinderRunHistoryRow } from '../../../shared/ui/finder/FinderRunHistoryRow.tsx';
import { FinderRunPromptDetails } from '../../../shared/ui/finder/FinderRunPromptDetails.tsx';
import { FinderDiscoveryDetails, type DiscoverySection } from '../../../shared/ui/finder/FinderDiscoveryDetails.tsx';
import { Chip } from '../../../shared/ui/feedback/Chip.tsx';
import { ConfidenceChip } from '../../../shared/ui/finder/ConfidenceChip.tsx';
import { RowActionButton } from '../../../shared/ui/actionButton/index.ts';
import {
  useKeyFinderAllRunsQuery,
  useDeleteKeyFinderRunMutation,
  useDeleteAllKeyFinderRunsMutation,
} from '../api/keyFinderQueries.ts';
import type { KeyFinderRun } from '../types.ts';

interface KeyRunHistorySectionProps {
  readonly category: string;
  readonly productId: string;
}

function renderValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string' && value.trim().toLowerCase() === 'unk') return '—';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const shown = value.slice(0, 3).map((v) => String(v));
    const more = value.length > 3 ? ` +${value.length - 3}` : '';
    return `[${shown.join(', ')}${more}]`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return '—'; }
}

export const KeyRunHistorySection = memo(function KeyRunHistorySection({
  category,
  productId,
}: KeyRunHistorySectionProps) {
  const { data, isLoading } = useKeyFinderAllRunsQuery(category, productId);
  const runs: readonly KeyFinderRun[] = data?.runs
    ? [...data.runs].sort((a, b) => b.run_number - a.run_number)
    : [];

  const deleteRun = useDeleteKeyFinderRunMutation(category, productId);
  const deleteAll = useDeleteAllKeyFinderRunsMutation(category, productId);
  const isPending = deleteRun.isPending || deleteAll.isPending;

  const [expandedRuns, toggleExpandedRun] = usePersistedExpandMap(
    `keyFinder:history:runs:${productId}`,
  );
  const toggleRun = (runNumber: number) => {
    toggleExpandedRun(String(runNumber));
  };

  const handleDeleteRun = (runNumber: number, fieldKey: string) => {
    deleteRun.mutate({ runNumber, fieldKey });
  };

  const handleDeleteAll = () => {
    if (window.confirm('Delete all keyFinder runs for this product? This cannot be undone.')) {
      deleteAll.mutate();
    }
  };

  if (isLoading && runs.length === 0) {
    return (
      <FinderSectionCard title="Run History" storeKey={`keyFinder:history:${productId}`}>
        <div className="sf-text-muted text-[12px] text-center py-4">Loading…</div>
      </FinderSectionCard>
    );
  }

  if (runs.length === 0) {
    return (
      <FinderSectionCard title="Run History" storeKey={`keyFinder:history:${productId}`}>
        <div className="sf-text-muted text-[12px] text-center py-4 italic">
          No runs yet — click ▶ Run on a key to start.
        </div>
      </FinderSectionCard>
    );
  }

  return (
    <FinderSectionCard
      title="Run History"
      count={`${runs.length} run${runs.length !== 1 ? 's' : ''}`}
      storeKey={`keyFinder:history:${productId}`}
      trailing={
        <RowActionButton
          intent="delete"
          label="Delete All"
          onClick={handleDeleteAll}
          disabled={isPending}
        />
      }
    >
      <div className="space-y-1.5">
        {runs.map((run) => {
          const expanded = Boolean(expandedRuns[String(run.run_number)]);
          const primaryFk = run.response.primary_field_key;
          const perKey = run.response.results?.[primaryFk];
          const valueDisplay = renderValue(perKey?.value);
          const confidence = perKey?.confidence ?? 0;
          const evidenceCount = perKey?.evidence_refs?.length ?? 0;
          const passengerCount = Math.max(0, Object.keys(run.response.results || {}).length - 1);

          const log = run.response.discovery_log;
          const discoverySections: DiscoverySection[] = [];
          if (log?.queries_run?.length) discoverySections.push({ title: 'Queries Run', format: 'lines', items: [...log.queries_run] });
          if (log?.urls_checked?.length) discoverySections.push({ title: 'URLs Checked', format: 'lines', items: [...log.urls_checked] });
          if (log?.notes?.length) discoverySections.push({ title: 'Notes', format: 'lines', items: [...log.notes] });

          return (
            <FinderRunHistoryRow
              key={run.run_number}
              runNumber={run.run_number}
              ranAt={run.ran_at}
              startedAt={run.started_at ?? undefined}
              durationMs={run.duration_ms ?? undefined}
              model={run.model}
              accessMode={run.access_mode}
              effortLevel={run.effort_level}
              fallbackUsed={run.fallback_used}
              thinking={run.thinking}
              webSearch={run.web_search}
              expanded={expanded}
              onToggle={() => toggleRun(run.run_number)}
              onDelete={(rn) => handleDeleteRun(rn, primaryFk)}
              deleteDisabled={isPending}
              leftContent={
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium sf-surface-panel border sf-border-soft">
                  <code className="sf-text-primary truncate max-w-[180px]">{primaryFk}</code>
                  {passengerCount > 0 && (
                    <span className="sf-text-muted font-mono">+{passengerCount}</span>
                  )}
                </span>
              }
              rightContent={
                <>
                  <Chip
                    label={valueDisplay}
                    className={perKey?.value != null && perKey.value !== 'unk' ? 'sf-chip-success font-mono' : 'sf-chip-warning font-mono'}
                  />
                  <ConfidenceChip value={confidence} />
                  <Chip
                    label={`${evidenceCount} evidence`}
                    className={evidenceCount > 0 ? 'sf-chip-info' : 'sf-chip-neutral'}
                  />
                </>
              }
            >
              {discoverySections.length > 0 && (
                <FinderDiscoveryDetails
                  title="Discovery Log"
                  sections={discoverySections}
                  storageKey={`keyFinder:discoveryLog:${run.run_number}`}
                />
              )}
              <FinderRunPromptDetails
                systemPrompt={run.prompt?.system}
                userMessage={run.prompt?.user}
                response={run.response}
                storageKeyPrefix={`keyFinder:runPrompt:${run.run_number}`}
              />
            </FinderRunHistoryRow>
          );
        })}
      </div>
    </FinderSectionCard>
  );
});
