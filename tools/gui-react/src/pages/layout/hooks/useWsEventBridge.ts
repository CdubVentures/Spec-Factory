import { useCallback, useEffect, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useRuntimeStore } from '../../../stores/runtimeStore.ts';
import { useEventsStore } from '../../../stores/eventsStore.ts';
import { useOperationsStore, type LlmCallStreamChunk } from '../../../stores/operationsStore.ts';
import { useIndexLabStore } from '../../../stores/indexlabStore.ts';
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
import {
  isDataChangeWsMessage,
  isIndexLabEventList,
  isProcessOutputList,
  isRuntimeEventList,
  resolveLlmStreamWsMessage,
  resolveOperationsWsMessage,
  resolveProcessStatusWsMessage,
} from './wsEventPayloadValidation.ts';
import {
  isOperationTerminalStatus,
  isOperationUiActiveStatus,
  type OperationStatus,
} from '../../../features/operations/state/operationStatusContract.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === 'string' ? value.trim() : '';
}

function resolveTerminalDataChangeOperationId(message: unknown): string {
  if (!isRecord(message) || !isRecord(message.meta)) return '';
  const operationId = readMetaString(message.meta, 'operationId');
  const operationStatus = readMetaString(message.meta, 'operationStatus');
  if (!operationId || !isOperationTerminalStatus(operationStatus as OperationStatus)) return '';
  return operationId;
}

function suppressActiveOperationFromTerminalDataChange(message: unknown) {
  const operationId = resolveTerminalDataChangeOperationId(message);
  if (!operationId) return;
  const operationsStore = useOperationsStore.getState();
  const operation = operationsStore.operations.get(operationId);
  if (!operation || !isOperationUiActiveStatus(operation.status)) return;
  operationsStore.remove(operationId);
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
    if (channel === 'events') {
      if (!isRuntimeEventList(data)) return;
      appendEvents(data);
      return;
    }
    if (channel === 'process') {
      if (!isProcessOutputList(data)) return;
      appendProcessOutput(data);
      return;
    }
    if (channel === 'process-status') {
      const msg = resolveProcessStatusWsMessage(data);
      if (!msg) return;
      setProcessStatus(msg);
      queryClient.setQueryData(['processStatus'], msg);
      return;
    }
    if (channel === 'indexlab-event') {
      if (!isIndexLabEventList(data)) return;
      appendIndexLabEvents(data);
      return;
    }
    if (channel === 'operations') {
      const msg = resolveOperationsWsMessage(data);
      if (!msg) return;
      const operationsStore = useOperationsStore.getState();
      if (msg.operation) operationsStore.upsert(msg.operation);
      if (msg.removeId) operationsStore.remove(msg.removeId);
      if (msg.appendCall) {
        operationsStore.appendLlmCall(msg.appendCall.id, msg.appendCall.call);
      }
      if (msg.updateCall) {
        operationsStore.updateLlmCall(msg.updateCall.id, msg.updateCall.callIndex, msg.updateCall.call);
      }
      return;
    }
    if (channel === 'llm-stream') {
      const msg = resolveLlmStreamWsMessage(data);
      if (!msg) return;
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
        return;
      }
      const buf = streamBufRef.current;
      buf.set(msg.operationId, (buf.get(msg.operationId) ?? '') + msg.text);
      return;
    }
    if (channel === 'data-change') {
      if (!isDataChangeWsMessage(data)) return;
      const msg = data;
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
      suppressActiveOperationFromTerminalDataChange(msg);
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
