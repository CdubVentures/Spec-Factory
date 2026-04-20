import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { Operation } from './operationsStore.ts';

interface CefVariantRegistryEntry {
  readonly variant_key?: string;
  readonly color_atoms?: readonly string[];
}

interface CefResult {
  readonly variant_registry?: readonly CefVariantRegistryEntry[];
}

/**
 * Fetch the CEF variant_registry for a variant op's (category, productId) and
 * expose it as a Map<variant_key, color_atoms[]>. Used by the ops tracker to
 * resolve color swatches — both `color:` and `edition:` keys resolve uniformly
 * here because the registry carries atoms for every variant type.
 *
 * React Query dedupes by queryKey, so many ops on the same product share a
 * single network request. Non-variant ops (cef, pipeline RUN, etc.) skip the
 * fetch entirely.
 */
export function useOpVariantAtomsMap(
  op: Pick<Operation, 'type' | 'category' | 'productId'>,
): ReadonlyMap<string, readonly string[]> {
  const isVariantOp = op.type === 'pif' || op.type === 'rdf';
  const enabled = isVariantOp && Boolean(op.category) && Boolean(op.productId);

  const { data } = useQuery<CefResult>({
    queryKey: ['color-edition-finder', op.category, op.productId],
    queryFn: () => api.get<CefResult>(
      `/color-edition-finder/${encodeURIComponent(op.category)}/${encodeURIComponent(op.productId)}`,
    ),
    enabled,
    staleTime: 60_000,
  });

  return useMemo(() => {
    const map = new Map<string, readonly string[]>();
    const registry = data?.variant_registry;
    if (Array.isArray(registry)) {
      for (const entry of registry) {
        if (typeof entry?.variant_key === 'string' && Array.isArray(entry?.color_atoms)) {
          map.set(entry.variant_key, entry.color_atoms);
        }
      }
    }
    return map;
  }, [data]);
}
