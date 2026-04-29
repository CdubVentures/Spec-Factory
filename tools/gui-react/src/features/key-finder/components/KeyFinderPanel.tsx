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
import { useRunningFieldKeys, useKeyFieldOpStates, usePassengerRides, useActivePassengers, awaitPassengersRegistered, awaitOperationTerminal } from '../../operations/hooks/useFinderOperations.ts';
import { useFireAndForget } from '../../operations/hooks/useFireAndForget.ts';
import {
  getIndexingPanelCollapsedDefault,
  IndexingPanelHeader,
} from '../../../shared/ui/finder/index.ts';
import { DiscoveryHistoryButton } from '../../../shared/ui/finder/DiscoveryHistoryButton.tsx';
import { FinderKpiCard } from '../../../shared/ui/finder/FinderKpiCard.tsx';
import { HeaderActionButton, ACTION_BUTTON_WIDTH } from '../../../shared/ui/actionButton/index.ts';
import { FinderSectionCard } from '../../../shared/ui/finder/FinderSectionCard.tsx';
import { PromptPreviewModal } from '../../../shared/ui/finder/PromptPreviewModal.tsx';
import { FinderDeleteConfirmModal } from '../../../shared/ui/finder/FinderDeleteConfirmModal.tsx';
import { PromptDrawerChevron } from '../../../shared/ui/finder/PromptDrawerChevron.tsx';
import type { DeleteTarget } from '../../../shared/ui/finder/types.ts';
import { usePersistedToggle, useCollapseStore } from '../../../stores/collapseStore.ts';
import type { ReviewLayout } from '../../../types/review.ts';
import { usePromptPreviewQuery } from '../../indexing/api/promptPreviewQueries.ts';
import type { PromptPreviewRequestBody } from '../../indexing/api/promptPreviewTypes.ts';
import {
  useReservedKeysQuery,
  useKeyFinderSummaryQuery,
  useKeyFinderBundlingConfigQuery,
  useUnpublishKeyMutation,
  useDeleteKeyMutation,
} from '../api/keyFinderQueries.ts';
import { useKeyFinderFilters } from '../state/keyFinderFilters.ts';
import { selectKeyFinderGroupedRows, parseAxisOrder } from '../state/keyFinderGroupedRows.ts';
import {
  createKeyPromptPreviewState,
  resolveKeyPromptPassengerSnapshot,
  type KeyPromptPreviewState,
} from '../state/keyFinderPromptPreviewSnapshot.ts';
import {
  formatKeyFinderDestructiveBatchFailure,
  runKeyFinderDestructiveBatch,
} from '../state/keyFinderDestructiveBatch.ts';
import { runLoopChain } from '../state/runLoopChain.ts';
import {
  GLOBAL_LOOP_CHAIN_ID,
  buildLoopAllDispatchKeys,
  buildLoopGroupDispatchKeys,
  buildRunAllDispatchKeys,
  buildRunGroupDispatchKeys,
} from '../state/keyFinderBulkDispatch.ts';
import {
  isComponentIdentityChildKey,
  isKeyRunBlocked,
} from '../state/componentKeyRunGuards.ts';
import { KeyFinderToolbar } from './KeyFinderToolbar.tsx';
import { KeyGroupSection } from './KeyGroupSection.tsx';
import { KeyModelStrip } from './KeyModelStrip.tsx';
import { KeyBundlingStrip } from './KeyBundlingStrip.tsx';
import { KeyRunHistorySection } from './KeyRunHistorySection.tsx';
import { LIVE_MODES, DISABLED_REASONS, TOOLTIPS, type KeyFinderSummaryRow } from '../types.ts';

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

  // ── Loop chain state (declared before `grouped` so the selector can
  // synthesize Loop-queued status for keys waiting in a chain). Only one chain
  // should be active at a time: either one group-local line or the global
  // Loop All Groups line.
  type LoopChainState = {
    readonly keys: readonly string[];
    readonly currentIndex: number; // -1 before first fire
  };
  const [loopChains, setLoopChains] = useState<ReadonlyMap<string, LoopChainState>>(new Map());
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
  const summaryQueryKey = useMemo(
    () => ['key-finder', category, productId, 'summary'] as const,
    [category, productId],
  );
  const fetchLatestSummary = useCallback(async (): Promise<readonly KeyFinderSummaryRow[]> => {
    const rows = await api.get<readonly KeyFinderSummaryRow[]>(
      `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/summary`,
    );
    queryClient.setQueryData(summaryQueryKey, rows);
    return rows;
  }, [category, productId, queryClient, summaryQueryKey]);

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
  const unpubMut = useUnpublishKeyMutation(category, productId);
  const deleteKeyMut = useDeleteKeyMutation(category, productId);
  const [keyDeleteTarget, setKeyDeleteTarget] = useState<DeleteTarget | null>(null);
  const [keyBulkOpPending, setKeyBulkOpPending] = useState(false);

  const handleUnpubKey = useCallback((fieldKey: string) => {
    setKeyDeleteTarget({ kind: 'key-unpublish', fieldKey });
  }, []);

  const handleDeleteKey = useCallback((fieldKey: string) => {
    setKeyDeleteTarget({ kind: 'key-delete', fieldKey });
  }, []);

  const handleUnpubGroup = useCallback((groupName: string) => {
    const group = grouped.groups.find((g) => g.name === groupName);
    if (!group) return;
    const fieldKeys = group.keys.filter((k) => k.published).map((k) => k.field_key);
    if (fieldKeys.length === 0) return;
    setKeyDeleteTarget({ kind: 'key-unpublish-group', fieldKeys, label: groupName, count: fieldKeys.length });
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

  const handleUnpubAll = useCallback(() => {
    const fieldKeys = grouped.groups
      .flatMap((g) => g.keys)
      .filter((k) => k.published)
      .map((k) => k.field_key);
    if (fieldKeys.length === 0) return;
    setKeyDeleteTarget({ kind: 'key-unpublish-all', fieldKeys, count: fieldKeys.length });
  }, [grouped.groups]);

  const handleDeleteAll = useCallback(() => {
    const fieldKeys = grouped.groups
      .flatMap((g) => g.keys)
      .filter((k) => k.run_count > 0 || k.candidate_count > 0 || k.published)
      .map((k) => k.field_key);
    if (fieldKeys.length === 0) return;
    setKeyDeleteTarget({ kind: 'key-delete-all', fieldKeys, count: fieldKeys.length });
  }, [grouped.groups]);

  const isKeyOpPending = keyBulkOpPending || unpubMut.isPending || deleteKeyMut.isPending;
  const handleConfirmKeyOp = useCallback(() => {
    if (!keyDeleteTarget) return;
    const kind = keyDeleteTarget.kind;
    const dismiss = () => setKeyDeleteTarget(null);
    const onError = (err: unknown) => {
      setKeyDeleteTarget(null);
      const verb = kind.startsWith('key-unpublish') ? 'Unpub' : 'Delete';
      const message = err instanceof Error ? err.message : String(err || 'Unknown error');
      window.alert(`${verb} failed: ${message}`);
    };

    // Single-key ops await the mutation so the modal shows pending state then
    // dismisses on success. Bulk ops keep the modal pending until every key
    // settles, then surface any busy/failed keys instead of looking inert.
    if (kind === 'key-unpublish' && keyDeleteTarget.fieldKey) {
      void unpubMut.mutateAsync({ fieldKey: keyDeleteTarget.fieldKey })
        .then(dismiss)
        .catch(onError);
    } else if (kind === 'key-delete' && keyDeleteTarget.fieldKey) {
      void deleteKeyMut.mutateAsync({ fieldKey: keyDeleteTarget.fieldKey })
        .then(dismiss)
        .catch(onError);
    } else if ((kind === 'key-unpublish-group' || kind === 'key-unpublish-all') && keyDeleteTarget.fieldKeys) {
      void (async () => {
        setKeyBulkOpPending(true);
        try {
          const result = await runKeyFinderDestructiveBatch({
            fieldKeys: keyDeleteTarget.fieldKeys ?? [],
            mutate: unpubMut.mutateAsync,
          });
          if (result.failed.length > 0) {
            window.alert(formatKeyFinderDestructiveBatchFailure('Unpub', result));
          }
          dismiss();
        } finally {
          setKeyBulkOpPending(false);
        }
      })();
    } else if ((kind === 'key-delete-group' || kind === 'key-delete-all') && keyDeleteTarget.fieldKeys) {
      void (async () => {
        setKeyBulkOpPending(true);
        try {
          const result = await runKeyFinderDestructiveBatch({
            fieldKeys: keyDeleteTarget.fieldKeys ?? [],
            mutate: deleteKeyMut.mutateAsync,
          });
          if (result.failed.length > 0) {
            window.alert(formatKeyFinderDestructiveBatchFailure('Delete', result));
          }
          dismiss();
        } finally {
          setKeyBulkOpPending(false);
        }
      })();
    }
  }, [keyDeleteTarget, unpubMut, deleteKeyMut]);

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
  // Preview is always Loop-shape — it shows the compiled prompt the next
  // Loop iteration would dispatch (with passengers). Live Run dispatches may
  // still be solo under alwaysSoloRun=true; the preview intentionally shows
  // the "full potential bundle" so users can always inspect the passenger set.
  const [promptState, setPromptState] = useState<KeyPromptPreviewState | null>(null);
  const openKeyPrompt = useCallback((fieldKey: string) => {
    setPromptState(createKeyPromptPreviewState(groupedRef.current.groups, fieldKey));
  }, []);
  const closePrompt = useCallback(() => setPromptState(null), []);
  const promptPassengerSnapshot = useMemo(() => {
    return resolveKeyPromptPassengerSnapshot(grouped.groups, promptState);
  }, [grouped.groups, promptState]);
  const promptPreviewBody = useMemo<PromptPreviewRequestBody>(() => ({
    field_key: promptState?.fieldKey ?? '',
    mode: 'loop',
    passenger_field_keys_snapshot: promptPassengerSnapshot,
  }), [promptState?.fieldKey, promptPassengerSnapshot]);
  const promptPreviewQuery = usePromptPreviewQuery(
    'key',
    category,
    productId,
    promptPreviewBody,
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

  // ── Group / All dispatch handlers (Stage C 2026-04-22) ───────────────
  // Bulk actions dispatch one sorted line using the Pipeline Settings
  // bundlingSortAxisOrder knob. Each Run dispatch waits until the server has
  // registered its primary/passengers before the next dispatch computes its
  // bundle, so cross-group ride-along avoidance has live registry state.
  const { data: bundlingConfig } = useKeyFinderBundlingConfigQuery(category, productId);
  const alwaysSoloRun = bundlingConfig?.alwaysSoloRun ?? true;
  // Parsed once per bundlingConfig change — Loop chain sort uses this order so
  // it matches the backend bundler. Falls back to the default axis order when
  // the endpoint hasn't responded yet.
  const sortAxisOrder = useMemo(
    () => parseAxisOrder(bundlingConfig?.sortAxisOrder ?? ''),
    [bundlingConfig?.sortAxisOrder],
  );

  // Stage 3 — registration-sequential bulk Run dispatch.
  // We need the N-th POST's buildPassengers to see the (N-1)-th's primary +
  // passengers in the in-flight registry. Firing with onDispatched captures
  // the real opId as soon as the 202 lands, then awaitPassengersRegistered
  // blocks until the server emits the passengersRegistered flag on that opId.
  // Execution itself stays overlapping — we only gate DISPATCH order.
  // Timeout fallback prevents a flaky server from deadlocking the chain.
  const rowFromSummary = useCallback((
    rows: readonly KeyFinderSummaryRow[],
    fieldKey: string,
  ): KeyFinderSummaryRow | null => rows.find((row) => row.field_key === fieldKey) ?? null, []);

  const groupedKey = useCallback((fieldKey: string) => groupedRef.current.groups
    .flatMap((group) => group.keys)
    .find((key) => key.field_key === fieldKey) ?? null, []);

  const isKeyResolved = useCallback((fieldKey: string, rows: readonly KeyFinderSummaryRow[] = summary ?? []) => {
    const row = rowFromSummary(rows, fieldKey);
    if (row) return row.last_status === 'resolved' || row.published === true;
    const entry = groupedKey(fieldKey);
    return Boolean(entry && (entry.last_status === 'resolved' || entry.published));
  }, [groupedKey, rowFromSummary, summary]);

  const isKeyBlocked = useCallback((fieldKey: string, rows: readonly KeyFinderSummaryRow[] = summary ?? []) => {
    const row = rowFromSummary(rows, fieldKey);
    if (row) return isKeyRunBlocked(row);
    const entry = groupedKey(fieldKey);
    return Boolean(entry && isKeyRunBlocked(entry));
  }, [groupedKey, rowFromSummary, summary]);

  const hasRemainingIdentityDependents = useCallback((
    parentFieldKey: string,
    remainingKeys: readonly string[],
    rows: readonly KeyFinderSummaryRow[] = summary ?? [],
  ) => {
    const remaining = new Set(remainingKeys);
    const sourceRows = rows.length > 0 ? rows : groupedRef.current.groups.flatMap((group) => group.keys);
    return sourceRows.some((row) => (
      remaining.has(row.field_key)
      && isComponentIdentityChildKey(row)
      && row.component_parent_key === parentFieldKey
    ));
  }, [summary]);

  const runKeysSequential = useCallback(async (keys: readonly string[]) => {
    let latestSummary = summary ?? [];
    for (let index = 0; index < keys.length; index += 1) {
      const fk = keys[index];
      if (isKeyBlocked(fk, latestSummary)) continue;
      let resolveDispatched: ((id: string) => void) | null = null;
      const dispatched = new Promise<string>((resolve) => { resolveDispatched = resolve; });
      fire(
        `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
        { field_key: fk, mode: 'run' },
        { fieldKey: fk, onDispatched: (id) => resolveDispatched?.(id) },
      );
      const opId = await dispatched;
      await awaitPassengersRegistered(opId);
      if (hasRemainingIdentityDependents(fk, keys.slice(index + 1), latestSummary)) {
        const status = await awaitOperationTerminal(opId);
        if (status === 'cancelled') break;
        latestSummary = await fetchLatestSummary().catch(() => latestSummary);
      }
    }
  }, [fire, category, productId, summary, isKeyBlocked, hasRemainingIdentityDependents, fetchLatestSummary]);

  const fireLoopChain = useCallback(async (
    chainId: string,
    keys: readonly string[],
  ) => {
    if (keys.length === 0) return;
    // Pre-stamp chain so every key renders Queued on first paint
    setLoopChains((prev) => new Map(prev).set(chainId, { keys, currentIndex: -1 }));
    let latestSummary = summary ?? [];

    await runLoopChain({
      keys,
      // Re-read through groupedRef so a key resolved mid-chain (e.g. via a
      // prior iteration's passenger) skips its slot instead of re-Looping.
      isResolved: (fk) => isKeyResolved(fk, latestSummary),
      isBlocked: (fk) => isKeyBlocked(fk, latestSummary),
      fireOne: (fk) => new Promise<string>((resolve) => {
        fire(
          `/key-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}`,
          { field_key: fk, mode: 'loop' },
          { fieldKey: fk, subType: 'loop', onDispatched: (id) => resolve(id) },
        );
      }),
      awaitTerminal: async (opId) => {
        const status = await awaitOperationTerminal(opId);
        if (status !== 'cancelled') {
          latestSummary = await fetchLatestSummary().catch(() => latestSummary);
        }
        return status;
      },
      onStep: ({ index }) => {
        setLoopChains((prev) => new Map(prev).set(chainId, { keys, currentIndex: index }));
      },
    });

    // Chain complete — remove this entry from the map.
    setLoopChains((prev) => {
      const next = new Map(prev);
      next.delete(chainId);
      return next;
    });
  }, [fire, category, productId, summary, isKeyResolved, isKeyBlocked, fetchLatestSummary]);

  const runGroup = useCallback((groupName: string) => {
    const keys = buildRunGroupDispatchKeys(grouped.groups, groupName, sortAxisOrder);
    void runKeysSequential(keys);
  }, [grouped.groups, sortAxisOrder, runKeysSequential]);

  const runAllGroups = useCallback(() => {
    const keys = buildRunAllDispatchKeys(grouped.groups, sortAxisOrder);
    void runKeysSequential(keys);
  }, [grouped.groups, sortAxisOrder, runKeysSequential]);

  const loopGroup = useCallback((groupName: string) => {
    if (loopChains.size > 0) return; // one sorted Loop line at a time
    const keys = buildLoopGroupDispatchKeys(grouped.groups, groupName, sortAxisOrder);
    void fireLoopChain(groupName, keys);
  }, [loopChains, grouped.groups, sortAxisOrder, fireLoopChain]);

  const loopAllGroups = useCallback(() => {
    if (loopChains.size > 0) return; // one sorted Loop line at a time
    const keys = buildLoopAllDispatchKeys(grouped.groups, sortAxisOrder);
    void fireLoopChain(GLOBAL_LOOP_CHAIN_ID, keys);
  }, [grouped.groups, loopChains, sortAxisOrder, fireLoopChain]);

  const [collapsed, toggleCollapsed] = usePersistedToggle(
    `indexing:key:collapsed:${productId}`,
    getIndexingPanelCollapsedDefault('key'),
  );
  const anyRunning = runningFieldKeys.size > 0;
  const globalLoopChain = loopChains.get(GLOBAL_LOOP_CHAIN_ID);
  const productLoopProgress = globalLoopChain
    ? { current: Math.max(0, globalLoopChain.currentIndex) + 1, total: globalLoopChain.keys.length }
    : null;

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
              intent="locked"
              label={productLoopProgress ? `Loop (${productLoopProgress.current}/${productLoopProgress.total})` : 'Loop all groups'}
              onClick={loopAllGroups}
              disabled={!LIVE_MODES.productLoop}
              busy={loopChains.size > 0}
              title={LIVE_MODES.productLoop ? TOOLTIPS.productLoop : DISABLED_REASONS.productLoop}
              width={ACTION_BUTTON_WIDTH.keyHeader}
            />
            <span className="inline-block h-5 w-px mx-0.5 bg-current opacity-20" aria-hidden />
            <PromptDrawerChevron
              storageKey={`key-finder:panel-drawer:${productId}`}
              openWidthClass="w-[46rem]"
              drawerHeight="header"
              ariaLabel="History + destructive actions for every key"
              closedTitle="Show Hist / actions for every key"
              openedTitle="Hide Hist / actions for every key"
              openTitle="Hist:"
              labelClass="sf-history-label"
              primaryCustom={
                <DiscoveryHistoryButton
                  finderId="keyFinder"
                  productId={productId}
                  category={category}
                  width={ACTION_BUTTON_WIDTH.keyHeader}
                />
              }
              secondaryActions={[
                {
                  label: 'Unpub all',
                  onClick: handleUnpubAll,
                  disabled: publishedCountAll === 0,
                  intent: publishedCountAll === 0 ? 'locked' : 'delete',
                  width: ACTION_BUTTON_WIDTH.keyHeader,
                  title: publishedCountAll === 0
                    ? 'Nothing to unpublish — no published keys in view.'
                    : `Demote all ${publishedCountAll} published key(s) back to candidate. Reversible.`,
                },
                {
                  label: 'Delete all',
                  onClick: handleDeleteAll,
                  disabled: dataCountAll === 0,
                  intent: dataCountAll === 0 ? 'locked' : 'delete',
                  width: ACTION_BUTTON_WIDTH.keyHeader,
                  title: dataCountAll === 0
                    ? 'Nothing to delete — no keys with runs, candidates, or published values.'
                    : `Wipe every trace of ${dataCountAll} key(s) across every group. Not reversible.`,
                },
              ]}
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
                  const loopBlockedByChain = loopChains.size > 0 && !chain;
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
                      onUnpubKey={handleUnpubKey}
                      onDeleteKey={handleDeleteKey}
                      onUnpubGroup={handleUnpubGroup}
                      onDeleteGroup={handleDeleteGroup}
                      publishedCount={publishedCountInGroup(g.name)}
                      dataCount={dataCountInGroup(g.name)}
                      onRunGroup={runGroup}
                      onLoopGroup={loopGroup}
                      loopChainProgress={groupChain}
                      loopBlockedByChain={loopBlockedByChain}
                      alwaysSoloRun={alwaysSoloRun}
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
          confirmLabel={keyDeleteTarget.kind.startsWith('key-unpublish') ? 'Unpub' : 'Delete'}
        />
      )}

      <PromptPreviewModal
        open={Boolean(promptState)}
        onClose={closePrompt}
        query={promptPreviewQuery}
        title={promptState ? `Prompt preview — ${promptState.fieldKey}` : ''}
        subtitle="Compiled prompt the next Loop iteration would dispatch (includes passengers). Run dispatches are solo when alwaysSoloRun is ON — preview always shows the full potential bundle."
        storageKeyPrefix={`key-prompt-preview:${category}:${productId}:${promptState?.fieldKey ?? ''}`}
      />
    </div>
  );
});
