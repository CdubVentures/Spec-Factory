import { useMutation, type QueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ComponentReviewBatchResult } from '../types/componentReview';

interface UseRunComponentReviewBatchMutationOptions {
  category: string;
  queryClient: QueryClient;
}

export function useRunComponentReviewBatchMutation({
  category,
  queryClient,
}: UseRunComponentReviewBatchMutationOptions) {
  return useMutation({
    mutationFn: () =>
      api.post<ComponentReviewBatchResult>(`/review-components/${category}/run-component-review-batch`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReview', category] });
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category] });
      queryClient.invalidateQueries({ queryKey: ['reviewProductsIndex', category] });
    },
  });
}

