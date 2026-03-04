import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
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
  onCreated?: (row: SourceStrategyRow) => void;
  onUpdated?: (row: SourceStrategyRow) => void;
  onDeleted?: (id: number) => void;
}

interface SourceStrategyAuthorityResult {
  rows: SourceStrategyRow[];
  isLoading: boolean;
  isSaving: boolean;
  isToggling: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  reload: () => Promise<SourceStrategyRow[] | undefined>;
  createRow: (payload: Partial<SourceStrategyRow>) => void;
  updateRow: (id: number, payload: Partial<SourceStrategyRow>) => void;
  toggleEnabled: (row: SourceStrategyRow) => void;
  deleteRow: (id: number) => void;
}

interface SourceStrategyReaderOptions {
  category: string;
  enabled?: boolean;
  autoQueryEnabled?: boolean;
}

interface SourceStrategyReaderResult {
  rows: SourceStrategyRow[];
  isLoading: boolean;
  reload: () => Promise<SourceStrategyRow[] | undefined>;
}

export function sourceStrategyQueryKey(category: string) {
  return ['source-strategy', category] as const;
}

export function readSourceStrategySnapshot(
  queryClient: QueryClient,
  category: string,
): SourceStrategyRow[] | undefined {
  const cached = queryClient.getQueryData<unknown>(sourceStrategyQueryKey(category));
  return Array.isArray(cached) ? cached as SourceStrategyRow[] : undefined;
}

export function useSourceStrategyReader({
  category,
  enabled = true,
  autoQueryEnabled = true,
}: SourceStrategyReaderOptions): SourceStrategyReaderResult {
  const queryClient = useQueryClient();
  const queryKey = sourceStrategyQueryKey(category);
  const categoryQuery = `?category=${encodeURIComponent(category)}`;
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<SourceStrategyRow[]>(`/source-strategy${categoryQuery}`),
    enabled: enabled && autoQueryEnabled,
  });

  async function reload() {
    if (!enabled) return undefined;
    const result = await refetch();
    if (result.data) {
      queryClient.setQueryData(queryKey, result.data);
    }
    return result.data;
  }

  return {
    rows,
    isLoading: enabled ? isLoading : false,
    reload,
  };
}

export function useSourceStrategyAuthority({
  category,
  enabled = true,
  autoQueryEnabled = true,
  onError,
  onToggled,
  onCreated,
  onUpdated,
  onDeleted,
}: SourceStrategyAuthorityOptions): SourceStrategyAuthorityResult {
  const queryClient = useQueryClient();
  const queryKey = sourceStrategyQueryKey(category);
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

  const createMutation = useMutation({
    mutationFn: (payload: Partial<SourceStrategyRow>) =>
      api.post<{ ok: boolean; id?: number }>(`/source-strategy${categoryQuery}`, payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey });
      const id = Number(response?.id || 0);
      const updatedRows = queryClient.getQueryData<SourceStrategyRow[]>(queryKey) || [];
      const created = updatedRows.find((row) => row.id === id) || updatedRows[0];
      if (created) {
        publishSettingsPropagation({ domain: 'source-strategy', category });
        onCreated?.(created);
      }
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<SourceStrategyRow> }) =>
      api.put<SourceStrategyRow>(`/source-strategy/${id}${categoryQuery}`, payload),
    onSuccess: (updatedRow) => {
      const baseline = queryClient.getQueryData<SourceStrategyRow[]>(queryKey) || [];
      queryClient.setQueryData(
        queryKey,
        baseline.map((row) => (row.id === updatedRow.id ? updatedRow : row)),
      );
      publishSettingsPropagation({ domain: 'source-strategy', category });
      onUpdated?.(updatedRow);
    },
    onError,
  });

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

  function createRow(payload: Partial<SourceStrategyRow>) {
    if (!enabled) return;
    createMutation.mutate(payload);
  }

  function updateRow(id: number, payload: Partial<SourceStrategyRow>) {
    if (!enabled) return;
    updateMutation.mutate({ id, payload });
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
    isSaving: createMutation.isPending || updateMutation.isPending || toggleMutation.isPending || deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    reload,
    createRow,
    updateRow,
    toggleEnabled,
    deleteRow,
  };
}
