import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { CatalogRow } from '../types/product';

interface UseCatalogQueryOptions {
  category: string;
  refetchIntervalMs?: number;
}

export function useCatalogQuery({ category, refetchIntervalMs = 10_000 }: UseCatalogQueryOptions) {
  return useQuery({
    queryKey: ['catalog', category],
    queryFn: () => api.get<CatalogRow[]>(`/catalog/${category}`),
    refetchInterval: refetchIntervalMs,
  });
}

