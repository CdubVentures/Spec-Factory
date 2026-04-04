import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../../api/client.ts';
import { autoSaveFingerprint } from '../../../stores/autoSaveFingerprint.ts';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS } from '../../../stores/settingsManifest.ts';
import { createSettingsOptimisticMutationContract } from '../../../stores/settingsMutationContract.ts';
import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import { RUNTIME_SETTING_DEFAULTS } from '../../../stores/settingsManifest.ts';
import {
  readRuntimeSettingsBootstrap,
  RUNTIME_SETTINGS_QUERY_KEY,
  type RuntimeSettings,
} from './runtimeSettingsAuthorityHelpers.ts';
import { normalizeRuntimeDraft } from './RuntimeFlowDraftNormalization.ts';
import { useSettingsAutoSaveEffect } from './useSettingsAutoSaveEffect.ts';

type RuntimeSettingsPersistResult = {
  ok: boolean;
  applied: RuntimeSettings;
  rejected: Record<string, string>;
};

interface RuntimeSettingsAuthorityOptions {
  payload: RuntimeSettings;
  dirty: boolean;
  autoSaveEnabled: boolean;
  initialHydrationApplied?: boolean;
  enabled?: boolean;
  onPersisted?: (result: RuntimeSettingsPersistResult) => void;
  onError?: (error: Error | unknown) => void;
}

interface RuntimeSettingsAuthorityResult {
  settings: RuntimeSettings | undefined;
  isLoading: boolean;
  isSaving: boolean;
  reload: () => Promise<RuntimeSettings | undefined>;
  saveNow: () => void;
  flushIfDirty: () => Promise<void>;
}

interface RuntimeSettingsReaderOptions {
  enabled?: boolean;
}

interface RuntimeSettingsReaderResult {
  settings: RuntimeSettings | undefined;
  isLoading: boolean;
  reload: () => Promise<RuntimeSettings | undefined>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRejected(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const rejected: Record<string, string> = {};
  for (const [key, reason] of Object.entries(value)) {
    rejected[key] = String(reason || 'rejected');
  }
  return rejected;
}

export function useRuntimeSettingsBootstrap<T extends object>(defaults: T): T {
  const queryClient = useQueryClient();
  return useMemo(
    () => readRuntimeSettingsBootstrap(queryClient, defaults),
    [queryClient, defaults],
  );
}

export function useRuntimeSettingsReader({
  enabled = true,
}: RuntimeSettingsReaderOptions = {}): RuntimeSettingsReaderResult {
  const queryClient = useQueryClient();
  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: RUNTIME_SETTINGS_QUERY_KEY,
    queryFn: () => api.get<RuntimeSettings>('/runtime-settings'),
    enabled,
  });

  async function reload() {
    const result = await refetch();
    if (result.data) {
      queryClient.setQueryData(RUNTIME_SETTINGS_QUERY_KEY, result.data);
    }
    return result.data;
  }

  return {
    settings,
    isLoading,
    reload,
  };
}

/**
 * Lightweight hook that hydrates the runtime settings Zustand store from the server.
 * WHY: Must be called at the AppShell level so the store is populated before any
 * child page mounts. Without this, navigating directly to /llm-config leaves the
 * store null, and LLM hydration via updateKeys silently drops data.
 */
export function useRuntimeSettingsStoreHydration(): void {
  const { settings } = useRuntimeSettingsReader();
  const storeHydrate = useRuntimeSettingsValueStore((s) => s.hydrate);
  useEffect(() => {
    if (!settings) return;
    // WHY: Normalize once at hydration time (clamp, validate, type-coerce).
    // Downstream consumers read already-normalized data from the store.
    const normalized = normalizeRuntimeDraft(settings, RUNTIME_SETTING_DEFAULTS);
    storeHydrate(normalized as unknown as RuntimeSettings);
  }, [settings, storeHydrate]);
}

