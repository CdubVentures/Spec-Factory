// WHY: React Query hooks for per-category spec seed templates.
// Pattern follows sourceStrategyAuthority.ts.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';

interface SpecSeedsResponse {
  category: string;
  seeds: string[];
}

function specSeedsQueryKey(category: string) {
  return ['spec-seeds', category] as const;
}

export function useSpecSeedsAuthority({
  category,
  enabled,
  onError,
  onSaved,
}: {
  category: string;
  enabled: boolean;
  onError?: (e: unknown) => void;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: specSeedsQueryKey(category),
    queryFn: () => api.get<SpecSeedsResponse>(`/spec-seeds?category=${encodeURIComponent(category)}`),
    enabled: enabled && Boolean(category),
  });

  const mutation = useMutation({
    mutationFn: (seeds: string[]) =>
      api.put<SpecSeedsResponse>(`/spec-seeds?category=${encodeURIComponent(category)}`, { seeds }),
    onSuccess: (result) => {
      queryClient.setQueryData(specSeedsQueryKey(category), result);
      onSaved?.();
    },
    onError: (err) => {
      onError?.(err);
    },
  });

  return {
    seeds: data?.seeds ?? ['{product} specifications'],
    isLoading,
    isError,
    errorMessage: isError && error instanceof Error ? error.message : '',
    isSaving: mutation.isPending,
    saveSeeds: mutation.mutate,
  };
}
