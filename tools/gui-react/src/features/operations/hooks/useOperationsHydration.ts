import { useEffect } from 'react';
import { useOperationsStore, type Operation } from '../state/operationsStore.ts';
import { api } from '../../../api/client.ts';

/**
 * One-time hydration: fetch active operations from the backend on mount.
 * After this, the WebSocket 'operations' channel keeps the store in sync.
 */
export function useOperationsHydration(): void {
  const upsert = useOperationsStore((s) => s.upsert);

  useEffect(() => {
    let cancelled = false;
    api.get<Operation[]>('/operations')
      .then((ops) => {
        if (cancelled) return;
        for (const op of ops) upsert(op);
      })
      .catch(() => {
        // WHY: If server isn't ready yet, WS will hydrate once connected.
      });
    return () => { cancelled = true; };
  }, [upsert]);
}
