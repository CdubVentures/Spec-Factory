/**
 * Module Settings Authority — per-category per-module settings hook.
 *
 * Follows the source-strategy pattern: React Query with category-scoped
 * cache keys, so switching categories auto-refetches.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';

interface ModuleSettingsResponse {
  category: string;
  module: string;
  settings: Record<string, string>;
}

function moduleSettingsQueryKey(category: string, moduleId: string) {
  return ['module-settings', category, moduleId] as const;
}

export function useModuleSettingsAuthority({
  category,
  moduleId,
}: {
  category: string;
  moduleId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = moduleSettingsQueryKey(category, moduleId);

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => api.get<ModuleSettingsResponse>(`/module-settings/${encodeURIComponent(category)}/${encodeURIComponent(moduleId)}`),
    enabled: Boolean(category && moduleId),
  });

  const mutation = useMutation({
    mutationFn: (settings: Record<string, string>) =>
      api.put<ModuleSettingsResponse>(
        `/module-settings/${encodeURIComponent(category)}/${encodeURIComponent(moduleId)}`,
        { settings },
      ),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
    },
  });

  return {
    settings: data?.settings ?? {},
    isLoading,
    error: error ? String(error) : null,
    isSaving: mutation.isPending,
    saveSetting: (key: string, value: string) => {
      mutation.mutate({ [key]: value });
    },
    saveSettings: (settings: Record<string, string>) => {
      mutation.mutate(settings);
    },
  };
}
