/**
 * KeyFinderPanel — Indexing Lab tab for the universal per-key finder.
 *
 * Composes: ReviewLayout + /summary + /reserved-keys + runningSet + filters
 * → grouped, ordered, filtered key list. Live-updates via the same WS chain
 * Review Grid uses (field-studio-map-saved → invalidationResolver).
 */

import { memo, useCallback, useMemo } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeSubscription } from '../../../hooks/useDataChangeSubscription.js';
import { invalidateDataChangeQueries } from '../../data-change/index.js';
import type { DataChangeMessage } from '../../data-change/index.js';
import { useRunningFieldKeys } from '../../operations/hooks/useFinderOperations.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import type { ReviewLayout } from '../../../types/review.ts';
import {
  useReservedKeysQuery,
  useKeyFinderSummaryQuery,
} from '../api/keyFinderQueries.ts';
import { useKeyFinderFilters } from '../state/keyFinderFilters.ts';
import { selectKeyFinderGroupedRows } from '../state/keyFinderGroupedRows.ts';
import { KeyFinderToolbar } from './KeyFinderToolbar.tsx';
import { KeyGroupSection } from './KeyGroupSection.tsx';
import { KeyHistoryDrawer } from './KeyHistoryDrawer.tsx';
import { KeyPromptSlideover } from './KeyPromptSlideover.tsx';
import type { KeyHistoryScope } from '../types.ts';
import { useState } from 'react';

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
    domains: ['review-layout', 'mapping', 'key-finder', 'review', 'publisher'],
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

  // ── Drawer state (3-scope history) ──────────────────────────────────
  const [drawerState, setDrawerState] = useState<{ scope: KeyHistoryScope; targetId: string } | null>(null);
  const closeDrawer = useCallback(() => setDrawerState(null), []);
  const openKeyHistory = useCallback((fieldKey: string) => {
    setDrawerState({ scope: 'key', targetId: fieldKey });
  }, []);
  const openGroupHistory = useCallback((groupName: string) => {
    setDrawerState({ scope: 'group', targetId: groupName });
  }, []);
  const openProductHistory = useCallback(() => {
    setDrawerState({ scope: 'product', targetId: productId });
  }, [productId]);

  const [promptFieldKey, setPromptFieldKey] = useState<string | null>(null);
  const openKeyPrompt = useCallback((fieldKey: string) => {
    setPromptFieldKey(fieldKey);
  }, []);
  const closePrompt = useCallback(() => setPromptFieldKey(null), []);

  // ── Phase 5 placeholders (rendered disabled) ────────────────────────
  const productLabel = productId;
  const runAllGroups = useCallback(() => { /* Phase 5 */ }, []);
  const loopAllGroups = useCallback(() => { /* Phase 5 */ }, []);
  const runGroup = useCallback((_groupName: string) => { /* Phase 5 */ }, []);
  const loopGroup = useCallback((_groupName: string) => { /* Phase 5 */ }, []);

  return (
    <div className="sf-surface border sf-border-soft rounded-lg overflow-hidden">
      <KeyFinderToolbar
        productLabel={productLabel}
        category={category}
        grouped={grouped}
        filters={filters}
        onFilterChange={updateFilter}
        onResetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        onOpenProductHistory={openProductHistory}
        onRunAllGroups={runAllGroups}
        onLoopAllGroups={loopAllGroups}
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
              onRunKey={runKey}
              onOpenKeyHistory={openKeyHistory}
              onOpenKeyPrompt={openKeyPrompt}
              onOpenGroupHistory={openGroupHistory}
              onRunGroup={runGroup}
              onLoopGroup={loopGroup}
            />
          ))}
        </div>
      )}

      {drawerState && (
        <KeyHistoryDrawer
          open
          category={category}
          productId={productId}
          scope={drawerState.scope}
          targetId={drawerState.targetId}
          onClose={closeDrawer}
          onRerunKey={runKey}
        />
      )}

      {promptFieldKey && (
        <KeyPromptSlideover
          open
          category={category}
          productId={productId}
          fieldKey={promptFieldKey}
          onClose={closePrompt}
          onRerun={runKey}
        />
      )}
    </div>
  );
});
