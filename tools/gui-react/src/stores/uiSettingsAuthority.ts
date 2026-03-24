import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../api/client.ts';
import { UI_SETTING_DEFAULTS } from './settingsManifest.ts';
import { createSettingsOptimisticMutationContract } from './settingsMutationContract.ts';
import { publishSettingsPropagation } from './settingsPropagationContract.ts';

export interface UiSettingsPayload {
  studioAutoSaveAllEnabled: boolean;
  studioAutoSaveEnabled: boolean;
  studioAutoSaveMapEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
  storageAutoSaveEnabled: boolean;
}

interface UiSettingsAuthorityOptions {
  enabled?: boolean;
  onPersisted?: (settings: UiSettingsPayload) => void;
  onError?: (error: Error | unknown) => void;
}

interface UiSettingsAuthorityResult {
  settings: UiSettingsPayload | undefined;
  isLoading: boolean;
  isSaving: boolean;
  reload: () => Promise<UiSettingsPayload | undefined>;
  saveNow: (payload: UiSettingsPayload) => void;
}

const UI_SETTINGS_QUERY_KEY = ['ui-settings'];

function readUiBool(source: Record<string, unknown>, key: keyof UiSettingsPayload, fallback: boolean): boolean {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return fallback;
  const value = source[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value !== 0;
  if (typeof value === 'string') {
    const token = value.trim().toLowerCase();
    if (!token) return fallback;
    if (['1', 'true', 'yes', 'on'].includes(token)) return true;
    if (['0', 'false', 'no', 'off'].includes(token)) return false;
  }
  return fallback;
}

function sanitizeUiSettings(raw: Record<string, unknown> | null | undefined): UiSettingsPayload {
  const source = raw && typeof raw === 'object' ? raw : {};
  const studioAutoSaveAllEnabled = readUiBool(source, 'studioAutoSaveAllEnabled', UI_SETTING_DEFAULTS.studioAutoSaveAllEnabled);
  const studioAutoSaveMapEnabled = studioAutoSaveAllEnabled
    ? true
    : readUiBool(source, 'studioAutoSaveMapEnabled', UI_SETTING_DEFAULTS.studioAutoSaveMapEnabled);
  const studioAutoSaveEnabled = studioAutoSaveAllEnabled
    ? true
    : readUiBool(source, 'studioAutoSaveEnabled', UI_SETTING_DEFAULTS.studioAutoSaveEnabled);
  return {
    studioAutoSaveAllEnabled,
    studioAutoSaveEnabled,
    studioAutoSaveMapEnabled,
    runtimeAutoSaveEnabled: readUiBool(source, 'runtimeAutoSaveEnabled', UI_SETTING_DEFAULTS.runtimeAutoSaveEnabled),
    storageAutoSaveEnabled: readUiBool(source, 'storageAutoSaveEnabled', UI_SETTING_DEFAULTS.storageAutoSaveEnabled),
  };
}

function normalizeUiSettingsPayload(payload: UiSettingsPayload): UiSettingsPayload {
  return sanitizeUiSettings({
    studioAutoSaveAllEnabled: payload.studioAutoSaveAllEnabled,
    studioAutoSaveEnabled: payload.studioAutoSaveEnabled,
    studioAutoSaveMapEnabled: payload.studioAutoSaveMapEnabled,
    runtimeAutoSaveEnabled: payload.runtimeAutoSaveEnabled,
    storageAutoSaveEnabled: payload.storageAutoSaveEnabled,
  });
}

export function readUiSettingsSnapshot(queryClient: QueryClient): UiSettingsPayload | undefined {
  const cached = queryClient.getQueryData<unknown>(UI_SETTINGS_QUERY_KEY);
  if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return undefined;
  return sanitizeUiSettings(cached as Record<string, unknown>);
}

export function useUiSettingsAuthority({
  enabled = true,
  onPersisted,
  onError,
}: UiSettingsAuthorityOptions = {}): UiSettingsAuthorityResult {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: UI_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const result = await api.get<Record<string, unknown>>('/ui-settings');
      return sanitizeUiSettings(result);
    },
    enabled,
  });

  const saveMutation = useMutation(
    createSettingsOptimisticMutationContract<
      UiSettingsPayload,
      Record<string, unknown>,
      UiSettingsPayload,
      UiSettingsPayload
    >({
      queryClient,
      queryKey: UI_SETTINGS_QUERY_KEY,
      mutationFn: (payload) => api.put<Record<string, unknown>>('/ui-settings', payload),
      toOptimisticData: (payload) => normalizeUiSettingsPayload(payload),
      toAppliedData: (response) => {
        // WHY: Prefer snapshot from standardized envelope; fall back to top-level for compat.
        const source = response && typeof response === 'object' && 'snapshot' in response
          && response.snapshot && typeof response.snapshot === 'object'
          ? response.snapshot as Record<string, unknown>
          : response;
        return sanitizeUiSettings(source);
      },
      toPersistedResult: (_response, _payload, _previousData, appliedData) => appliedData,
      onPersisted: (settings) => {
        onPersisted?.(settings);
        publishSettingsPropagation({ domain: 'ui' });
      },
      onError,
    }),
  );

  const reload = useCallback(async () => {
    const result = await refetch();
    if (!result.data) return undefined;
    queryClient.setQueryData(UI_SETTINGS_QUERY_KEY, result.data);
    return result.data;
  }, [refetch, queryClient]);

  const saveNow = useCallback((payload: UiSettingsPayload) => {
    saveMutation.mutate(payload);
  }, [saveMutation.mutate]);

  return {
    settings: data,
    isLoading,
    isSaving: saveMutation.isPending,
    reload,
    saveNow,
  };
}
