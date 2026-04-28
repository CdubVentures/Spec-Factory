import { useCallback, useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useRuntimeStore } from '../../../stores/runtimeStore.ts';
import { useEventsStore } from '../../../stores/eventsStore.ts';
import { useOperationsStore, type OperationUpsert, type LlmCallRecord, type LlmCallStreamChunk } from '../../../stores/operationsStore.ts';
import { useIndexLabStore, type IndexLabEvent } from '../../../stores/indexlabStore.ts';
import type { ProcessStatus, RuntimeEvent } from '../../../types/events.ts';
import { useWsSubscription } from '../../../hooks/useWsSubscription.ts';
import { api } from '../../../api/client.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import {
  resolveDataChangeScopedCategories,
  recordDataChangeInvalidationFlush,
  createDataChangeInvalidationScheduler,
} from '../../../features/data-change/index.js';
import {
  patchCatalogRowsFromDataChange,
  shouldSkipCatalogListInvalidation,
} from '../../../features/catalog/api/catalogRowPatch.ts';

function isFullLlmCallRecord(value: unknown): value is LlmCallRecord {
  if (!value || typeof value !== 'object') return false;
  return 'prompt' in value;
}

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
    if (nextRunId) {
      queryClient.invalidateQueries({ queryKey: ['runtime-ops', nextRunId] });
    }
    queryClient.invalidateQueries({ queryKey: ['indexing', 'domain-checklist'] });
  }, [activeRunId, queryClient]);

  // ── Stream text buffer ───────────────────────────────────────────
  // WHY: Coalesce rapid stream chunks (100ms server cadence) into fewer Zustand writes.
  // 150ms chosen: above server batch interval, below human perception threshold.
  const STREAM_FLUSH_MS = 150;
  const streamBufRef = useRef(new Map<string, string>());
  const callStreamBufRef = useRef(new Map<string, LlmCallStreamChunk[]>());
  useEffect(() => {
    const timer = setInterval(() => {
      const buf = streamBufRef.current;
      if (buf.size > 0) {
        useOperationsStore.getState().batchAppendStreamText(buf);
        streamBufRef.current = new Map();
      }
      const callBuf = callStreamBufRef.current;
      if (callBuf.size > 0) {
        useOperationsStore.getState().batchAppendCallStreamText(callBuf);
        callStreamBufRef.current = new Map();
      }
    }, STREAM_FLUSH_MS);
    return () => {
      clearInterval(timer);
      const buf = streamBufRef.current;
      if (buf.size > 0) {
        useOperationsStore.getState().batchAppendStreamText(buf);
        streamBufRef.current = new Map();
      }
      const callBuf = callStreamBufRef.current;
      if (callBuf.size > 0) {
        useOperationsStore.getState().batchAppendCallStreamText(callBuf);
        callStreamBufRef.current = new Map();
      }
    };
  }, []);

  // ── Data change invalidation scheduler ────────────────────────────
  const dataChangeSchedulerRef = useRef<ReturnType<typeof createDataChangeInvalidationScheduler> | null>(null);
  useEffect(() => {
    const dataChangeScheduler = createDataChangeInvalidationScheduler({
      queryClient,
      delayMs: 75,
      onFlush: (payload: { queryKeys: unknown[][]; categories: string[] }) => {
        recordDataChangeInvalidationFlush(payload);
      },
      shouldInvalidateQueryKey: ({ queryKey, message, fallbackCategory }) =>
        !shouldSkipCatalogListInvalidation({ queryKey, message, fallbackCategory }),
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
    if (channel === 'operations' && data && typeof data === 'object') {
      const msg = data as { action?: string; operation?: OperationUpsert; id?: string; call?: unknown };
      if (msg.operation) useOperationsStore.getState().upsert(msg.operation);
      if (msg.action === 'remove' && msg.id) useOperationsStore.getState().remove(msg.id);
      if (msg.action === 'llm-call-append' && msg.id && isFullLlmCallRecord(msg.call)) {
        useOperationsStore.getState().appendLlmCall(msg.id, msg.call);
      }
      if (msg.action === 'llm-call-update' && msg.id && isFullLlmCallRecord(msg.call)) {
        const call = msg.call;
        if (call.callIndex != null) {
          useOperationsStore.getState().updateLlmCall(msg.id, call.callIndex, call);
        }
      }
    }
    if (channel === 'llm-stream' && data && typeof data === 'object') {
      const msg = data as { operationId?: string; text?: string; callId?: string; lane?: string; label?: string; channel?: string };
      if (msg.operationId && msg.text) {
        if (msg.callId) {
          const buf = callStreamBufRef.current;
          const chunks = buf.get(msg.operationId) ?? [];
          chunks.push({
            callId: msg.callId,
            text: msg.text,
            lane: msg.lane,
            label: msg.label,
            channel: msg.channel,
          });
          buf.set(msg.operationId, chunks);
        } else {
          const buf = streamBufRef.current;
          buf.set(msg.operationId, (buf.get(msg.operationId) ?? '') + msg.text);
        }
      }
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
      void patchCatalogRowsFromDataChange({
        api,
        queryClient,
        message: msg,
        fallbackCategory: category,
      });
      dataChangeSchedulerRef.current?.schedule({
        message: msg,
        categories: scopedCategories,
        fallbackCategory: category,
      });
    }
  }, [appendEvents, appendIndexLabEvents, appendProcessOutput, category, queryClient, setProcessStatus]);

  useWsSubscription({
    channels: ['events', 'process', 'process-status', 'data-change', 'test-import-progress', 'indexlab-event', 'operations', 'llm-stream'],
    category,
    onMessage: handleWsMessage,
  });
}
