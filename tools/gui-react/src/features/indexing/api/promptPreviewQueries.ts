import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type {
  PromptPreviewFinder,
  PromptPreviewRequestBody,
  PromptPreviewResponse,
} from './promptPreviewTypes.ts';

const FINDER_ROUTE_PREFIX: Record<PromptPreviewFinder, string> = {
  cef: 'color-edition-finder',
  pif: 'product-image-finder',
  rdf: 'release-date-finder',
  sku: 'sku-finder',
  key: 'key-finder',
};

function previewPromptUrl(finder: PromptPreviewFinder, category: string, productId: string): string {
  return `/${FINDER_ROUTE_PREFIX[finder]}/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/preview-prompt`;
}

export function postPromptPreview(
  finder: PromptPreviewFinder,
  category: string,
  productId: string,
  body: PromptPreviewRequestBody = {},
): Promise<PromptPreviewResponse> {
  return api.post<PromptPreviewResponse>(previewPromptUrl(finder, category, productId), body);
}

export function usePromptPreviewQuery(
  finder: PromptPreviewFinder,
  category: string,
  productId: string,
  body: PromptPreviewRequestBody,
  enabled: boolean,
): UseQueryResult<PromptPreviewResponse> {
  // WHY: body is serialized into the query key so switching modes (view/hero/loop)
  // for the same variant refetches instead of returning the previous mode's cache.
  const bodyKey = JSON.stringify(body);
  return useQuery<PromptPreviewResponse>({
    queryKey: ['prompt-preview', finder, category, productId, bodyKey],
    queryFn: () => postPromptPreview(finder, category, productId, body),
    enabled: enabled && Boolean(category) && Boolean(productId),
    staleTime: 60_000,
  });
}
