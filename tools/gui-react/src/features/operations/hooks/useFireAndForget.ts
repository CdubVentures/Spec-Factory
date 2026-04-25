/**
 * useFireAndForget — generic hook for 202 fire-and-forget calls with optimistic operation insert.
 *
 * Every LLM-backed action (CEF run, PIF view/hero/loop, future modules) uses
 * the same pattern: insert stub instantly → POST → swap temp ID for real operationId
 * → WS fills in real data. This hook encapsulates that pattern.
 *
 * Usage:
 *   const fire = useFireAndForget({ type: 'pif', category, productId });
 *   fire('/product-image-finder/cat/p1', { variant_key: 'black' }, { subType: 'priority-view', variantKey: 'black' });
 */

import { useCallback } from 'react';
import { api } from '../../../api/client.ts';
import { useOperationsStore } from '../state/operationsStore.ts';

interface AcceptedResponse {
  ok: boolean;
  operationId: string;
}

interface FireAndForgetContext {
  readonly type: string;
  readonly category: string;
  readonly productId: string;
}

interface FireOptions {
  readonly subType?: string;
  readonly variantKey?: string;
  /** Per-key scope — keyFinder uses this. */
  readonly fieldKey?: string;
  /** Invoked with the real server-assigned operationId as soon as the 202
   *  accepts the POST. Use this to chain on the op (await terminal, await a
   *  mid-flight flag like passengersRegistered) without changing the fire()
   *  return type. Not called if the POST fails. */
  readonly onDispatched?: (operationId: string) => void;
}

let _tempSeq = 0;

function makeStub(
  id: string,
  type: string,
  category: string,
  productId: string,
  opts: FireOptions,
) {
  const now = new Date().toISOString();
  return {
    id,
    type,
    subType: opts.subType ?? '',
    category,
    productId,
    productLabel: productId,
    variantKey: opts.variantKey ?? '',
    fieldKey: opts.fieldKey ?? '',
    stages: [] as readonly string[],
    currentStageIndex: 0,
    status: 'running' as const,
    startedAt: now,
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [] as readonly never[],
  };
}

/**
 * Returns a stable `fire(url, body, opts)` function.
 * Each call is fully independent — safe to spam.
 *
 * Inserts an optimistic stub BEFORE the POST fires (instant feedback).
 * When the 202 returns, swaps the temp ID for the real operationId.
 * If the POST fails, removes the stub.
 */
export function useFireAndForget({ type, category, productId }: FireAndForgetContext) {
  const upsert = useOperationsStore((s) => s.upsert);
  const remove = useOperationsStore((s) => s.remove);

  return useCallback(
    (url: string, body: Record<string, unknown>, opts: FireOptions = {}) => {
      // WHY: Insert stub synchronously so it appears in the tracker on the same frame as the click.
      const tempId = `_pending_${++_tempSeq}`;
      upsert(makeStub(tempId, type, category, productId, opts));

      api.post<AcceptedResponse>(url, body)
        .then((data) => {
          remove(tempId);
          // WHY: WS broadcast from registerOperation often arrives BEFORE the 202.
          // If it already delivered the real op (with stages, model, etc.), don't
          // overwrite it with an empty stub — that causes "stuck at queued..." with no stages.
          const alreadyDelivered = useOperationsStore.getState().operations.has(data.operationId);
          if (!alreadyDelivered) {
            upsert(makeStub(data.operationId, type, category, productId, opts));
          }
          try { opts.onDispatched?.(data.operationId); } catch { /* caller bug must not break fire */ }
        })
        .catch(() => {
          // WHY: POST failed — remove the optimistic stub so it doesn't linger.
          remove(tempId);
        });
    },
    [upsert, remove, type, category, productId],
  );
}
