import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { createSettingsOptimisticMutationContract } from './settingsMutationContract';
import { publishSettingsPropagation } from './settingsPropagationContract';

export interface SourceStrategyRow {
  id: number;
  host: string;
  display_name: string;
  source_type: string;
  default_tier: number;
  discovery_method: string;
  search_pattern: string | null;
  priority: number;
  enabled: number;
  category_scope: string | null;
  notes: string | null;
}

interface SourceStrategyAuthorityOptions {
  category: string;
  enabled?: boolean;
  autoQueryEnabled?: boolean;
  onError?: (error: Error | unknown) => void;
  onToggled?: (row: SourceStrategyRow) => void;
  onDeleted?: (id: number) => void;
}

interface SourceStrategyAuthorityResult {
  rows: SourceStrategyRow[];
  isLoading: boolean;
  isSaving: boolean;
  isToggling: boolean;
  isDeleting: boolean;
  reload: () => Promise<SourceStrategyRow[] | undefined>;
  toggleEnabled: (row: SourceStrategyRow) => void;
  deleteRow: (id: number) => void;
}

export function useSourceStrategyAuthority({
  category,
  enabled = true,
  autoQueryEnabled = true,
  onError,
  onToggled,
  onDeleted,
}: SourceStrategyAuthorityOptions): SourceStrategyAuthorityResult {
  const queryClient = useQueryClient();
  const queryKey = ['source-strategy', category] as const;
  const categoryQuery = `?category=${encodeURIComponent(category)}`;
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<SourceStrategyRow[]>(`/source-strategy${categoryQuery}`),
    enabled: enabled && autoQueryEnabled,
  });

  const toggleMutation = useMutation(
    createSettingsOptimisticMutationContract<SourceStrategyRow, SourceStrategyRow, SourceStrategyRow[], SourceStrategyRow>({
      queryClient,
      queryKey,
      mutationFn: (row) =>
        api.put<SourceStrategyRow>(
          `/source-strategy/${row.id}${categoryQuery}`,
          { enabled: row.enabled ? 0 : 1 },
        ),
      toOptimisticData: (row, previousRows) => {
        const baseline = Array.isArray(previousRows) ? previousRows : [];
        return baseline.map((item) => (
          item.id === row.id ? { ...item, enabled: item.enabled ? 0 : 1 } : item
        ));
      },
      toAppliedData: (nextRow, _row, previousRows) => {
        const baseline = Array.isArray(previousRows) ? previousRows : [];
        return baseline.map((item) => (item.id === nextRow.id ? nextRow : item));
      },
      toPersistedResult: (nextRow) => nextRow,
      onPersisted: (nextRow) => {
        publishSettingsPropagation({ domain: 'source-strategy', category });
        onToggled?.(nextRow);
      },
      onError,
    }),
  );

  const deleteMutation = useMutation(
    createSettingsOptimisticMutationContract<number, unknown, SourceStrategyRow[], number>({
      queryClient,
      queryKey,
      mutationFn: (id) => api.del<unknown>(`/source-strategy/${id}${categoryQuery}`),
      toOptimisticData: (id, previousRows) => {
        const baseline = Array.isArray(previousRows) ? previousRows : [];
        return baseline.filter((row) => row.id !== id);
      },
      toAppliedData: (_response, id, previousRows) => {
        const baseline = Array.isArray(previousRows) ? previousRows : [];
        return baseline.filter((row) => row.id !== id);
      },
      toPersistedResult: (_response, id) => id,
      onPersisted: (id) => {
        publishSettingsPropagation({ domain: 'source-strategy', category });
        onDeleted?.(id);
      },
      onError,
    }),
  );

  async function reload() {
    if (!enabled) return undefined;
    const result = await refetch();
    return result.data;
  }

  function toggleEnabled(row: SourceStrategyRow) {
    if (!enabled) return;
    toggleMutation.mutate(row);
  }

  function deleteRow(id: number) {
    if (!enabled) return;
    deleteMutation.mutate(id);
  }

  return {
    rows,
    isLoading: enabled ? isLoading : false,
    isSaving: toggleMutation.isPending || deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isDeleting: deleteMutation.isPending,
    reload,
    toggleEnabled,
    deleteRow,
  };
}
