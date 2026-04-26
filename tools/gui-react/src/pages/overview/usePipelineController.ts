import { useCallback, useRef, useState } from 'react';
import { api } from '../../api/client.ts';
import { useOperationsStore } from '../../features/operations/state/operationsStore.ts';
import { useReservedKeysQuery } from '../../features/key-finder/api/keyFinderQueries.ts';
import { parseCatalogRows } from '../../features/catalog/api/catalogParsers.ts';
import type { CatalogRow } from '../../types/product.ts';
import {
  useBulkFire,
  dispatchCefRun,
  dispatchPifDependencyRun,
  dispatchPifLoop,
  dispatchPifEval,
  dispatchRdfRun,
  dispatchSkuRun,
  dispatchKfPipelineBucket,
  type BulkFireFn,
  type BulkFireParams,
  type BulkDispatchOptions,
  type BulkDispatchResult,
} from './bulkDispatch.ts';
import {
  PIPELINE_STAGES,
  getPipelineStage,
  type PipelineStage,
  type PipelineStageId,
  type PipelineStageKind,
} from './pipelinePlan.ts';
import { useOverviewPipelineProgressStore } from './overviewPipelineProgressStore.ts';

export { PIPELINE_STAGES } from './pipelinePlan.ts';
export type { PipelineStage, PipelineStageId, PipelineStageKind } from './pipelinePlan.ts';

type TerminalStatus = 'done' | 'error' | 'cancelled';
type OpStatus = TerminalStatus | 'queued' | 'running';
type PipelineStageRuntimeStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

const TERMINAL_STATUSES: readonly TerminalStatus[] = ['done', 'error', 'cancelled'];

function isTerminal(status: OpStatus | undefined): boolean {
  return status !== undefined && (TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Resolves when every opId in `opIds` has reached a terminal status
 * (`done` / `error` / `cancelled`). Rejects on `signal` abort or `timeoutMs`
 * elapsed. Returns a map of opId -> final status for the caller to classify
 * failures.
 */
export function waitForOperationsTerminal(
  opIds: readonly string[],
  signal: AbortSignal,
  timeoutMs: number = 15 * 60 * 1000,
): Promise<Map<string, TerminalStatus>> {
  return new Promise((resolve, reject) => {
    if (opIds.length === 0) {
      resolve(new Map());
      return;
    }

    const results = new Map<string, TerminalStatus>();
    let settled = false;

    const cleanup = () => {
      unsubscribe();
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };

    const check = () => {
      if (settled) return;
      const ops = useOperationsStore.getState().operations;
      for (const id of opIds) {
        if (results.has(id)) continue;
        const op = ops.get(id);
        if (!op) continue;
        if (isTerminal(op.status as OpStatus)) {
          results.set(id, op.status as TerminalStatus);
        }
      }
      if (results.size === opIds.length) {
        settled = true;
        cleanup();
        resolve(results);
      }
    };

    const unsubscribe = useOperationsStore.subscribe(check);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('pipeline_stage_timeout'));
    }, timeoutMs);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('pipeline_cancelled'));
    };
    signal.addEventListener('abort', onAbort);

    check();
  });
}

export interface PipelineStageRuntime {
  readonly status: PipelineStageRuntimeStatus;
  readonly opIds: ReadonlySet<string>;
  readonly terminalCount: number;
}

export type PipelineStatus = 'idle' | 'running' | 'cancelled' | 'done' | 'error';

export interface PipelineState {
  readonly status: PipelineStatus;
  readonly stageIndex: number;
  readonly stageOpIds: ReadonlySet<string>;
  readonly stageTerminalCount: number;
  readonly stageProgress: ReadonlyMap<PipelineStageId, PipelineStageRuntime>;
  readonly failedProducts: ReadonlyMap<string, { readonly stageIndex: number; readonly label: string }>;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
}

const INITIAL_STATE: PipelineState = Object.freeze({
  status: 'idle' as PipelineStatus,
  stageIndex: 0,
  stageOpIds: new Set<string>(),
  stageTerminalCount: 0,
  stageProgress: new Map(),
  failedProducts: new Map(),
  startedAt: null,
  endedAt: null,
});

function stageIndexOf(stageId: PipelineStageId): number {
  return PIPELINE_STAGES.findIndex((stage) => stage.id === stageId);
}

