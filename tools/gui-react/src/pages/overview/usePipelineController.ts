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
 * elapsed. Returns a map of opId → final status for the caller to classify
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

    const cleanup = () => {
      unsubscribe();
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };

    // Run once immediately in case every op is already terminal at start.
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
  { id: 'cef_1',    label: 'CEF run (1 of 2)', kind: 'cef' },
  { id: 'cef_2',    label: 'CEF run (2 of 2)', kind: 'cef' },
  { id: 'pif_loop', label: 'PIF loop',          kind: 'pif-loop' },
  { id: 'pif_eval', label: 'PIF eval',          kind: 'pif-eval' },
  { id: 'rdf_run',  label: 'RDF run',           kind: 'rdf-run' },
  { id: 'sku_run',  label: 'SKU run',           kind: 'sku-run' },
  { id: 'kf_loop',  label: 'KF loop (all keys)', kind: 'kf-loop' },
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

async function dispatchStage(
  stage: PipelineStage,
  category: string,
  products: readonly CatalogRow[],
  fire: BulkFireFn,
  reservedKeys: ReadonlySet<string>,
  collectOpId: (id: string) => void,
): Promise<void> {
  // WHY: useBulkFire doesn't expose onDispatched in the bulk-fan-out helpers
  // today — we tap the operations store directly to collect opIds created
  // during this window. Because pipeline stages are serialized, any new
  // non-terminal ops for the current category + relevant module appearing
  // after `baseline` must belong to this stage.
  const baselineIds = new Set(useOperationsStore.getState().operations.keys());

  const moduleMatchesStage = (type: string): boolean => {
    switch (stage.kind) {
      case 'cef': return type === 'cef';
      case 'pif-loop':
      case 'pif-eval': return type === 'pif';
      case 'rdf-run': return type === 'rdf';
      case 'sku-run': return type === 'skf';
      case 'kf-loop': return type === 'kf';
      default: return false;
    }
  };

  switch (stage.kind) {
    case 'cef':      dispatchCefRun(category, products, fire); break;
    case 'pif-loop': dispatchPifLoop(category, products, fire); break;
    case 'pif-eval': await dispatchPifEval(category, products, fire); break;
    case 'rdf-run':  dispatchRdfRun(category, products, fire); break;
    case 'sku-run':  dispatchSkuRun(category, products, fire); break;
    case 'kf-loop':  await dispatchKfAll(category, products, reservedKeys, 'loop', fire); break;
  }

  // Allow fire-and-forget POSTs to register (worst case: 50ms stagger × N).
  // We poll the store for ~3s after the last expected stagger to collect
  // newly registered opIds for this stage.
  const settleMs = 3000;
  const pollIntervalMs = 100;
  const deadline = Date.now() + settleMs;
  while (Date.now() < deadline) {
    const ops = useOperationsStore.getState().operations;
    for (const [id, op] of ops) {
      if (baselineIds.has(id)) continue;
      if (op.category !== category) continue;
      if (!moduleMatchesStage(op.type)) continue;
      collectOpId(id);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
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
        setState((prev) => ({
          ...prev,
          stageIndex: i,
          stageOpIds: collected,
          stageTerminalCount: 0,
        }));

        await dispatchStage(stage, category, active, fire, reservedKeys, (id) => {
          collected.add(id);
        });

        setState((prev) => ({ ...prev, stageOpIds: new Set(collected) }));

        // Stream terminal counts while we wait.
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
          const results = await waitForOperationsTerminal(Array.from(collected), controller.signal);
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
    // Cancel in-flight ops best-effort. The pipeline loop already exits on
    // abort, so this is purely to free server resources for the current stage.
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
