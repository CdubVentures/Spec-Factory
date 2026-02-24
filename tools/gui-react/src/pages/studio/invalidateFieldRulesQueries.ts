import type { QueryClient } from '@tanstack/react-query';
import { invalidateDataChangeQueries } from '../../api/dataChangeInvalidationMap.js';

export function invalidateFieldRulesQueries(qc: QueryClient, category: string) {
  invalidateDataChangeQueries({
    queryClient: qc,
    message: {
      type: 'data-change',
      event: 'fallback-broadcast',
    },
    categories: [category],
    fallbackCategory: category,
  });
}
