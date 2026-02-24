import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { LlmRouteResponse, LlmRouteRow } from '../types/llmSettings';
import { autoSaveFingerprint } from './autoSaveFingerprint';

interface LlmSettingsSavePayload {
  rows: LlmRouteRow[];
  version: number;
}

interface LlmSettingsSaveResult {
  ok: boolean;
  rows: LlmRouteRow[];
  rejected: Record<string, string>;
}

interface LlmSettingsAuthorityOptions {
  category: string;
  enabled: boolean;
  rows: LlmRouteRow[];
  dirty: boolean;
  autoSaveEnabled: boolean;
  editVersion: number;
  onPersisted?: (result: LlmSettingsSaveResult, payload: LlmSettingsSavePayload) => void;
  onSaveSuccess?: (response: LlmRouteResponse, payload: LlmSettingsSavePayload) => void;
  onResetSuccess?: (response: LlmRouteResponse) => void;
  onError?: (error: Error | unknown) => void;
}

interface LlmSettingsAuthorityResult {
  data: LlmRouteResponse | undefined;
  isLoading: boolean;
  isSaving: boolean;
  isResetting: boolean;
  reload: () => Promise<void>;
  save: () => void;
  resetDefaults: () => void;
}

export function useLlmSettingsAuthority({
  category,
  enabled,
  rows,
  dirty,
  autoSaveEnabled,
  editVersion,
  onPersisted,
  onSaveSuccess,
  onResetSuccess,
  onError,
}: LlmSettingsAuthorityOptions): LlmSettingsAuthorityResult {
  const queryClient = useQueryClient();
  const queryKey = ['llm-settings-routes', category] as const;
  const lastAutoSavedFingerprintRef = useRef('');
  const lastAutoSaveAttemptFingerprintRef = useRef('');
  const rowsFingerprint = autoSaveFingerprint(rows);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<LlmRouteResponse>(`/llm-settings/${category}/routes`),
    enabled,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: LlmSettingsSavePayload) =>
      api.put<LlmRouteResponse>(`/llm-settings/${category}/routes`, { rows: payload.rows }),
    onSuccess: (response, payload) => {
      const rows = Array.isArray(response?.rows) ? response.rows : [];
      const next: LlmRouteResponse = {
        ...(response || {}),
        rows,
      };
      const rejected = response?.rejected && typeof response.rejected === 'object'
        ? response.rejected as Record<string, string>
        : {};
      queryClient.setQueryData(queryKey, next);
      const persisted: LlmSettingsSaveResult = {
        ok: response?.ok !== false && Object.keys(rejected).length === 0,
        rows,
        rejected,
      };
      const savedFingerprint = autoSaveFingerprint(payload.rows);
      lastAutoSavedFingerprintRef.current = savedFingerprint;
      lastAutoSaveAttemptFingerprintRef.current = savedFingerprint;
      onPersisted?.(persisted, payload);
      onSaveSuccess?.(response, payload);
    },
    onError,
  });

  const resetMutation = useMutation({
    mutationFn: () => api.post<LlmRouteResponse>(`/llm-settings/${category}/routes/reset`),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response);
      onResetSuccess?.(response);
    },
  });
  const saveMutate = saveMutation.mutate;

  useEffect(() => {
    if (!enabled || !autoSaveEnabled || !dirty || saveMutation.isPending || resetMutation.isPending) return;
    if (!rowsFingerprint) return;
    if (rowsFingerprint === lastAutoSavedFingerprintRef.current) return;
    if (rowsFingerprint === lastAutoSaveAttemptFingerprintRef.current) return;
    const nextRows = rows;
    lastAutoSaveAttemptFingerprintRef.current = rowsFingerprint;
    const timer = setTimeout(() => {
      saveMutate({ rows: nextRows, version: editVersion });
    }, 700);
    return () => clearTimeout(timer);
  }, [enabled, autoSaveEnabled, dirty, rowsFingerprint, rows, editVersion, saveMutate, resetMutation.isPending, saveMutation.isPending]);

  async function reload() {
    const result = await refetch();
    if (!result.data) return;
    queryClient.setQueryData(queryKey, result.data);
    const loadedRows = Array.isArray(result.data.rows) ? result.data.rows : [];
    const loadedFingerprint = autoSaveFingerprint(loadedRows);
    lastAutoSavedFingerprintRef.current = loadedFingerprint;
    lastAutoSaveAttemptFingerprintRef.current = loadedFingerprint;
  }

  function save() {
    saveMutation.mutate({ rows, version: editVersion });
  }

  function resetDefaults() {
    resetMutation.mutate();
  }

  return {
    data,
    isLoading,
    isSaving: saveMutation.isPending,
    isResetting: resetMutation.isPending,
    reload,
    save,
    resetDefaults,
  };
}
