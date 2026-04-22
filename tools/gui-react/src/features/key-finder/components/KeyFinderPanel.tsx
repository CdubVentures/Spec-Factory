/**
 * KeyFinderPanel — Indexing Lab tab for the universal per-key finder.
 *
 * Composes: ReviewLayout + /summary + /reserved-keys + runningSet + filters
 * → grouped, ordered, filtered key list. Live-updates via the same WS chain
 * Review Grid uses (field-studio-map-saved → invalidationResolver).
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeSubscription } from '../../../hooks/useDataChangeSubscription.js';
import { invalidateDataChangeQueries } from '../../data-change/index.js';
import type { DataChangeMessage } from '../../data-change/index.js';
import { useRunningFieldKeys } from '../../operations/hooks/useFinderOperations.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import { IndexingPanelHeader } from '../../../shared/ui/finder/index.ts';
import { DiscoveryHistoryButton } from '../../../shared/ui/finder/DiscoveryHistoryButton.tsx';
import { FinderKpiCard } from '../../../shared/ui/finder/FinderKpiCard.tsx';
import { HeaderActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { FinderSectionCard } from '../../../shared/ui/finder/FinderSectionCard.tsx';
import { PromptPreviewModal } from '../../../shared/ui/finder/PromptPreviewModal.tsx';
import { usePersistedToggle, useCollapseStore } from '../../../stores/collapseStore.ts';
import type { ReviewLayout } from '../../../types/review.ts';
import { usePromptPreviewQuery } from '../../indexing/api/promptPreviewQueries.ts';
import {
  useReservedKeysQuery,
  useKeyFinderSummaryQuery,
} from '../api/keyFinderQueries.ts';
import { useKeyFinderFilters } from '../state/keyFinderFilters.ts';
import { selectKeyFinderGroupedRows } from '../state/keyFinderGroupedRows.ts';
import { KeyFinderToolbar } from './KeyFinderToolbar.tsx';
import { KeyGroupSection } from './KeyGroupSection.tsx';
import { KeyModelStrip } from './KeyModelStrip.tsx';
import { KeyBundlingStrip } from './KeyBundlingStrip.tsx';
import { KeyRunHistorySection } from './KeyRunHistorySection.tsx';
import { LIVE_MODES, DISABLED_REASONS } from '../types.ts';

interface KeyFinderPanelProps {
  readonly productId: string;
  readonly category: string;
}

export const KeyFinderPanel = memo(function KeyFinderPanel({ productId, category }: KeyFinderPanelProps) {
  const queryClient = useQueryClient();

  // ── Data layer ──────────────────────────────────────────────────────
  const { data: layout } = useQuery({
    queryKey: ['reviewLayout', category],
    queryFn: () => api.get<ReviewLayout>(`/review/${encodeURIComponent(category)}/layout`),
    enabled: Boolean(category),
  });
  const { data: summary } = useKeyFinderSummaryQuery(category, productId);
  const { data: reservedData } = useReservedKeysQuery(category);
  const runningFieldKeys = useRunningFieldKeys('kf', productId);

  // ── Filter state ────────────────────────────────────────────────────
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useKeyFinderFilters(category, productId);

  // ── Selector: merged groups + totals ────────────────────────────────
  const grouped = useMemo(
    () => selectKeyFinderGroupedRows({
      layout: layout?.rows,
      summary,
      reserved: reservedData?.reserved,
      runningSet: runningFieldKeys,
      filters,
    }),
    [layout, summary, reservedData, runningFieldKeys, filters],
  );

  // ── Live updates (same WS chain Review Grid uses) ───────────────────
  const onDataChange = useCallback((message: DataChangeMessage) => {
    invalidateDataChangeQueries({
      queryClient,
      message,
      fallbackCategory: category,
    });
  }, [queryClient, category]);

  useDataChangeSubscription({
    category,
    // 'settings' ensures pipeline-settings saves (bundling knobs) refetch /summary
    // so the Bundled column stays live. invalidationResolver also maps settings
    // → ['key-finder', cat] at the template layer for unmounted-panel cases.
    domains: ['review-layout', 'mapping', 'key-finder', 'review', 'publisher', 'settings'],
    onDataChange,
  });

  // ── Per-key Run ─────────────────────────────────────────────────────
  const fire = useFireAndForget({ type: 'kf', category, productId });
  const runKey = useCallback((fieldKey: string) => {
    fire(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
      { field_key: fieldKey, mode: 'run' },
      { fieldKey },
    );
  }, [fire, category, productId]);

  // ── Prompt preview modal state ──────────────────────────────────────
  const [promptFieldKey, setPromptFieldKey] = useState<string | null>(null);
  const openKeyPrompt = useCallback((fieldKey: string) => {
    setPromptFieldKey(fieldKey);
  }, []);
  const closePrompt = useCallback(() => setPromptFieldKey(null), []);
  const promptPreviewQuery = usePromptPreviewQuery(
    'key',
    category,
    productId,
    { field_key: promptFieldKey ?? '' },
    Boolean(promptFieldKey),
  );

  // ── Expand all / Collapse all groups — batched write into the shared
  // collapse store so each group's persisted open-state flips in one render.
  const setCollapseBatch = useCollapseStore((s) => s.setBatch);
  const expandAllGroups = useCallback(() => {
    const updates: Record<string, boolean> = {};
    for (const g of grouped.groups) {
      updates[`key-finder:${category}:${productId}:grp:${g.name}`] = true;
    }
    setCollapseBatch(updates);
  }, [grouped.groups, category, productId, setCollapseBatch]);
  const collapseAllGroups = useCallback(() => {
    const updates: Record<string, boolean> = {};
    for (const g of grouped.groups) {
      updates[`key-finder:${category}:${productId}:grp:${g.name}`] = false;
    }
    setCollapseBatch(updates);
  }, [grouped.groups, category, productId, setCollapseBatch]);

  // ── Phase 5 placeholders (rendered disabled) ────────────────────────
  const runAllGroups = useCallback(() => { /* Phase 5 */ }, []);
  const loopAllGroups = useCallback(() => { /* Phase 5 */ }, []);
  const runGroup = useCallback((_groupName: string) => { /* Phase 5 */ }, []);
  const loopGroup = useCallback((_groupName: string) => { /* Phase 5 */ }, []);

  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:key:collapsed:${productId}`, true);
  const anyRunning = runningFieldKeys.size > 0;

  return (
    <div className="sf-surface-panel p-0 flex flex-col" data-panel="key">
      <IndexingPanelHeader
        panel="key"
        icon="⚙"
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        title="Per-Key Finder"
        tip="Per-key discovery routed through difficulty tiers. Resolved keys feed Field Studio."
        isRunning={anyRunning}
        modelStrip={<KeyModelStrip />}
        historySlot={<DiscoveryHistoryButton finderId="keyFinder" productId={productId} category={category} width={ACTION_BUTTON_WIDTH.keyHeader} />}
        actionSlot={
          <>
            <HeaderActionButton
              intent="locked"
              label="Run all groups"
              onClick={runAllGroups}
              disabled={!LIVE_MODES.productRun}
              title={LIVE_MODES.productRun ? '' : DISABLED_REASONS.productRun}
              width={ACTION_BUTTON_WIDTH.keyHeader}
            />
            <HeaderActionButton
              intent="locked"
              label="Loop all groups"
              onClick={loopAllGroups}
              disabled={!LIVE_MODES.productLoop}
              title={LIVE_MODES.productLoop ? '' : DISABLED_REASONS.productLoop}
              width={ACTION_BUTTON_WIDTH.keyHeader}
            />
          </>
        }
      />

      {!collapsed && (
        <div className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <FinderKpiCard label="Keys in view" value={String(grouped.totals.eligible)} tone="neutral" />
            <FinderKpiCard label="Resolved" value={String(grouped.totals.resolved)} tone="success" />
            <FinderKpiCard label="Unresolved" value={String(grouped.totals.unresolved)} tone="warning" />
            <FinderKpiCard label="Running" value={String(grouped.totals.running)} tone={grouped.totals.running > 0 ? 'info' : 'neutral'} />
            <FinderKpiCard label="Groups" value={String(grouped.groups.length)} tone="neutral" />
          </div>

          <KeyBundlingStrip category={category} productId={productId} />

          <FinderSectionCard
            title="Keys"
            count={`${grouped.totals.eligible} eligible · ${grouped.totals.resolved} resolved`}
            storeKey={`keyFinder:keys:${productId}`}
            defaultOpen
          >
            <KeyFinderToolbar
              grouped={grouped}
              filters={filters}
              onFilterChange={updateFilter}
              onResetFilters={resetFilters}
              hasActiveFilters={hasActiveFilters}
              onExpandAllGroups={expandAllGroups}
              onCollapseAllGroups={collapseAllGroups}
            />

            {grouped.groups.length === 0 ? (
              <div className="p-6 sf-text-muted text-[13px] text-center">
                {hasActiveFilters
                  ? 'No keys match the current filters.'
                  : 'No eligible keys for this product. Check Field Studio setup.'}
              </div>
            ) : (
              <div>
                {grouped.groups.map((g) => (
                  <KeyGroupSection
                    key={g.name}
                    group={g}
                    storeKeyPrefix={`key-finder:${category}:${productId}`}
                    productId={productId}
                    category={category}
                    onRunKey={runKey}
                    onOpenKeyPrompt={openKeyPrompt}
                    onRunGroup={runGroup}
                    onLoopGroup={loopGroup}
                  />
                ))}
              </div>
            )}
          </FinderSectionCard>

          <KeyRunHistorySection category={category} productId={productId} />
        </div>
      )}

      <PromptPreviewModal
        open={Boolean(promptFieldKey)}
        onClose={closePrompt}
        query={promptPreviewQuery}
        title={promptFieldKey ? `Prompt preview — ${promptFieldKey}` : ''}
        subtitle="Compiled prompt the next Run would dispatch"
        storageKeyPrefix={`key-prompt-preview:${category}:${productId}:${promptFieldKey ?? ''}`}
      />
    </div>
  );
});
