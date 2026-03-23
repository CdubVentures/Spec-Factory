import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { parseCatalogRows } from '../features/catalog/api/catalogParsers';

interface UseCatalogQueryOptions {
  category: string;
  refetchIntervalMs?: number;
}

export function useCatalogQuery({ category, refetchIntervalMs = 10_000 }: UseCatalogQueryOptions) {
  return useQuery({
    queryKey: ['catalog', category],
    queryFn: () => api.parsedGet(`/catalog/${category}`, parseCatalogRows),
    refetchInterval: refetchIntervalMs,
  });
}

