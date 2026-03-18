import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../../api/client';
import { autoSaveFingerprint } from '../../../stores/autoSaveFingerprint';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS } from '../../../stores/settingsManifest';
import { createSettingsOptimisticMutationContract } from '../../../stores/settingsMutationContract';
import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract';
import {
  registerUnloadGuard,
  markDomainFlushedByUnmount,
  isDomainFlushedByUnload,
} from '../../../stores/settingsUnloadGuard';
import {
  readRuntimeSettingsBootstrap,
  RUNTIME_SETTINGS_QUERY_KEY,
  type RuntimeSettings,
} from './runtimeSettingsAuthorityHelpers';

type RuntimeSettingsPersistResult = {
  ok: boolean;
  applied: RuntimeSettings;
  rejected: Record<string, string>;
};

interface RuntimeSettingsAuthorityOptions {
  payload: RuntimeSettings;
  dirty: boolean;
  autoSaveEnabled: boolean;
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
  const payloadFingerprintRef = useRef(payloadFingerprint);
  const dirtyRef = useRef(dirty);
  const autoSaveEnabledRef = useRef(autoSaveEnabled);
  const lastAutoSavedFingerprintRef = useRef('');
  const lastAutoSaveAttemptFingerprintRef = useRef('');
  const pendingAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  payloadRef.current = payload;
  payloadFingerprintRef.current = payloadFingerprint;
  dirtyRef.current = dirty;
  autoSaveEnabledRef.current = autoSaveEnabled;

  const applyRuntimeSaveResult = (result: RuntimeSettingsPersistResult, emitState = true) => {
    queryClient.setQueryData(RUNTIME_SETTINGS_QUERY_KEY, result.applied);
    if (emitState) {
      onPersisted?.(result);
    }
  };

  const recordPersistSuccess = (nextPayload: RuntimeSettings) => {
    const savedFingerprint = autoSaveFingerprint(nextPayload);
    lastAutoSavedFingerprintRef.current = savedFingerprint;
    lastAutoSaveAttemptFingerprintRef.current = savedFingerprint;
    publishSettingsPropagation({ domain: 'runtime' });
  };

  const persistRuntimeSettings = async (nextPayload: RuntimeSettings, emitState = true) => {
    try {
      const response = await api.put<{ ok: boolean; applied: RuntimeSettings; rejected?: Record<string, string> }>(
        '/runtime-settings',
        nextPayload,
      );
      const result = normalizeRuntimeSaveResult(
        response,
        nextPayload,
        queryClient.getQueryData<RuntimeSettings>(RUNTIME_SETTINGS_QUERY_KEY) || nextPayload,
      );
      applyRuntimeSaveResult(result, emitState);
      recordPersistSuccess(nextPayload);
      return result;
    } catch (error) {
      if (emitState) {
        onError?.(error);
      } else {
        console.error('Runtime settings autosave failed:', error);
      }
      return undefined;
    }
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
      onError,
    }),
  );
  const saveMutate = saveMutation.mutate;

  useEffect(() => {
    if (!autoSaveEnabled || !dirty || !payloadFingerprint) return;
    if (payloadFingerprint === lastAutoSavedFingerprintRef.current) return;
    if (payloadFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
    const nextPayload = payloadRef.current;
    lastAutoSaveAttemptFingerprintRef.current = payloadFingerprint;
    const timer = setTimeout(() => {
      pendingAutoSaveTimerRef.current = null;
      saveMutate(nextPayload);
    }, SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime);
    pendingAutoSaveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (pendingAutoSaveTimerRef.current === timer) {
        pendingAutoSaveTimerRef.current = null;
      }
    };
  }, [autoSaveEnabled, dirty, payloadFingerprint, saveMutate]);

  useEffect(() => {
    return registerUnloadGuard({
      domain: 'runtime',
      isDirty: () => {
        if (!dirtyRef.current || !autoSaveEnabledRef.current) return false;
        const fp = payloadFingerprintRef.current;
        return Boolean(fp) && fp !== lastAutoSavedFingerprintRef.current;
      },
      getPayload: () => ({
        url: '/api/v1/runtime-settings',
        method: 'PUT',
        body: payloadRef.current,
      }),
      markFlushed: () => {
        lastAutoSaveAttemptFingerprintRef.current = payloadFingerprintRef.current;
      },
    });
  }, []);

  useEffect(() => {
    return () => {
      if (isDomainFlushedByUnload('runtime')) return;
      const hadPendingAutoSaveTimer = Boolean(pendingAutoSaveTimerRef.current);
      if (pendingAutoSaveTimerRef.current) {
        clearTimeout(pendingAutoSaveTimerRef.current);
        pendingAutoSaveTimerRef.current = null;
      }
      if (!dirtyRef.current || !autoSaveEnabledRef.current) return;
      const nextFingerprint = payloadFingerprintRef.current;
      if (!nextFingerprint) return;
      if (nextFingerprint === lastAutoSavedFingerprintRef.current) return;
      if (!hadPendingAutoSaveTimer && nextFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
      lastAutoSaveAttemptFingerprintRef.current = nextFingerprint;
      // WHY: sendBeacon survives hard reload; void persistRuntimeSettings is fire-and-forget
      // async that gets killed during page teardown.
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payloadRef.current)], { type: 'application/json' });
        navigator.sendBeacon('/api/v1/runtime-settings', blob);
      } else {
        void persistRuntimeSettings(payloadRef.current, false);
      }
      markDomainFlushedByUnmount('runtime');
    };
  }, []);

  async function reload() {
    const result = await refetch();
    if (result.data) {
      queryClient.setQueryData(RUNTIME_SETTINGS_QUERY_KEY, result.data);
      const loadedFingerprint = autoSaveFingerprint(result.data);
      lastAutoSavedFingerprintRef.current = loadedFingerprint;
      lastAutoSaveAttemptFingerprintRef.current = loadedFingerprint;
    }
    return result.data;
  }

  function saveNow() {
    saveMutation.mutate(payloadRef.current);
  }

  return {
    settings,
    isLoading,
    isSaving: saveMutation.isPending,
    reload,
    saveNow,
  };
}
