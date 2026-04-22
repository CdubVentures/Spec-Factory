/**
 * KeyFinderPanel — Indexing Lab tab for the universal per-key finder.
 *
 * Composes: ReviewLayout + /summary + /reserved-keys + runningSet + filters
 * → grouped, ordered, filtered key list. Live-updates via the same WS chain
 * Review Grid uses (field-studio-map-saved → invalidationResolver).
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeSubscription } from '../../../hooks/useDataChangeSubscription.js';
import { invalidateDataChangeQueries } from '../../data-change/index.js';
import type { DataChangeMessage } from '../../data-change/index.js';
import { useRunningFieldKeys, useKeyFieldOpStates, usePassengerRides, useActivePassengers, awaitPassengersRegistered, awaitOperationTerminal } from '../../operations/hooks/useFinderOperations.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import { IndexingPanelHeader } from '../../../shared/ui/finder/index.ts';
import { DiscoveryHistoryButton } from '../../../shared/ui/finder/DiscoveryHistoryButton.tsx';
import { FinderKpiCard } from '../../../shared/ui/finder/FinderKpiCard.tsx';
import { HeaderActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { FinderSectionCard } from '../../../shared/ui/finder/FinderSectionCard.tsx';
import { PromptPreviewModal } from '../../../shared/ui/finder/PromptPreviewModal.tsx';
import { FinderDeleteConfirmModal } from '../../../shared/ui/finder/FinderDeleteConfirmModal.tsx';
import type { DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { TabStrip } from '../../../shared/ui/navigation/TabStrip.tsx';
import { usePersistedToggle, useCollapseStore } from '../../../stores/collapseStore.ts';
import type { ReviewLayout } from '../../../types/review.ts';
import { usePromptPreviewQuery } from '../../indexing/api/promptPreviewQueries.ts';
import {
  useReservedKeysQuery,
  useKeyFinderSummaryQuery,
  useKeyFinderBundlingConfigQuery,
  useUnresolveKeyMutation,
  useDeleteKeyMutation,
} from '../api/keyFinderQueries.ts';
import { useKeyFinderFilters } from '../state/keyFinderFilters.ts';
import { selectKeyFinderGroupedRows, sortKeysByPriority } from '../state/keyFinderGroupedRows.ts';
import { runLoopChain } from '../state/runLoopChain.ts';
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
  // Per-fieldKey list of primaries currently carrying it — drives the Riding column.
  const passengerRides = usePassengerRides('kf', productId);
  // Per-primary list of passengers it's actively carrying — drives the Passengers column.
  const activePassengers = useActivePassengers('kf', productId);

  // ── Filter state ────────────────────────────────────────────────────
  const { filters, updateFilter, resetFilters, hasActiveFilters } = useKeyFinderFilters(category, productId);

  // ── Per-group Loop chain state (declared before `grouped` so the selector
  // can synthesize Loop-queued status for keys waiting in a chain). Each group
  // runs its own chain independently — Loop All Groups just fires Loop Group
  // on every group.
  type GroupChainState = {
    readonly keys: readonly string[];
    readonly currentIndex: number; // -1 before first fire
  };
  const [loopChains, setLoopChains] = useState<ReadonlyMap<string, GroupChainState>>(new Map());
  const chainQueuedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const chain of loopChains.values()) {
      const startIdx = chain.currentIndex + 1; // -1 → 0 (pre-start: all queued)
      for (let i = startIdx; i < chain.keys.length; i += 1) set.add(chain.keys[i]);
    }
    return set;
  }, [loopChains]);

  // ── Selector: merged groups + totals ────────────────────────────────
  const grouped = useMemo(
    () => selectKeyFinderGroupedRows({
      layout: layout?.rows,
      summary,
      reserved: reservedData?.reserved,
      runningSet: runningFieldKeys,
      opStates: keyFieldOpStates,
      passengerRides,
      activePassengers,
      chainQueuedKeys,
      filters,
    }),
    [layout, summary, reservedData, runningFieldKeys, keyFieldOpStates, passengerRides, activePassengers, chainQueuedKeys, filters],
  );

  // Ref to latest grouped state — runLoopChain's isResolved closure reads
  // through this each iteration so mid-chain published-by-passenger keys
  // are skipped on their slot instead of wasting a Loop call.
  const groupedRef = useRef(grouped);
  useEffect(() => { groupedRef.current = grouped; }, [grouped]);

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

  // ── Per-key Unresolve + Delete (KeyRow destructive actions) ────────
  // Unresolve demotes the published value back to candidate (reversible).
  // Delete wipes every trace for the key (candidates, evidence, URL/query
  // history, per-run selections). Both route through the shared
  // FinderDeleteConfirmModal so the destructive-UX is consistent with
  // SKU/RDF/Run History delete flows. Server-side 409 gate on in-flight ops.
  const unresolveMut = useUnresolveKeyMutation(category, productId);
  const deleteKeyMut = useDeleteKeyMutation(category, productId);
  const [keyDeleteTarget, setKeyDeleteTarget] = useState<DeleteTarget | null>(null);

  const handleUnresolveKey = useCallback((fieldKey: string) => {
    setKeyDeleteTarget({ kind: 'key-unresolve', fieldKey });
  }, []);

  const handleDeleteKey = useCallback((fieldKey: string) => {
    setKeyDeleteTarget({ kind: 'key-delete', fieldKey });
  }, []);

  const handleUnresolveGroup = useCallback((groupName: string) => {
    const group = grouped.groups.find((g) => g.name === groupName);
    if (!group) return;
    const fieldKeys = group.keys.filter((k) => k.published).map((k) => k.field_key);
    if (fieldKeys.length === 0) return;
    setKeyDeleteTarget({ kind: 'key-unresolve-group', fieldKeys, label: groupName, count: fieldKeys.length });
  }, [grouped.groups]);

  const handleDeleteGroup = useCallback((groupName: string) => {
    const group = grouped.groups.find((g) => g.name === groupName);
    if (!group) return;
    const fieldKeys = group.keys
      .filter((k) => k.run_count > 0 || k.candidate_count > 0 || k.published)
      .map((k) => k.field_key);
    if (fieldKeys.length === 0) return;
    setKeyDeleteTarget({ kind: 'key-delete-group', fieldKeys, label: groupName, count: fieldKeys.length });
  }, [grouped.groups]);

  const handleUnresolveAll = useCallback(() => {
    const fieldKeys = grouped.groups
      .flatMap((g) => g.keys)
      .filter((k) => k.published)
      .map((k) => k.field_key);
    if (fieldKeys.length === 0) return;
    setKeyDeleteTarget({ kind: 'key-unresolve-all', fieldKeys, count: fieldKeys.length });
  }, [grouped.groups]);

  const handleDeleteAll = useCallback(() => {
    const fieldKeys = grouped.groups
      .flatMap((g) => g.keys)
      .filter((k) => k.run_count > 0 || k.candidate_count > 0 || k.published)
      .map((k) => k.field_key);
    if (fieldKeys.length === 0) return;
    setKeyDeleteTarget({ kind: 'key-delete-all', fieldKeys, count: fieldKeys.length });
  }, [grouped.groups]);

  const isKeyOpPending = unresolveMut.isPending || deleteKeyMut.isPending;
  const handleConfirmKeyOp = useCallback(() => {
    if (!keyDeleteTarget) return;
    const kind = keyDeleteTarget.kind;
    const dismiss = () => setKeyDeleteTarget(null);
    const onError = (err: Error) => {
      setKeyDeleteTarget(null);
      const verb = kind.startsWith('key-unresolve') ? 'Unresolve' : 'Delete';
      window.alert(`${verb} failed: ${err.message}`);
    };

    // Single-key ops await the mutation so the modal shows pending state then
    // dismisses on success. Bulk ops fan out N fire-and-forget mutations and
    // dismiss immediately — per-key WS events drive the UI updates as each
    // completes. Any 409 key_busy is silently skipped at the per-key level.
    if (kind === 'key-unresolve' && keyDeleteTarget.fieldKey) {
      unresolveMut.mutate({ fieldKey: keyDeleteTarget.fieldKey }, { onSuccess: dismiss, onError });
    } else if (kind === 'key-delete' && keyDeleteTarget.fieldKey) {
      deleteKeyMut.mutate({ fieldKey: keyDeleteTarget.fieldKey }, { onSuccess: dismiss, onError });
    } else if ((kind === 'key-unresolve-group' || kind === 'key-unresolve-all') && keyDeleteTarget.fieldKeys) {
      for (const fieldKey of keyDeleteTarget.fieldKeys) unresolveMut.mutate({ fieldKey });
      dismiss();
    } else if ((kind === 'key-delete-group' || kind === 'key-delete-all') && keyDeleteTarget.fieldKeys) {
      for (const fieldKey of keyDeleteTarget.fieldKeys) deleteKeyMut.mutate({ fieldKey });
      dismiss();
    }
  }, [keyDeleteTarget, unresolveMut, deleteKeyMut]);

  // Counts for disable-state on group / panel-level bulk buttons.
  const publishedCountInGroup = useCallback((groupName: string) => {
    return grouped.groups.find((g) => g.name === groupName)?.keys.filter((k) => k.published).length ?? 0;
  }, [grouped.groups]);
  const dataCountInGroup = useCallback((groupName: string) => {
    return grouped.groups.find((g) => g.name === groupName)?.keys
      .filter((k) => k.run_count > 0 || k.candidate_count > 0 || k.published).length ?? 0;
  }, [grouped.groups]);
  const publishedCountAll = useMemo(() => {
    return grouped.groups.flatMap((g) => g.keys).filter((k) => k.published).length;
  }, [grouped.groups]);
  const dataCountAll = useMemo(() => {
    return grouped.groups.flatMap((g) => g.keys)
      .filter((k) => k.run_count > 0 || k.candidate_count > 0 || k.published).length;
  }, [grouped.groups]);

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

  const fireLoopChainForGroup = useCallback(async (
    groupName: string,
    sorted: ReadonlyArray<{ readonly field_key: string }>,
  ) => {
    if (sorted.length === 0) return;
    const keys = sorted.map((k) => k.field_key);
    // Pre-stamp chain so every key renders Queued on first paint
    setLoopChains((prev) => new Map(prev).set(groupName, { keys, currentIndex: -1 }));

    await runLoopChain({
      keys,
      // Re-read through groupedRef so a key resolved mid-chain (e.g. via a
      // prior iteration's passenger) skips its slot instead of re-Looping.
      isResolved: (fk) => {
        const group = groupedRef.current.groups.find((g) => g.name === groupName);
        const entry = group?.keys.find((k) => k.field_key === fk);
        return Boolean(entry && (entry.last_status === 'resolved' || entry.published));
      },
      fireOne: (fk) => new Promise<string>((resolve) => {
        fire(
          `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
          { field_key: fk, mode: 'loop' },
          { fieldKey: fk, subType: 'loop', onDispatched: (id) => resolve(id) },
        );
      }),
      awaitTerminal: awaitOperationTerminal,
      onStep: ({ index }) => {
        setLoopChains((prev) => new Map(prev).set(groupName, { keys, currentIndex: index }));
      },
    });

    // Chain complete — remove this group's entry from the map
    setLoopChains((prev) => {
      const next = new Map(prev);
      next.delete(groupName);
      return next;
    });
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
    if (loopChains.has(groupName)) return; // chain already active for this group
    const group = grouped.groups.find((g) => g.name === groupName);
    if (!group) return;
    const unresolved = group.keys.filter((k) => k.last_status !== 'resolved' && !k.published);
    const sorted = sortKeysByPriority(unresolved);
    void fireLoopChainForGroup(groupName, sorted);
  }, [loopChains, grouped.groups, fireLoopChainForGroup]);

  const loopAllGroups = useCallback(() => {
    // Fan out — fire a chain for every group that isn't already chaining.
    // Each group runs its own chain independently; user sees 1 Loop running per
    // group + the rest of that group's keys rendered as Queued.
    for (const group of grouped.groups) {
      if (loopChains.has(group.name)) continue;
      const unresolved = group.keys.filter((k) => k.last_status !== 'resolved' && !k.published);
      const sorted = sortKeysByPriority(unresolved);
      if (sorted.length === 0) continue;
      void fireLoopChainForGroup(group.name, sorted);
    }
  }, [grouped.groups, loopChains, fireLoopChainForGroup]);

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
              intent={LIVE_MODES.productLoop ? 'spammable' : 'locked'}
              label="Loop all groups"
              onClick={loopAllGroups}
              disabled={!LIVE_MODES.productLoop}
              title={LIVE_MODES.productLoop ? TOOLTIPS.productLoop : DISABLED_REASONS.productLoop}
              width={ACTION_BUTTON_WIDTH.keyHeader}
            />
            <div style={{ width: 1, height: 16, background: 'var(--sf-token-border, #dee2e6)' }} />
            <HeaderActionButton
              intent={publishedCountAll === 0 ? 'locked' : 'delete'}
              label="Unresolve all"
              onClick={handleUnresolveAll}
              disabled={publishedCountAll === 0}
              title={publishedCountAll === 0
                ? 'Nothing to unresolve — no published keys in view.'
                : `Demote all ${publishedCountAll} published key(s) back to candidate. Reversible.`}
              width={ACTION_BUTTON_WIDTH.keyHeader}
            />
            <HeaderActionButton
              intent={dataCountAll === 0 ? 'locked' : 'delete'}
              label="Delete all"
              onClick={handleDeleteAll}
              disabled={dataCountAll === 0}
              title={dataCountAll === 0
                ? 'Nothing to delete — no keys with runs, candidates, or published values.'
                : `Wipe every trace of ${dataCountAll} key(s) across every group. Not reversible.`}
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
                  const chain = loopChains.get(g.name);
                  // Keys 0..currentIndex-1 are done, currentIndex is running,
                  // currentIndex+1..N-1 are queued. Progress = current position
                  // (1-indexed) / total. Pre-start (currentIndex=-1) → 0/N.
                  const groupChain = chain
                    ? { current: Math.max(0, chain.currentIndex) + 1, total: chain.keys.length }
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
                      onUnresolveKey={handleUnresolveKey}
                      onDeleteKey={handleDeleteKey}
                      onUnresolveGroup={handleUnresolveGroup}
                      onDeleteGroup={handleDeleteGroup}
                      publishedCount={publishedCountInGroup(g.name)}
                      dataCount={dataCountInGroup(g.name)}
                      onRunGroup={runGroup}
                      onLoopGroup={loopGroup}
                      loopChainProgress={groupChain}
                    />
                  );
                })}
              </div>
            )}
          </FinderSectionCard>

          <KeyRunHistorySection category={category} productId={productId} />
        </div>
      )}

      {keyDeleteTarget && (
        <FinderDeleteConfirmModal
          target={keyDeleteTarget}
          onConfirm={handleConfirmKeyOp}
          onCancel={() => setKeyDeleteTarget(null)}
          isPending={isKeyOpPending}
          moduleLabel="Key Finder"
          confirmLabel={keyDeleteTarget.kind.startsWith('key-unresolve') ? 'Unresolve' : 'Delete'}
        />
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
