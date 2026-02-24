import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export interface UiSettingsPayload {
  studioAutoSaveAllEnabled: boolean;
  studioAutoSaveEnabled: boolean;
  studioAutoSaveMapEnabled: boolean;
  runtimeAutoSaveEnabled: boolean;
  storageAutoSaveEnabled: boolean;
  llmSettingsAutoSaveEnabled: boolean;
}

interface UiSettingsAuthorityOptions {
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

function sanitizeUiSettings(raw: Record<string, unknown> | null | undefined): UiSettingsPayload {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    studioAutoSaveAllEnabled: Boolean(source.studioAutoSaveAllEnabled),
    studioAutoSaveEnabled: Boolean(source.studioAutoSaveEnabled),
    studioAutoSaveMapEnabled: Object.prototype.hasOwnProperty.call(source, 'studioAutoSaveMapEnabled')
      ? Boolean(source.studioAutoSaveMapEnabled)
      : true,
    runtimeAutoSaveEnabled: Object.prototype.hasOwnProperty.call(source, 'runtimeAutoSaveEnabled')
      ? Boolean(source.runtimeAutoSaveEnabled)
      : true,
    storageAutoSaveEnabled: Boolean(source.storageAutoSaveEnabled),
    llmSettingsAutoSaveEnabled: Object.prototype.hasOwnProperty.call(source, 'llmSettingsAutoSaveEnabled')
      ? Boolean(source.llmSettingsAutoSaveEnabled)
      : true,
  };
}

export function useUiSettingsAuthority({
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
  });

  const saveMutation = useMutation({
    mutationFn: (payload: UiSettingsPayload) => api.put<Record<string, unknown>>('/ui-settings', payload),
    onSuccess: (response) => {
      const next = sanitizeUiSettings(response);
      queryClient.setQueryData(UI_SETTINGS_QUERY_KEY, next);
      onPersisted?.(next);
    },
    onError,
  });

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
