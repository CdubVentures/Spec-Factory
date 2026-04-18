// WHY: Generic react-query hooks for the universal suppressions API. Works for
// every finder module — routePrefix is looked up from finderPanelRegistry so a
// new module added to the backend registry inherits these hooks for free.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api } from '../../../api/client.ts';
import { FINDER_PANELS } from '../../../features/indexing/state/finderPanelRegistry.generated.ts';

export interface DiscoverySuppressionRow {
  item: string;
  kind: 'url' | 'query';
  variant_id: string;
  mode: string;
  suppressed_at: string;
}

interface SuppressionsResponse {
  suppressions: DiscoverySuppressionRow[];
}

interface OkResponse { ok: boolean }

function resolveRoutePrefix(finderId: string): string {
  const panel = FINDER_PANELS.find((p) => p.id === finderId);
  if (!panel || !panel.routePrefix) {
    throw new Error(`Unknown finder id: ${finderId}`);
  }
  return panel.routePrefix;
}

function suppressionsKey(finderId: string, category: string, productId: string) {
  return ['finder-suppressions', finderId, category, productId] as const;
}

function baseUrl(finderId: string, category: string, productId: string) {
  return `/${resolveRoutePrefix(finderId)}/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/suppressions`;
}

export function useDiscoverySuppressionsQuery(finderId: string, category: string, productId: string) {
  return useQuery<SuppressionsResponse>({
    queryKey: suppressionsKey(finderId, category, productId),
    queryFn: () => api.get<SuppressionsResponse>(baseUrl(finderId, category, productId)),
    enabled: Boolean(finderId) && Boolean(category) && Boolean(productId),
  });
}

interface AddBody {
  item: string;
  kind: 'url' | 'query';
  variant_id?: string;
  mode?: string;
}

export function useAddDiscoverySuppressionMutation(finderId: string, category: string, productId: string) {
  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: suppressionsKey(finderId, category, productId) });
  }, [queryClient, finderId, category, productId]);

  return useMutation<OkResponse, Error, AddBody>({
    mutationFn: (body) => api.post<OkResponse>(baseUrl(finderId, category, productId), body),
    onSuccess: invalidate,
  });
}

export function useDeleteDiscoverySuppressionItemMutation(finderId: string, category: string, productId: string) {
  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: suppressionsKey(finderId, category, productId) });
  }, [queryClient, finderId, category, productId]);

  return useMutation<OkResponse, Error, AddBody>({
    mutationFn: (body) => api.del<OkResponse>(`${baseUrl(finderId, category, productId)}/item`, body),
    onSuccess: invalidate,
  });
}

interface DeleteScopeBody {
  variantId?: string;
  mode?: string;
}

export function useDeleteDiscoverySuppressionsByScopeMutation(finderId: string, category: string, productId: string) {
  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: suppressionsKey(finderId, category, productId) });
  }, [queryClient, finderId, category, productId]);

  return useMutation<OkResponse, Error, DeleteScopeBody>({
    mutationFn: (body) => {
      const qs = new URLSearchParams();
      if (body.variantId) qs.set('variantId', body.variantId);
      if (body.mode) qs.set('mode', body.mode);
      const url = `${baseUrl(finderId, category, productId)}${qs.toString() ? `?${qs.toString()}` : ''}`;
      return api.del<OkResponse>(url);
    },
    onSuccess: invalidate,
  });
}

export function useDeleteAllDiscoverySuppressionsMutation(finderId: string, category: string, productId: string) {
  const queryClient = useQueryClient();
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: suppressionsKey(finderId, category, productId) });
  }, [queryClient, finderId, category, productId]);

  return useMutation<OkResponse>({
    mutationFn: () => api.del<OkResponse>(`${baseUrl(finderId, category, productId)}/all`),
    onSuccess: invalidate,
  });
}

/** Convenience bundle for components that want all operations together. */
export function useDiscoverySuppressions(finderId: string, category: string, productId: string) {
  const query = useDiscoverySuppressionsQuery(finderId, category, productId);
  const addMut = useAddDiscoverySuppressionMutation(finderId, category, productId);
  const delItemMut = useDeleteDiscoverySuppressionItemMutation(finderId, category, productId);
  const delScopeMut = useDeleteDiscoverySuppressionsByScopeMutation(finderId, category, productId);
  const delAllMut = useDeleteAllDiscoverySuppressionsMutation(finderId, category, productId);

  return useMemo(() => ({
    suppressions: query.data?.suppressions || [],
    isLoading: query.isLoading,
    isError: query.isError,
    addSuppression: addMut.mutate,
    deleteSuppression: delItemMut.mutate,
    deleteByScope: delScopeMut.mutate,
    deleteAll: delAllMut.mutate,
    isPending: addMut.isPending || delItemMut.isPending || delScopeMut.isPending || delAllMut.isPending,
  }), [query.data, query.isLoading, query.isError, addMut.mutate, addMut.isPending, delItemMut.mutate, delItemMut.isPending, delScopeMut.mutate, delScopeMut.isPending, delAllMut.mutate, delAllMut.isPending]);
}
