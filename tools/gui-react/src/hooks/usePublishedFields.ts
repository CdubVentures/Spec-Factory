import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.ts';

/**
 * Published fields for a single product.
 * O(1) reuse: any module imports this hook to check publish state.
 *
 * Usage:
 *   const { published, isPublished } = usePublishedFields(category, productId);
 *   isPublished('colors')  // true if colors has a resolved candidate
 *   published['colors']    // { value, confidence, source, resolved_at }
 */

export interface PublishedFieldEntry {
  value: string | readonly string[] | null;
  confidence: number;
  source: string;
  resolved_at: string;
}

interface PublishedFieldsResponse {
  product_id: string;
  fields: Record<string, PublishedFieldEntry>;
}

export function usePublishedFields(category: string | undefined, productId: string | undefined) {
  const { data } = useQuery({
    queryKey: ['publisher', 'published', category, productId],
    queryFn: () => api.get<PublishedFieldsResponse>(`/publisher/${category}/published/${productId}`),
    enabled: Boolean(category && productId),
    staleTime: 10_000,
  });

  const published = data?.fields ?? {};

  function isPublished(fieldKey: string): boolean {
    return fieldKey in published;
  }

  return { published, isPublished };
}
