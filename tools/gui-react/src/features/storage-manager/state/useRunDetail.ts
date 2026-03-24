import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { RunDetailResponse } from '../types.ts';

export function useRunDetail(runId: string | null) {
  return useQuery({
    queryKey: ['storage', 'runs', runId],
    queryFn: () => api.get<RunDetailResponse>(`/storage/runs/${encodeURIComponent(runId!)}`),
    enabled: Boolean(runId),
    staleTime: 60_000,
  });
}
