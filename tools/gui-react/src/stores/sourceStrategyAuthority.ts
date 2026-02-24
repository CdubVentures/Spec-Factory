import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

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
  onError,
  onToggled,
  onDeleted,
}: SourceStrategyAuthorityOptions): SourceStrategyAuthorityResult {
  const queryKey = ['source-strategy', category] as const;
  const categoryQuery = `?category=${encodeURIComponent(category)}`;
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<SourceStrategyRow[]>(`/source-strategy${categoryQuery}`),
  });

  const toggleMutation = useMutation({
    mutationFn: (row: SourceStrategyRow) =>
      api.put<SourceStrategyRow>(
        `/source-strategy/${row.id}${categoryQuery}`,
        { enabled: row.enabled ? 0 : 1 },
      ),
    onSuccess: async (nextRow) => {
      await refetch();
      if (nextRow) {
        onToggled?.(nextRow);
      }
    },
    onError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.del<unknown>(`/source-strategy/${id}${categoryQuery}`),
    onSuccess: async (_result, id) => {
      await refetch();
      onDeleted?.(id);
    },
    onError,
  });

  async function reload() {
    const result = await refetch();
    return result.data;
  }

  function toggleEnabled(row: SourceStrategyRow) {
    toggleMutation.mutate(row);
  }

  function deleteRow(id: number) {
    deleteMutation.mutate(id);
  }

  return {
    rows,
    isLoading,
    isSaving: toggleMutation.isPending || deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isDeleting: deleteMutation.isPending,
    reload,
    toggleEnabled,
    deleteRow,
  };
}