function emptyRuntime(status: PipelineStageRuntimeStatus): PipelineStageRuntime {
  return {
    status,
    opIds: new Set(),
    terminalCount: 0,
  };
}

function nextStageProgress(
  current: ReadonlyMap<PipelineStageId, PipelineStageRuntime>,
  stageId: PipelineStageId,
  runtime: PipelineStageRuntime,
): ReadonlyMap<PipelineStageId, PipelineStageRuntime> {
  const next = new Map(current);
  next.set(stageId, runtime);
  return next;
}

function productIds(products: readonly CatalogRow[]): readonly string[] {
  return products.map((product) => product.productId);
}

function hasPifDependencies(row: CatalogRow): boolean {
  return (row.pifDependencyMissingKeys ?? []).length > 0;
}

function byProductId(products: readonly CatalogRow[]): ReadonlyMap<string, CatalogRow> {
  return new Map(products.map((row) => [row.productId, row]));
}

async function refreshSelectedProducts(
  category: string,
  previous: readonly CatalogRow[],
): Promise<readonly CatalogRow[]> {
  if (previous.length === 0) return previous;
  try {
    const rows = await api.parsedGet(`/catalog/${encodeURIComponent(category)}`, parseCatalogRows);
    const latest = byProductId(rows);
    return previous.map((row) => latest.get(row.productId) ?? row);
  } catch {
    return previous;
  }
}

export async function dispatchPipelineStage({
  stage,
  category,
  products,
  fire,
  reservedKeys,
  options = {},
}: {
  readonly stage: PipelineStage;
  readonly category: string;
  readonly products: readonly CatalogRow[];
  readonly fire: BulkFireFn;
  readonly reservedKeys: ReadonlySet<string>;
  readonly options?: BulkDispatchOptions;
}): Promise<BulkDispatchResult> {
  switch (stage.kind) {
    case 'cef': return dispatchCefRun(category, products, fire, options);
    case 'pif-dep': return dispatchPifDependencyRun(category, products, fire, options);
    case 'pif-loop': return dispatchPifLoop(category, products, fire, options);
    case 'pif-eval': return dispatchPifEval(category, products, fire, options);
    case 'rdf-run': return dispatchRdfRun(category, products, fire, options);
    case 'sku-run': return dispatchSkuRun(category, products, fire, options);
    case 'kf-early': return dispatchKfPipelineBucket(category, products, reservedKeys, 'early', fire, options);
    case 'kf-context': return dispatchKfPipelineBucket(category, products, reservedKeys, 'contextual', fire, options);
  }
}

async function cancelOpsBestEffort(opIds: Iterable<string>): Promise<void> {
  const ids = Array.from(opIds);
  await Promise.all(ids.map((id) =>
    api.post(`/operations/${encodeURIComponent(id)}/cancel`, {}).catch(() => undefined),
  ));
}

interface StageOutcome {
  readonly operationIds: readonly string[];
  readonly erroredProductIds: ReadonlySet<string>;
}

export interface UsePipelineControllerResult {
  readonly state: PipelineState;
  readonly start: (products: readonly CatalogRow[]) => Promise<void>;
  readonly stop: () => void;
  readonly reset: () => void;
}

