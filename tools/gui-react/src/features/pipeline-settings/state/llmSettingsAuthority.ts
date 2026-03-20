import { useCallback, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { LlmRouteResponse, LlmRouteRow } from '../../../types/llmSettings';
import { autoSaveFingerprint } from '../../../stores/autoSaveFingerprint';
import { SETTINGS_AUTOSAVE_DEBOUNCE_MS } from '../../../stores/settingsManifest';
import { createSettingsOptimisticMutationContract } from '../../../stores/settingsMutationContract';
import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract';
import { useSettingsAutoSaveEffect } from './useSettingsAutoSaveEffect';

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
  initialHydrationApplied?: boolean;
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
  initialHydrationApplied = true,
  editVersion,
  onPersisted,
  onSaveSuccess,
  onResetSuccess,
  onError,
}: LlmSettingsAuthorityOptions): LlmSettingsAuthorityResult {
  const queryClient = useQueryClient();
  const queryKey = llmSettingsRoutesQueryKey(category);
  const rowsFingerprint = autoSaveFingerprint(rows);
  const rowsRef = useRef(rows);
  const editVersionRef = useRef(editVersion);
  rowsRef.current = rows;
  editVersionRef.current = editVersion;

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<LlmRouteResponse>(`/llm-settings/${category}/routes`),
    enabled: enabled && autoQueryEnabled,
  });

  const resetMutation = useMutation({
    mutationFn: () => api.post<LlmRouteResponse>(`/llm-settings/${category}/routes/reset`),
    onSuccess: (response) => {
      queryClient.setQueryData(queryKey, response);
      onResetSuccess?.(response);
    },
  });

  const saveFnRef = useRef<() => void>(() => {});
  const getUnloadBody = useCallback(() => ({ rows: rowsRef.current }), []);

  const { markSaved, clearAttemptFingerprint, seedFingerprint } =
    useSettingsAutoSaveEffect({
      domain: 'llm',
      debounceMs: SETTINGS_AUTOSAVE_DEBOUNCE_MS.llmRoutes,
      payloadFingerprint: rowsFingerprint,
      dirty,
      autoSaveEnabled,
      initialHydrationApplied,
      enabled: enabled && !resetMutation.isPending,
      saveFn: () => saveFnRef.current(),
      getUnloadBody,
      unloadUrl: `/api/v1/llm-settings/${category}/routes`,
    });

  const handleAutoSaveError = (error: Error | unknown) => {
    clearAttemptFingerprint();
    onError?.(error);
  };

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
            ok: response?.ok !== false,
            rows: Array.isArray(appliedData.rows) ? appliedData.rows : [],
            rejected,
          },
          response,
        };
      },
      onPersisted: (result, payload) => {
        markSaved(autoSaveFingerprint(payload.rows));
        publishSettingsPropagation({ domain: 'llm', category });
        onPersisted?.(result.persisted, payload);
        onSaveSuccess?.(result.response, payload);
      },
      onError: handleAutoSaveError,
    }),
  );
  saveFnRef.current = () => saveMutation.mutate({ rows: rowsRef.current, version: editVersionRef.current });

  async function reload() {
    const result = await refetch();
    if (!result.data) return;
    queryClient.setQueryData(queryKey, result.data);
    const loadedRows = Array.isArray(result.data.rows) ? result.data.rows : [];
    seedFingerprint(autoSaveFingerprint(loadedRows));
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
