import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import type { StorageRunsResponse } from '../types';

export function useStorageRuns(enabled: boolean, category?: string) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  const qs = params.toString();
  const path = qs ? `/storage/runs?${qs}` : '/storage/runs';

  return useQuery({
    queryKey: ['storage', 'runs', category ?? ''],
    queryFn: () => api.get<StorageRunsResponse>(path),
    enabled,
    staleTime: 15_000,
  });
}
