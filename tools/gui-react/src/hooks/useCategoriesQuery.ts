import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.ts';

export function useCategoriesQuery() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<string[]>('/categories?includeTest=true'),
  });
}

