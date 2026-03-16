import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { LlmRouteResponse, LlmRouteRow } from '../../../types/llmSettings';
import { autoSaveFingerprint } from '../../../stores/autoSaveFingerprint';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS } from '../../../stores/settingsManifest';
import { createSettingsOptimisticMutationContract } from '../../../stores/settingsMutationContract';
import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract';

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
  autoQueryEnabled?: boolean;
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

interface LlmSettingsReaderOptions {
  category: string;
  enabled: boolean;
  autoQueryEnabled?: boolean;
}

interface LlmSettingsReaderResult {
  data: LlmRouteResponse | undefined;
  isLoading: boolean;
  reload: () => Promise<void>;
}

export function llmSettingsRoutesQueryKey(category: string) {
  return ['llm-settings-routes', category] as const;
}

export function readLlmSettingsSnapshot(
  queryClient: QueryClient,
  category: string,
): LlmRouteResponse | undefined {
  const cached = queryClient.getQueryData<unknown>(llmSettingsRoutesQueryKey(category));
  if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return undefined;
  return cached as LlmRouteResponse;
}

export function readLlmSettingsBootstrapRows(queryClient: QueryClient, category: string): LlmRouteRow[] {
  const snapshot = readLlmSettingsSnapshot(queryClient, category);
  if (!snapshot || typeof snapshot !== 'object') return [];
  const rows = snapshot.rows;
  return Array.isArray(rows) ? rows as LlmRouteRow[] : [];
}

export function useLlmSettingsBootstrapRows(category: string): LlmRouteRow[] {
  const queryClient = useQueryClient();
  return useMemo(
    () => readLlmSettingsBootstrapRows(queryClient, category),
    [queryClient, category],
  );
}

export function useLlmSettingsReader({
  category,
  enabled,
  autoQueryEnabled = true,
}: LlmSettingsReaderOptions): LlmSettingsReaderResult {
  const queryClient = useQueryClient();
  const queryKey = llmSettingsRoutesQueryKey(category);
  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<LlmRouteResponse>(`/llm-settings/${category}/routes`),
    enabled: enabled && autoQueryEnabled,
  });

  async function reload() {
    const result = await refetch();
    if (!result.data) return;
    queryClient.setQueryData(queryKey, result.data);
  }

  return {
    data,
    isLoading,
    reload,
  };
}

export function useLlmSettingsAuthority({
  category,
  enabled,
  autoQueryEnabled = true,
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
  const queryKey = llmSettingsRoutesQueryKey(category);
  const lastAutoSavedFingerprintRef = useRef('');
  const lastAutoSaveAttemptFingerprintRef = useRef('');
  const pendingAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowsFingerprint = autoSaveFingerprint(rows);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<LlmRouteResponse>(`/llm-settings/${category}/routes`),
    enabled: enabled && autoQueryEnabled,
  });

  const saveMutation = useMutation(
    createSettingsOptimisticMutationContract<
      LlmSettingsSavePayload,
      LlmRouteResponse,
      LlmRouteResponse,
      { persisted: LlmSettingsSaveResult; response: LlmRouteResponse }
    >({
      queryClient,
      queryKey,
      mutationFn: (payload) =>
        api.put<LlmRouteResponse>(`/llm-settings/${category}/routes`, { rows: payload.rows }),
      toOptimisticData: (payload, previousData) => ({
        category: previousData?.category || category,
        scope: previousData?.scope ?? null,
        rows: payload.rows,
        ok: true,
        rejected: {},
      }),
      toAppliedData: (response, _payload, previousData) => ({
        ...(response || {}),
        category: (typeof response?.category === 'string' && response.category.trim())
          ? response.category
          : (previousData?.category || category),
        scope: response?.scope ?? previousData?.scope ?? null,
        rows: Array.isArray(response?.rows) ? response.rows : [],
      }),
      toPersistedResult: (response, _payload, _previousData, appliedData) => {
        const rejected = response?.rejected && typeof response.rejected === 'object'
          ? response.rejected as Record<string, string>
          : {};
        return {
          persisted: {
            ok: response?.ok !== false && Object.keys(rejected).length === 0,
            rows: Array.isArray(appliedData.rows) ? appliedData.rows : [],
            rejected,
          },
          response,
        };
      },
      onPersisted: (result, payload) => {
        const savedFingerprint = autoSaveFingerprint(payload.rows);
        lastAutoSavedFingerprintRef.current = savedFingerprint;
        lastAutoSaveAttemptFingerprintRef.current = savedFingerprint;
        publishSettingsPropagation({ domain: 'llm', category });
        onPersisted?.(result.persisted, payload);
        onSaveSuccess?.(result.response, payload);
      },
      onError,
    }),
  );

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
      pendingAutoSaveTimerRef.current = null;
      saveMutate({ rows: nextRows, version: editVersion });
    }, SETTINGS_AUTOSAVE_DEBOUNCE_MS.llmRoutes);
    pendingAutoSaveTimerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (pendingAutoSaveTimerRef.current === timer) {
        pendingAutoSaveTimerRef.current = null;
      }
    };
  }, [enabled, autoSaveEnabled, dirty, rowsFingerprint, rows, editVersion, saveMutate, resetMutation.isPending, saveMutation.isPending]);

  useEffect(() => () => {
    if (pendingAutoSaveTimerRef.current) {
      clearTimeout(pendingAutoSaveTimerRef.current);
      pendingAutoSaveTimerRef.current = null;
    }
    if (!enabled || !autoSaveEnabled || !dirty || saveMutation.isPending || resetMutation.isPending) return;
    if (!rowsFingerprint) return;
    if (rowsFingerprint === lastAutoSavedFingerprintRef.current) return;
    lastAutoSaveAttemptFingerprintRef.current = rowsFingerprint;
    saveMutate({ rows, version: editVersion });
  }, [
    enabled,
    autoSaveEnabled,
    dirty,
    rowsFingerprint,
    rows,
    editVersion,
    saveMutate,
    saveMutation.isPending,
    resetMutation.isPending,
  ]);

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
