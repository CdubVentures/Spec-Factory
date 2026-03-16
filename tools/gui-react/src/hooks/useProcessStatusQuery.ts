import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ProcessStatus } from '../types/events';

export function useProcessStatusQuery(refetchIntervalMs = 5000) {
  return useQuery({
    queryKey: ['processStatus'],
    queryFn: () => api.get<ProcessStatus>('/process/status'),
    refetchInterval: refetchIntervalMs,
  });
}

