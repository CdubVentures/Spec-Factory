import { useCallback, useRef, useState } from 'react';
import { api } from '../../api/client.ts';
import { useOperationsStore } from '../../features/operations/state/operationsStore.ts';
import { useReservedKeysQuery } from '../../features/key-finder/api/keyFinderQueries.ts';
import type { CatalogRow } from '../../types/product.ts';
import {
  useBulkFire,
  dispatchCefRun,
  dispatchPifLoop,
  dispatchPifEval,
  dispatchRdfRun,
  dispatchSkuRun,
  dispatchKfAll,
  type BulkFireFn,
  type BulkDispatchOptions,
  type BulkDispatchResult,
} from './bulkDispatch.ts';

type TerminalStatus = 'done' | 'error' | 'cancelled';
type OpStatus = TerminalStatus | 'queued' | 'running';

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

export type PipelineStageKind =
  | 'cef'
  | 'pif-loop'
  | 'pif-eval'
  | 'rdf-run'
  | 'sku-run'
  | 'kf-loop';

export interface PipelineStage {
  readonly id: string;
  readonly label: string;
  readonly kind: PipelineStageKind;
}

export const PIPELINE_STAGES: readonly PipelineStage[] = Object.freeze([
  { id: 'cef_1', label: 'CEF run (1 of 2)', kind: 'cef' },
  { id: 'cef_2', label: 'CEF run (2 of 2)', kind: 'cef' },
  { id: 'pif_loop', label: 'PIF loop', kind: 'pif-loop' },
  { id: 'pif_eval', label: 'PIF eval', kind: 'pif-eval' },
  { id: 'rdf_run', label: 'RDF run', kind: 'rdf-run' },
  { id: 'sku_run', label: 'SKU run', kind: 'sku-run' },
  { id: 'kf_loop', label: 'KF loop (all keys)', kind: 'kf-loop' },
]);

export type PipelineStatus = 'idle' | 'running' | 'cancelled' | 'done' | 'error';

export interface PipelineState {
  readonly status: PipelineStatus;
  readonly stageIndex: number;
  readonly stageOpIds: ReadonlySet<string>;
  readonly stageTerminalCount: number;
  readonly failedProducts: ReadonlyMap<string, { readonly stageIndex: number; readonly label: string }>;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
}

const INITIAL_STATE: PipelineState = Object.freeze({
  status: 'idle' as PipelineStatus,
  stageIndex: 0,
  stageOpIds: new Set<string>(),
  stageTerminalCount: 0,
  failedProducts: new Map(),
  startedAt: null,
  endedAt: null,
});

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
    case 'pif-loop': return dispatchPifLoop(category, products, fire, options);
    case 'pif-eval': return dispatchPifEval(category, products, fire, options);
    case 'rdf-run': return dispatchRdfRun(category, products, fire, options);
    case 'sku-run': return dispatchSkuRun(category, products, fire, options);
    case 'kf-loop': return dispatchKfAll(category, products, reservedKeys, 'loop', fire, options);
  }
}

async function cancelOpsBestEffort(opIds: Iterable<string>): Promise<void> {
  const ids = Array.from(opIds);
  await Promise.all(ids.map((id) =>
    api.post(`/operations/${encodeURIComponent(id)}/cancel`, {}).catch(() => undefined),
  ));
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

    setState({
      status: 'running',
      stageIndex: 0,
      stageOpIds: new Set(),
      stageTerminalCount: 0,
      failedProducts: failed,
      startedAt: Date.now(),
      endedAt: null,
    });

    let terminatedByAbort = false;

    try {
      for (let i = 0; i < PIPELINE_STAGES.length; i += 1) {
        if (controller.signal.aborted) { terminatedByAbort = true; break; }
        const stage = PIPELINE_STAGES[i];
        const active = products.filter((p) => !failed.has(p.productId));
        if (active.length === 0) break;

        const collected = new Set<string>();
        const collectOperationId = (id: string) => {
          if (collected.has(id)) return;
          collected.add(id);
          setState((prev) => ({ ...prev, stageOpIds: new Set(collected) }));
        };

        setState((prev) => ({
          ...prev,
          stageIndex: i,
          stageOpIds: collected,
          stageTerminalCount: 0,
        }));

        const watcher = useOperationsStore.subscribe(() => {
          const ops = useOperationsStore.getState().operations;
          let count = 0;
          for (const id of collected) {
            const op = ops.get(id);
            if (op && isTerminal(op.status as OpStatus)) count += 1;
          }
          setState((prev) => (prev.stageTerminalCount === count ? prev : { ...prev, stageTerminalCount: count }));
        });

        try {
          const dispatchResult = await dispatchPipelineStage({
            stage,
            category,
            products: active,
            fire,
            reservedKeys,
            options: {
              signal: controller.signal,
              onOperationId: collectOperationId,
            },
          });

          for (const id of dispatchResult.operationIds) collectOperationId(id);
          if (dispatchResult.failures > 0) throw new Error('pipeline_stage_dispatch_failed');
          if (controller.signal.aborted) { terminatedByAbort = true; break; }

          const results = await waitForOperationsTerminal(Array.from(collected), controller.signal);
          setState((prev) => ({ ...prev, stageTerminalCount: collected.size }));
          for (const [opId, status] of results) {
            if (status !== 'error') continue;
            const op = useOperationsStore.getState().operations.get(opId);
            if (op && !failed.has(op.productId)) {
              failed.set(op.productId, { stageIndex: i, label: stage.label });
            }
          }
        } finally {
          watcher();
        }

        setState((prev) => ({ ...prev, failedProducts: new Map(failed) }));
      }
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
    const inFlight: string[] = [];
    for (const id of state.stageOpIds) {
      const op = current.operations.get(id);
      if (op && !isTerminal(op.status as OpStatus)) inFlight.push(id);
    }
    void cancelOpsBestEffort(inFlight);
  }, [state.stageOpIds]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return { state, start, stop, reset };
}
