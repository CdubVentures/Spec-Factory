import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.ts';

export { creditChipClass, formatCredit } from './serperCreditHelpers.js';

export interface SerperCreditResponse {
  credit: number | null;
  configured: boolean;
  enabled: boolean;
  error?: string;
}

export function useSerperCreditQuery(refetchIntervalMs = 15_000) {
  return useQuery({
    queryKey: ['serperCredit'],
    queryFn: () => api.get<SerperCreditResponse>('/serper/credit'),
    refetchInterval: refetchIntervalMs,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });
}
