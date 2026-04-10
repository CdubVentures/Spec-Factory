import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import type { UnitRegistryListResponse, UnitRegistrySingleResponse, UnitRegistryEntry } from './unitRegistryTypes.ts';

const QUERY_KEY = ['unit-registry'] as const;

export function useUnitRegistryQuery() {
  return useQuery<UnitRegistryListResponse>({
    queryKey: QUERY_KEY,
    queryFn: () => api.get<UnitRegistryListResponse>('/unit-registry'),
  });
}

export function useUpsertUnitMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entry: Partial<UnitRegistryEntry> & { canonical: string }) =>
      api.post<UnitRegistrySingleResponse>('/unit-registry', entry),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteUnitMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (canonical: string) =>
      api.del<{ deleted: boolean }>(`/unit-registry/${encodeURIComponent(canonical)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
