import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { autoSaveFingerprint } from './autoSaveFingerprint';

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
  onPersisted,
  onError,
}: RuntimeSettingsAuthorityOptions): RuntimeSettingsAuthorityResult {
  const queryClient = useQueryClient();
  const payloadFingerprint = autoSaveFingerprint(payload);

  const { data: settings, isLoading, refetch } = useQuery({
    queryKey: ['runtime-settings'],
    queryFn: () => api.get<RuntimeSettings>('/runtime-settings'),
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
    queryClient.setQueryData(['runtime-settings'], result.applied);
    if (emitState) {
      onPersisted?.(result);
    }
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
        queryClient.getQueryData<RuntimeSettings>(['runtime-settings']) || nextPayload,
      );
      applyRuntimeSaveResult(result, emitState);
      const savedFingerprint = autoSaveFingerprint(nextPayload);
      lastAutoSavedFingerprintRef.current = savedFingerprint;
      lastAutoSaveAttemptFingerprintRef.current = savedFingerprint;
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

  const saveMutation = useMutation({
    mutationFn: (nextPayload: RuntimeSettings) =>
      api.put<{ ok: boolean; applied: RuntimeSettings; rejected?: Record<string, string> }>('/runtime-settings', nextPayload),
    onSuccess: (response, nextPayload) => {
      const result = normalizeRuntimeSaveResult(
        response,
        nextPayload,
        queryClient.getQueryData<RuntimeSettings>(['runtime-settings']) || nextPayload,
      );
      applyRuntimeSaveResult(result);
      const savedFingerprint = autoSaveFingerprint(nextPayload);
      lastAutoSavedFingerprintRef.current = savedFingerprint;
      lastAutoSaveAttemptFingerprintRef.current = savedFingerprint;
    },
    onError,
  });
  const saveMutate = saveMutation.mutate;

  useEffect(() => {
    if (!autoSaveEnabled || !dirty || !payloadFingerprint) return;
    if (payloadFingerprint === lastAutoSavedFingerprintRef.current) return;
    if (payloadFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
    const nextPayload = payloadRef.current;
    lastAutoSaveAttemptFingerprintRef.current = payloadFingerprint;
    const timer = setTimeout(() => {
      saveMutate(nextPayload);
    }, 1500);
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
      queryClient.setQueryData(['runtime-settings'], result.data);
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