function normalizeRuntimeSaveResult(
  response: unknown,
  fallbackPayload: RuntimeSettings,
  previousPayload: RuntimeSettings,
) {
  const responseObj = isObject(response) ? response as Record<string, unknown> : {};
  const rejected = normalizeRejected(responseObj.rejected);
  // Prefer full post-persist snapshot when server provides it (backward-compatible).
  const applied = isObject(responseObj.snapshot)
    ? responseObj.snapshot as RuntimeSettings
    : {
      ...previousPayload,
      ...(isObject(responseObj.applied) ? responseObj.applied as Record<string, unknown> : fallbackPayload),
    } as RuntimeSettings;
  // WHY: Trust server ok flag. rejected contains informational unknown_key entries
  // that don't prevent the save from completing.
  return {
    ok: responseObj.ok !== false,
    applied,
    rejected,
  } as RuntimeSettingsPersistResult;
}

export function useRuntimeSettingsAuthority({
  payload,
  dirty,
  autoSaveEnabled,
  initialHydrationApplied = true,
  enabled = true,
  onPersisted,
  onError,
}: RuntimeSettingsAuthorityOptions): RuntimeSettingsAuthorityResult {
  const queryClient = useQueryClient();
  const payloadFingerprint = autoSaveFingerprint(payload);

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: RUNTIME_SETTINGS_QUERY_KEY,
    queryFn: () => api.get<RuntimeSettings>('/runtime-settings'),
    enabled,
  });

  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const applyRuntimeSaveResult = (result: RuntimeSettingsPersistResult, emitState = true) => {
    queryClient.setQueryData(RUNTIME_SETTINGS_QUERY_KEY, result.applied);
    if (emitState) {
      onPersisted?.(result);
    }
  };

  const storeMarkClean = useRuntimeSettingsValueStore((s) => s.markClean);

  const saveFnRef = useRef<() => void>(() => {});
  const getUnloadBody = useCallback(() => payloadRef.current, []);

  const { markSaved, clearAttemptFingerprint, seedFingerprint, prepareFlush } =
    useSettingsAutoSaveEffect({
      domain: 'runtime',
      debounceMs: SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime,
      payloadFingerprint,
      dirty,
      autoSaveEnabled,
      initialHydrationApplied,
      saveFn: () => saveFnRef.current(),
      getUnloadBody,
      unloadUrl: '/api/v1/runtime-settings',
      onFlushPending: () => {
        useRuntimeSettingsValueStore.getState().markFlushPending();
      },
    });

  const recordPersistSuccess = (nextPayload: RuntimeSettings) => {
    markSaved(autoSaveFingerprint(nextPayload));
    storeMarkClean();
    publishSettingsPropagation({ domain: 'runtime' });
  };

  const handleAutoSaveError = (error: Error | unknown) => {
    clearAttemptFingerprint();
    onError?.(error);
  };

  const saveMutation = useMutation(
    createSettingsOptimisticMutationContract<
      RuntimeSettings,
      { ok: boolean; applied: RuntimeSettings; rejected?: Record<string, string> },
      RuntimeSettings,
      RuntimeSettingsPersistResult
    >({
      queryClient,
      queryKey: RUNTIME_SETTINGS_QUERY_KEY,
      mutationFn: (nextPayload) =>
        api.put<{ ok: boolean; applied: RuntimeSettings; rejected?: Record<string, string> }>(
          '/runtime-settings',
          nextPayload,
        ),
      toOptimisticData: (nextPayload) => nextPayload,
      toAppliedData: (response, nextPayload, previousData) =>
        normalizeRuntimeSaveResult(response, nextPayload, previousData || nextPayload).applied,
      toPersistedResult: (response, nextPayload, previousData) =>
        normalizeRuntimeSaveResult(response, nextPayload, previousData || nextPayload),
      onPersisted: (result, nextPayload) => {
        applyRuntimeSaveResult(result);
        recordPersistSuccess(nextPayload);
      },
      onError: handleAutoSaveError,
    }),
  );
  saveFnRef.current = () => saveMutation.mutate(payloadRef.current);

  async function reload() {
    const result = await refetch();
    if (result.data) {
      queryClient.setQueryData(RUNTIME_SETTINGS_QUERY_KEY, result.data);
      seedFingerprint(autoSaveFingerprint(result.data));
    }
    return result.data;
  }

  function saveNow() {
    saveMutation.mutate(payloadRef.current);
  }

  async function flushIfDirty(): Promise<void> {
    if (!prepareFlush()) return;
    await saveMutation.mutateAsync(payloadRef.current);
  }

  return {
    settings,
    isLoading,
    isSaving: saveMutation.isPending,
    reload,
    saveNow,
    flushIfDirty,
  };
}
