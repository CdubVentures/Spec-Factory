/**
 * Generic hook for 202 fire-and-forget calls with optimistic operation insert.
 *
 * Every LLM-backed action uses the same pattern: insert stub instantly, POST,
 * swap temp ID for real operationId, then let WS fill in real data.
 */

import { useCallback } from 'react';
import { api } from '../../../api/client.ts';
import { useOperationsStore } from '../state/operationsStore.ts';
import { markOptimisticOperationFailed } from '../state/optimisticOperationFailure.ts';

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
  /** Per-key scope: keyFinder uses this. */
  readonly fieldKey?: string;
  /** Invoked with the real server-assigned operationId after the POST accepts. */
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
 * Each call is fully independent and safe to spam.
 */
export function useFireAndForget({ type, category, productId }: FireAndForgetContext) {
  const upsert = useOperationsStore((s) => s.upsert);
  const remove = useOperationsStore((s) => s.remove);

  return useCallback(
    (url: string, body: Record<string, unknown>, opts: FireOptions = {}) => {
      // WHY: Insert stub synchronously so it appears in the tracker on the same frame as the click.
      const tempId = `_pending_${++_tempSeq}`;
      const optimisticStub = makeStub(tempId, type, category, productId, opts);
      upsert(optimisticStub);

      api.post<AcceptedResponse>(url, body)
        .then((data) => {
          remove(tempId);
          // WHY: WS broadcast from registerOperation often arrives before the 202.
          // If it already delivered the real op, do not overwrite it with an empty stub.
          const alreadyDelivered = useOperationsStore.getState().operations.has(data.operationId);
          if (!alreadyDelivered) {
            upsert(makeStub(data.operationId, type, category, productId, opts));
          }
          try { opts.onDispatched?.(data.operationId); } catch { /* caller bug must not break fire */ }
        })
        .catch((error: unknown) => {
          // WHY: POST failed before the backend registered a real operation.
          // Keep an inline terminal card so the click failure is visible.
          upsert(markOptimisticOperationFailed(optimisticStub, error));
        });
    },
    [upsert, remove, type, category, productId],
  );
}
