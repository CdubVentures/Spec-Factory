import { useCallback, useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useRuntimeStore } from '../../../stores/runtimeStore.ts';
import { useEventsStore } from '../../../stores/eventsStore.ts';
import { useIndexLabStore, type IndexLabEvent } from '../../../stores/indexlabStore.ts';
import type { ProcessStatus, RuntimeEvent } from '../../../types/events.ts';
import { useWsSubscription } from '../../../hooks/useWsSubscription.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import {
  resolveDataChangeScopedCategories,
  recordDataChangeInvalidationFlush,
  createDataChangeInvalidationScheduler,
} from '../../../features/data-change/index.js';

export function useWsEventBridge({ category, queryClient }: { category: string; queryClient: QueryClient }) {
  const setProcessStatus = useRuntimeStore((s) => s.setProcessStatus);
  const appendProcessOutput = useRuntimeStore((s) => s.appendProcessOutput);
  const appendEvents = useEventsStore((s) => s.appendEvents);
  const appendIndexLabEvents = useIndexLabStore((s) => s.appendEvents);
  const activeRunId = useIndexLabStore((s) => s.pickerRunId);

  // ── Active run invalidation ───────────────────────────────────────
  const previousActiveRunIdRef = useRef('');
  useEffect(() => {
    const nextRunId = String(activeRunId || '').trim();
    if (nextRunId === previousActiveRunIdRef.current) return;
    previousActiveRunIdRef.current = nextRunId;
    queryClient.invalidateQueries({ queryKey: ['indexlab', 'run'] });
    queryClient.invalidateQueries({ queryKey: ['runtime-ops'] });
    queryClient.invalidateQueries({ queryKey: ['indexing', 'domain-checklist'] });
  }, [activeRunId, queryClient]);

  // ── Data change invalidation scheduler ────────────────────────────
  const dataChangeSchedulerRef = useRef<ReturnType<typeof createDataChangeInvalidationScheduler> | null>(null);
  useEffect(() => {
    const dataChangeScheduler = createDataChangeInvalidationScheduler({
      queryClient,
      delayMs: 75,
      onFlush: (payload: { queryKeys: unknown[][]; categories: string[] }) => {
        recordDataChangeInvalidationFlush(payload);
      },
    });
    dataChangeSchedulerRef.current = dataChangeScheduler;
    return () => {
      dataChangeScheduler.flush();
      dataChangeScheduler.dispose();
      if (dataChangeSchedulerRef.current === dataChangeScheduler) {
        dataChangeSchedulerRef.current = null;
      }
    };
  }, [queryClient]);

  // ── WS message handler ────────────────────────────────────────────
  const handleWsMessage = useCallback((channel: string, data: unknown) => {
    if (channel === 'events' && Array.isArray(data)) {
      appendEvents(data as RuntimeEvent[]);
    }
    if (channel === 'process' && Array.isArray(data)) {
      appendProcessOutput(data as string[]);
    }
    if (channel === 'process-status' && data && typeof data === 'object') {
      const status = data as ProcessStatus;
      setProcessStatus(status);
      queryClient.setQueryData(['processStatus'], status);
    }
    if (channel === 'indexlab-event' && Array.isArray(data)) {
      appendIndexLabEvents(data as IndexLabEvent[]);
    }
    if (channel === 'data-change' && data && typeof data === 'object') {
      const msg = data as { type?: string; event?: string; category?: string; categories?: string[] };
      const eventName = String(
        msg.event
        || (msg.type && msg.type !== 'data-change' ? msg.type : ''),
      ).trim();
      if (!eventName) return;
      // WHY: Server confirmed a settings write landed. Clear flushPending so
      // hydrate() is unblocked for the next server refetch (SET-005).
      if (eventName === 'runtime-settings-updated' || eventName === 'user-settings-updated') {
        useRuntimeSettingsValueStore.getState().confirmFlush();
      }
      const scopedCategories = resolveDataChangeScopedCategories(msg, category);
      dataChangeSchedulerRef.current?.schedule({
        message: msg,
        categories: scopedCategories,
        fallbackCategory: category,
      });
    }
  }, [appendEvents, appendIndexLabEvents, appendProcessOutput, category, queryClient, setProcessStatus]);

  useWsSubscription({
    channels: ['events', 'process', 'process-status', 'data-change', 'test-import-progress', 'indexlab-event'],
    category,
    onMessage: handleWsMessage,
  });
}
