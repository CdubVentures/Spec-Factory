import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../../api/client.ts';
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

type RuntimeSettingsPersistResult = {
  ok: boolean;
  applied: RuntimeSettings;
  rejected: Record<string, string>;
};

// WHY: Simplified options — no debounce, no dirty tracking, no auto-save toggle.
// Every change persists immediately via saveNow().
interface RuntimeSettingsAuthorityOptions {
  onPersisted?: (result: RuntimeSettingsPersistResult) => void;
  onError?: (error: Error | unknown) => void;
  enabled?: boolean;
}

interface RuntimeSettingsAuthorityResult {
  settings: RuntimeSettings | undefined;
  isLoading: boolean;
  isSaving: boolean;
  reload: () => Promise<RuntimeSettings | undefined>;
  saveNow: () => void;
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

// WHY: Simplified authority — persists immediately on every saveNow() call.
// No debounce, no dirty tracking, no fingerprint dedup, no auto-save toggle.
// The caller is responsible for calling saveNow() after each store update.
export function useRuntimeSettingsAuthority({
  enabled = true,
  onPersisted,
  onError,
}: RuntimeSettingsAuthorityOptions): RuntimeSettingsAuthorityResult {
  const queryClient = useQueryClient();

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: RUNTIME_SETTINGS_QUERY_KEY,
    queryFn: () => api.get<RuntimeSettings>('/runtime-settings'),
    enabled,
  });

  const storeMarkClean = useRuntimeSettingsValueStore((s) => s.markClean);

  const onPersistedRef = useRef(onPersisted);
  const onErrorRef = useRef(onError);
  onPersistedRef.current = onPersisted;
  onErrorRef.current = onError;

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
      onPersisted: (result) => {
        onPersistedRef.current?.(result);
        storeMarkClean();
        publishSettingsPropagation({ domain: 'runtime' });
      },
      onError: (error) => {
        onErrorRef.current?.(error);
      },
    }),
  );

  // WHY: Read directly from the store (not from stale React state) to ensure
  // the payload includes the most recent synchronous updateKey() writes.
  const saveNow = useCallback(() => {
    const currentPayload = useRuntimeSettingsValueStore.getState().values;
    if (!currentPayload) return;
    saveMutation.mutate(currentPayload as RuntimeSettings);
  }, [saveMutation]);

  const reload = useCallback(async () => {
    const result = await refetch();
    if (result.data) {
      queryClient.setQueryData(RUNTIME_SETTINGS_QUERY_KEY, result.data);
    }
    return result.data;
  }, [refetch, queryClient]);

  return {
    settings,
    isLoading,
    isSaving: saveMutation.isPending,
    reload,
    saveNow,
  };
}