export function usePipelineController(category: string): UsePipelineControllerResult {
  const [state, setState] = useState<PipelineState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const fire = useBulkFire(category);
  const { data: reservedResp } = useReservedKeysQuery(category);

  const start = useCallback(async (products: readonly CatalogRow[]) => {
    if (products.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const reservedKeys = new Set(reservedResp?.reserved ?? []);
    const failed = new Map<string, { stageIndex: number; label: string }>();
    const progressStore = useOverviewPipelineProgressStore.getState();
    progressStore.initialize(category, productIds(products));

    setState({
      status: 'running',
      stageIndex: 0,
      stageOpIds: new Set(),
      stageTerminalCount: 0,
      stageProgress: new Map(PIPELINE_STAGES.map((stage) => [stage.id, emptyRuntime('pending')])),
      failedProducts: failed,
      startedAt: Date.now(),
      endedAt: null,
    });

    const runStage = async (
      stageId: PipelineStageId,
      stageProducts: readonly CatalogRow[],
    ): Promise<StageOutcome> => {
      const stage = getPipelineStage(stageId);
      const idsForProgress = productIds(stageProducts);
      const collected = new Set<string>();
      const opProductIds = new Map<string, string>();

      if (controller.signal.aborted) throw new Error('pipeline_cancelled');

      if (stageProducts.length === 0) {
        progressStore.markStage(category, productIds(products), stageId, 'skipped');
        setState((prev) => ({
          ...prev,
          stageIndex: stageIndexOf(stageId),
          stageProgress: nextStageProgress(prev.stageProgress, stageId, emptyRuntime('skipped')),
        }));
        return { operationIds: [], erroredProductIds: new Set() };
      }

      progressStore.markStage(category, idsForProgress, stageId, 'running');
      setState((prev) => ({
        ...prev,
        stageIndex: stageIndexOf(stageId),
        stageOpIds: collected,
        stageTerminalCount: 0,
        stageProgress: nextStageProgress(prev.stageProgress, stageId, {
          status: 'running',
          opIds: collected,
          terminalCount: 0,
        }),
      }));

      const collectOperationId = (id: string) => {
        if (collected.has(id)) return;
        collected.add(id);
        setState((prev) => ({
          ...prev,
          stageOpIds: new Set(collected),
          stageProgress: nextStageProgress(prev.stageProgress, stageId, {
            status: 'running',
            opIds: new Set(collected),
            terminalCount: prev.stageProgress.get(stageId)?.terminalCount ?? 0,
          }),
        }));
      };

      const pipelineFire: BulkFireFn = async (params: BulkFireParams) => {
        const operationId = await fire(params);
        opProductIds.set(operationId, params.productId);
        return operationId;
      };

      const watcher = useOperationsStore.subscribe(() => {
        const ops = useOperationsStore.getState().operations;
        let count = 0;
        for (const id of collected) {
          const op = ops.get(id);
          if (op && isTerminal(op.status as OpStatus)) count += 1;
        }
        setState((prev) => {
          const current = prev.stageProgress.get(stageId);
          if (prev.stageTerminalCount === count && current?.terminalCount === count) return prev;
          return {
            ...prev,
            stageTerminalCount: count,
            stageProgress: nextStageProgress(prev.stageProgress, stageId, {
              status: 'running',
              opIds: new Set(collected),
              terminalCount: count,
            }),
          };
        });
      });

      try {
        const dispatchResult = await dispatchPipelineStage({
          stage,
          category,
          products: stageProducts,
          fire: pipelineFire,
          reservedKeys,
          options: {
            signal: controller.signal,
            onOperationId: collectOperationId,
          },
        });

        for (const id of dispatchResult.operationIds) collectOperationId(id);
        if (dispatchResult.failures > 0) throw new Error('pipeline_stage_dispatch_failed');
        if (controller.signal.aborted) throw new Error('pipeline_cancelled');

        const results = await waitForOperationsTerminal(Array.from(collected), controller.signal);
        const erroredProductIds = new Set<string>();
        for (const [opId, status] of results) {
          if (status !== 'error') continue;
          const op = useOperationsStore.getState().operations.get(opId);
          const productId = op?.productId ?? opProductIds.get(opId);
          if (productId) erroredProductIds.add(productId);
        }

        for (const productId of erroredProductIds) {
          if (!failed.has(productId)) {
            failed.set(productId, { stageIndex: stageIndexOf(stageId), label: stage.label });
          }
        }

        const finalStatus: PipelineStageRuntimeStatus = erroredProductIds.size > 0
          ? 'error'
          : collected.size === 0
            ? 'skipped'
            : 'done';
        const successIds = idsForProgress.filter((productId) => !erroredProductIds.has(productId));
        if (successIds.length > 0) progressStore.markStage(category, successIds, stageId, finalStatus === 'skipped' ? 'skipped' : 'done');
        if (erroredProductIds.size > 0) progressStore.markStage(category, Array.from(erroredProductIds), stageId, 'error');

        setState((prev) => ({
          ...prev,
          stageTerminalCount: collected.size,
          failedProducts: new Map(failed),
          stageProgress: nextStageProgress(prev.stageProgress, stageId, {
            status: finalStatus,
            opIds: new Set(collected),
            terminalCount: collected.size,
          }),
        }));

        return { operationIds: Array.from(collected), erroredProductIds };
      } finally {
        watcher();
      }
    };

    let terminatedByAbort = false;

    try {
      const earlyKf = runStage('kf_early', products).then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const cef1 = await runStage('cef_1', products);
      const cef1Ready = products.filter((row) => !cef1.erroredProductIds.has(row.productId));
      const cef2 = await runStage('cef_2', cef1Ready);
      const cefFailed = new Set<string>([
        ...cef1.erroredProductIds,
        ...cef2.erroredProductIds,
      ]);

      const afterCef = await refreshSelectedProducts(
        category,
        products.filter((row) => !cefFailed.has(row.productId)),
      );

      const pifBranch = (async () => {
        const depOutcome = await runStage('pif_dep', afterCef.filter(hasPifDependencies));
        const afterDep = await refreshSelectedProducts(category, afterCef);
        const pifReady = afterDep
          .filter((row) => !hasPifDependencies(row))
          .filter((row) => !depOutcome.erroredProductIds.has(row.productId));
        const pifBlocked = afterDep.filter((row) =>
          hasPifDependencies(row) || depOutcome.erroredProductIds.has(row.productId),
        );

        if (pifBlocked.length > 0) {
          const blockedIds = productIds(pifBlocked);
          progressStore.markStage(category, blockedIds, 'pif_dep', 'error');
          progressStore.markStage(category, blockedIds, 'pif_loop', 'skipped');
          progressStore.markStage(category, blockedIds, 'pif_eval', 'skipped');
          for (const row of pifBlocked) {
            if (!failed.has(row.productId)) {
              failed.set(row.productId, {
                stageIndex: stageIndexOf('pif_dep'),
                label: getPipelineStage('pif_dep').label,
              });
            }
          }
          setState((prev) => ({ ...prev, failedProducts: new Map(failed) }));
        }

        const pifLoop = await runStage('pif_loop', pifReady);
        const pifEvalRows = pifReady.filter((row) => !pifLoop.erroredProductIds.has(row.productId));
        const pifEval = await runStage('pif_eval', pifEvalRows);
        return pifEvalRows.filter((row) => !pifEval.erroredProductIds.has(row.productId));
      })();

      const rdf = runStage('rdf_run', afterCef);
      const sku = runStage('sku_run', afterCef);
      const [pifContextRows, rdfOutcome, skuOutcome, earlyResult] = await Promise.all([pifBranch, rdf, sku, earlyKf]);
      if (!earlyResult.ok) throw earlyResult.error;
      const contextCandidates = pifContextRows
        .filter((row) => !rdfOutcome.erroredProductIds.has(row.productId))
        .filter((row) => !skuOutcome.erroredProductIds.has(row.productId));
      const contextCandidateIds = new Set(contextCandidates.map((row) => row.productId));
      const contextSkippedIds = products
        .filter((row) => !contextCandidateIds.has(row.productId))
        .map((row) => row.productId);
      if (contextSkippedIds.length > 0) {
        progressStore.markStage(category, contextSkippedIds, 'kf_context', 'skipped');
      }
      const afterContextDeps = await refreshSelectedProducts(
        category,
        contextCandidates,
      );
      await runStage('kf_context', afterContextDeps);
    } catch (err) {
      if ((err as Error).message === 'pipeline_cancelled') {
        terminatedByAbort = true;
      } else {
        setState((prev) => ({ ...prev, status: 'error', endedAt: Date.now() }));
        abortRef.current = null;
        return;
      }
    }

    setState((prev) => ({
      ...prev,
      status: terminatedByAbort ? 'cancelled' : 'done',
      endedAt: Date.now(),
    }));
    abortRef.current = null;
  }, [category, fire, reservedResp]);

  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    const current = useOperationsStore.getState();
    const activeIds = new Set<string>();
    for (const runtime of state.stageProgress.values()) {
      for (const id of runtime.opIds) activeIds.add(id);
    }
    for (const id of state.stageOpIds) activeIds.add(id);
    const inFlight: string[] = [];
    for (const id of activeIds) {
      const op = current.operations.get(id);
      if (op && !isTerminal(op.status as OpStatus)) inFlight.push(id);
    }
    void cancelOpsBestEffort(inFlight);
  }, [state.stageOpIds, state.stageProgress]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    useOverviewPipelineProgressStore.getState().clearCategory(category);
    setState(INITIAL_STATE);
  }, [category]);

  return { state, start, stop, reset };
}
