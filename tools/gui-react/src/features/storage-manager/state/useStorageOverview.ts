import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { StorageOverviewResponse } from '../types.ts';

export function useStorageOverview(enabled: boolean) {
  return useQuery({
    queryKey: ['storage', 'overview'],
    queryFn: () => api.get<StorageOverviewResponse>('/storage/overview'),
    enabled,
    staleTime: 30_000,
  });
}
