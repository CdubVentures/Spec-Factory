import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { autoSaveFingerprint } from './autoSaveFingerprint';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS } from './settingsManifest';
import { createSettingsOptimisticMutationContract } from './settingsMutationContract';
import { publishSettingsPropagation } from './settingsPropagationContract';

export type RuntimeSettings = Record<string, string | number | boolean>;

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

export const RUNTIME_SETTINGS_QUERY_KEY = ['runtime-settings'] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readRuntimeSettingsSnapshot(queryClient: QueryClient): RuntimeSettings | undefined {
  const cached = queryClient.getQueryData<unknown>(RUNTIME_SETTINGS_QUERY_KEY);
  if (!isObject(cached)) return undefined;
  const settings: RuntimeSettings = {};
  for (const [key, value] of Object.entries(cached)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      settings[key] = value;
    }
  }
  return settings;
}

export function readRuntimeSettingsBootstrap<T extends object>(
  queryClient: QueryClient,
  defaults: T,
): T {
  const snapshot = readRuntimeSettingsSnapshot(queryClient);
  return {
    ...defaults,
    ...(snapshot || {}),
  } as T;
}

function normalizeRejected(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  const rejected: Record<string, string> = {};
  for (const [key, reason] of Object.entries(value)) {
    rejected[key] = String(reason || 'rejected');
  }
  return rejected;
}

function normalizeRuntimeSaveResult(
  response: unknown,
  fallbackPayload: RuntimeSettings,
  previousPayload: RuntimeSettings,
) {
  const responseObj = isObject(response) ? response as Record<string, unknown> : {};
  const responseApplied = isObject(responseObj.applied) ? responseObj.applied : fallbackPayload;
  const rejected = normalizeRejected(responseObj.rejected);
  const hasRejected = Object.keys(rejected).length > 0;
  const applied = {
    ...previousPayload,
    ...(responseApplied as Record<string, unknown>),
  } as RuntimeSettings;
  return {
    ok: responseObj.ok !== false && !hasRejected,
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
      saveMutate(nextPayload);
    }, SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime);
    return () => clearTimeout(timer);
  }, [autoSaveEnabled, dirty, payloadFingerprint, saveMutate]);

  useEffect(() => {
    return () => {
      if (!dirtyRef.current || !autoSaveEnabledRef.current) return;
      const nextFingerprint = payloadFingerprintRef.current;
      if (!nextFingerprint) return;
      if (nextFingerprint === lastAutoSavedFingerprintRef.current) return;
      if (nextFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
      lastAutoSaveAttemptFingerprintRef.current = nextFingerprint;
      void persistRuntimeSettings(payloadRef.current, false);
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
