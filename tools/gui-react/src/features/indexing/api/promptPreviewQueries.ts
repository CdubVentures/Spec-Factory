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

// WHY: object key insertion order can drift across callers (spreads,
// helper builders, partial constructors). Stable stringification keeps
// semantically-identical bodies on a single React Query cache entry
// instead of producing accidental cache misses + duplicate fetches.
// Arrays preserve order — order is meaningful for snapshots like
// passenger_field_keys_snapshot.
export function stablePromptBodyKey(body: PromptPreviewRequestBody): string {
  return JSON.stringify(body, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
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
  // staleTime=0 → every modal open refetches, so the preview always reflects
  // the current resolved-field + settings state without needing surgical
  // invalidations from unrelated data-change events.
  const bodyKey = stablePromptBodyKey(body);
  return useQuery<PromptPreviewResponse>({
    queryKey: ['prompt-preview', finder, category, productId, bodyKey],
    queryFn: () => postPromptPreview(finder, category, productId, body),
    enabled: enabled && Boolean(category) && Boolean(productId),
    staleTime: 0,
  });
}
