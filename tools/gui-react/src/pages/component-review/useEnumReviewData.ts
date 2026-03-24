import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import {
  getEnumReviewQueryKey,
  normalizeEnumReviewCategory,
  shouldEnableEnumReviewQuery,
} from './enumReviewStore.js';
import type { EnumReviewPayload } from '../../types/componentReview.ts';

interface UseEnumReviewDataOptions {
  category: string;
  enabled?: boolean;
}

export function useEnumReviewData({
  category,
  enabled = true,
}: UseEnumReviewDataOptions) {
  const normalizedCategory = normalizeEnumReviewCategory(category);
  return useQuery({
    queryKey: getEnumReviewQueryKey(normalizedCategory),
    queryFn: () => api.get<EnumReviewPayload>(`/review-components/${normalizedCategory}/enums`),
    enabled: shouldEnableEnumReviewQuery(normalizedCategory, enabled),
  });
}
