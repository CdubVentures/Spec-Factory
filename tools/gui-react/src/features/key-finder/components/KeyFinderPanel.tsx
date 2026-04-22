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
import { useRunningFieldKeys, useKeyFieldOpStates, awaitPassengersRegistered, awaitOperationTerminal } from '../../operations/hooks/useFinderOperations.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import { IndexingPanelHeader } from '../../../shared/ui/finder/index.ts';
import { DiscoveryHistoryButton } from '../../../shared/ui/finder/DiscoveryHistoryButton.tsx';
import { FinderKpiCard } from '../../../shared/ui/finder/FinderKpiCard.tsx';
import { HeaderActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { FinderSectionCard } from '../../../shared/ui/finder/FinderSectionCard.tsx';
import { PromptPreviewModal } from '../../../shared/ui/finder/PromptPreviewModal.tsx';
import { TabStrip } from '../../../shared/ui/navigation/TabStrip.tsx';
import { usePersistedToggle, useCollapseStore } from '../../../stores/collapseStore.ts';
import type { ReviewLayout } from '../../../types/review.ts';
import { usePromptPreviewQuery } from '../../indexing/api/promptPreviewQueries.ts';
import {
  useReservedKeysQuery,
  useKeyFinderSummaryQuery,
  useKeyFinderBundlingConfigQuery,
} from '../api/keyFinderQueries.ts';
import { useKeyFinderFilters } from '../state/keyFinderFilters.ts';
import { selectKeyFinderGroupedRows, sortKeysByPriority } from '../state/keyFinderGroupedRows.ts';
import { KeyFinderToolbar } from './KeyFinderToolbar.tsx';
import { KeyGroupSection } from './KeyGroupSection.tsx';
import { KeyModelStrip } from './KeyModelStrip.tsx';
import { KeyBundlingStrip } from './KeyBundlingStrip.tsx';
import { KeyRunHistorySection } from './KeyRunHistorySection.tsx';
import { LIVE_MODES, DISABLED_REASONS, TOOLTIPS } from '../types.ts';

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
  // Phase 3b: per-fieldKey op status + mode (Loop spinner vs Queued pill)
  const keyFieldOpStates = useKeyFieldOpStates('kf', productId);

  // ── Filter state ────────────────────────────────────────────────────
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useKeyFinderFilters(category, productId);

  // ── Selector: merged groups + totals ────────────────────────────────
  const grouped = useMemo(
    () => selectKeyFinderGroupedRows({
      layout: layout?.rows,
      summary,
      reserved: reservedData?.reserved,
      runningSet: runningFieldKeys,
      opStates: keyFieldOpStates,
      filters,
    }),
    [layout, summary, reservedData, runningFieldKeys, keyFieldOpStates, filters],
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

  // ── Per-key Run + Loop (Phase 3b) ───────────────────────────────────
  const fire = useFireAndForget({ type: 'kf', category, productId });
  const runKey = useCallback((fieldKey: string) => {
    fire(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
      { field_key: fieldKey, mode: 'run' },
      { fieldKey },
    );
  }, [fire, category, productId]);
  const loopKey = useCallback((fieldKey: string) => {
    fire(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
      { field_key: fieldKey, mode: 'loop' },
      { fieldKey, subType: 'loop' },
    );
  }, [fire, category, productId]);

  // ── Prompt preview modal state ──────────────────────────────────────
  // Run vs Loop matters: under alwaysSoloRun=true a Run prompt is solo while
  // Loop still bundles passengers. The tab selector lets the user preview
  // both without closing the modal.
  const [promptState, setPromptState] = useState<{ readonly fieldKey: string; readonly mode: 'run' | 'loop' } | null>(null);
  const openKeyPrompt = useCallback((fieldKey: string) => {
    setPromptState({ fieldKey, mode: 'run' });
  }, []);
  const closePrompt = useCallback(() => setPromptState(null), []);
  const setPromptMode = useCallback((mode: 'run' | 'loop') => {
    setPromptState((prev) => (prev ? { ...prev, mode } : prev));
  }, []);
  const promptPreviewQuery = usePromptPreviewQuery(
    'key',
    category,
    productId,
    { field_key: promptState?.fieldKey ?? '', mode: promptState?.mode ?? 'run' },
    Boolean(promptState),
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

  // ── Group / All fan-out handlers (Stage C 2026-04-22) ───────────────
  // Fans out existing per-key /key-finder/:cat/:pid POST calls. When
  // alwaysSoloRun=true every child is solo → fan out in parallel. When
  // alwaysSoloRun=false each child packs passengers against the live in-flight
  // registry → fire sequentially so the N-th call sees the (N-1)-th's
  // registrations. Loop chains are always sequential (each Loop resolves its
  // key before advancing).
  const { data: bundlingConfig } = useKeyFinderBundlingConfigQuery(category, productId);
  const alwaysSoloRun = bundlingConfig?.alwaysSoloRun ?? true;

  const keysInGroup = useCallback((groupName: string) => {
    const g = grouped.groups.find((gr) => gr.name === groupName);
    return g ? g.keys.map((k) => k.field_key) : [];
  }, [grouped.groups]);

  const allKeys = useCallback(() => {
    return grouped.groups.flatMap((g) => g.keys.map((k) => k.field_key));
  }, [grouped.groups]);

  // Stage 3 — registration-sequential Run Group under alwaysSoloRun=false.
  // We need the N-th POST's buildPassengers to see the (N-1)-th's primary +
  // passengers in the in-flight registry. Firing with onDispatched captures
  // the real opId as soon as the 202 lands, then awaitPassengersRegistered
  // blocks until the server emits the passengersRegistered flag on that opId.
  // Execution itself stays overlapping — we only gate DISPATCH order.
  // Timeout fallback prevents a flaky server from deadlocking the chain.
  const runKeysSequential = useCallback(async (keys: readonly string[]) => {
    for (const fk of keys) {
      let resolveDispatched: ((id: string) => void) | null = null;
      const dispatched = new Promise<string>((resolve) => { resolveDispatched = resolve; });
      fire(
        `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
        { field_key: fk, mode: 'run' },
        { fieldKey: fk, onDispatched: (id) => resolveDispatched?.(id) },
      );
      const opId = await dispatched;
      await awaitPassengersRegistered(opId);
    }
  }, [fire, category, productId]);

  const runKeysParallel = useCallback((keys: readonly string[]) => {
    for (const fk of keys) runKey(fk);
  }, [runKey]);

  // Stage 4 — Loop chain state. Exactly one chain active at a time (group OR
  // all-groups). The chain picks its next primary in priority order (mandatory
  // first, always before rare, easy before very_hard) from the currently-
  // unresolved keys, fires a Loop for it, and awaits the op's terminal status
  // before advancing. `cancelled` halts the chain (user pressed Stop);
  // `done`/`error` advance.
  type LoopChainState =
    | { readonly kind: 'group'; readonly groupName: string; readonly current: number; readonly total: number }
    | { readonly kind: 'all'; readonly current: number; readonly total: number };
  const [loopChain, setLoopChain] = useState<LoopChainState | null>(null);

  const fireLoopChain = useCallback(async (
    sorted: ReadonlyArray<{ readonly field_key: string }>,
    makeState: (current: number, total: number) => LoopChainState,
  ) => {
    if (sorted.length === 0) { setLoopChain(null); return; }
    for (let i = 0; i < sorted.length; i += 1) {
      setLoopChain(makeState(i + 1, sorted.length));
      const fk = sorted[i].field_key;
      let resolveDispatched: ((id: string) => void) | null = null;
      const dispatched = new Promise<string>((resolve) => { resolveDispatched = resolve; });
      fire(
        `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
        { field_key: fk, mode: 'loop' },
        { fieldKey: fk, subType: 'loop', onDispatched: (id) => resolveDispatched?.(id) },
      );
      const opId = await dispatched;
      const terminal = await awaitOperationTerminal(opId);
      if (terminal === 'cancelled') break;
    }
    setLoopChain(null);
  }, [fire, category, productId]);

  const runGroup = useCallback((groupName: string) => {
    const keys = keysInGroup(groupName);
    if (alwaysSoloRun) runKeysParallel(keys);
    else void runKeysSequential(keys);
  }, [alwaysSoloRun, keysInGroup, runKeysParallel, runKeysSequential]);

  const runAllGroups = useCallback(() => {
    const keys = allKeys();
    if (alwaysSoloRun) runKeysParallel(keys);
    else void runKeysSequential(keys);
  }, [alwaysSoloRun, allKeys, runKeysParallel, runKeysSequential]);

  const loopGroup = useCallback((groupName: string) => {
    if (loopChain) return; // one chain at a time
    const group = grouped.groups.find((g) => g.name === groupName);
    if (!group) return;
    const unresolved = group.keys.filter((k) => k.last_status !== 'resolved' && !k.published);
    const sorted = sortKeysByPriority(unresolved);
    void fireLoopChain(sorted, (current, total) => ({ kind: 'group', groupName, current, total }));
  }, [loopChain, grouped.groups, fireLoopChain]);

  const loopAllGroups = useCallback(() => {
    if (loopChain) return;
    const unresolved = grouped.groups.flatMap((g) => g.keys.filter((k) => k.last_status !== 'resolved' && !k.published));
    const sorted = sortKeysByPriority(unresolved);
    void fireLoopChain(sorted, (current, total) => ({ kind: 'all', current, total }));
  }, [loopChain, grouped.groups, fireLoopChain]);

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
              intent={LIVE_MODES.productRun ? 'spammable' : 'locked'}
              label="Run all groups"
              onClick={runAllGroups}
              disabled={!LIVE_MODES.productRun}
              title={LIVE_MODES.productRun ? TOOLTIPS.productRun : DISABLED_REASONS.productRun}
              width={ACTION_BUTTON_WIDTH.keyHeader}
            />
            <HeaderActionButton
              intent={LIVE_MODES.productLoop && !loopChain ? 'spammable' : 'locked'}
              label={loopChain?.kind === 'all' ? `Loop all (${loopChain.current}/${loopChain.total})` : 'Loop all groups'}
              onClick={loopAllGroups}
              disabled={!LIVE_MODES.productLoop || loopChain !== null}
              title={
                !LIVE_MODES.productLoop
                  ? DISABLED_REASONS.productLoop
                  : loopChain?.kind === 'all'
                    ? `Loop chain in progress (${loopChain.current} of ${loopChain.total}). Cancel the running Loop from the Operations panel to halt.`
                    : loopChain?.kind === 'group'
                      ? 'A group Loop chain is running — finish or cancel it before starting Loop all.'
                      : TOOLTIPS.productLoop
              }
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
                {grouped.groups.map((g) => {
                  const groupChain = loopChain?.kind === 'group' && loopChain.groupName === g.name
                    ? { current: loopChain.current, total: loopChain.total }
                    : null;
                  return (
                    <KeyGroupSection
                      key={g.name}
                      group={g}
                      storeKeyPrefix={`key-finder:${category}:${productId}`}
                      productId={productId}
                      category={category}
                      onRunKey={runKey}
                      onLoopKey={loopKey}
                      onOpenKeyPrompt={openKeyPrompt}
                      onRunGroup={runGroup}
                      onLoopGroup={loopGroup}
                      loopChainProgress={groupChain}
                      anyChainActive={loopChain !== null}
                    />
                  );
                })}
              </div>
            )}
          </FinderSectionCard>

          <KeyRunHistorySection category={category} productId={productId} />
        </div>
      )}

      <PromptPreviewModal
        open={Boolean(promptState)}
        onClose={closePrompt}
        query={promptPreviewQuery}
        title={promptState ? `Prompt preview — ${promptState.fieldKey}` : ''}
        subtitle={
          promptState?.mode === 'loop'
            ? 'Compiled prompt the next Loop iteration would dispatch (includes passengers)'
            : 'Compiled prompt the next Run would dispatch'
        }
        storageKeyPrefix={`key-prompt-preview:${category}:${productId}:${promptState?.fieldKey ?? ''}:${promptState?.mode ?? 'run'}`}
        headerSlot={
          promptState ? (
            <TabStrip
              tabs={[
                { id: 'run', label: 'Run', description: 'Preview what a focused Run would send (no passengers when alwaysSoloRun is ON).' },
                { id: 'loop', label: 'Loop', description: 'Preview the bundled prompt a Loop iteration would send.' },
              ]}
              activeTab={promptState.mode}
              onSelect={setPromptMode}
            />
          ) : undefined
        }
      />
    </div>
  );
});
