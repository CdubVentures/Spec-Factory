import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useDataChangeSubscription } from './useDataChangeSubscription.js';
import {
  AUTHORITY_SNAPSHOT_DOMAINS,
  buildAuthorityVersionToken,
  shouldRefreshAuthoritySnapshot,
  resolveAuthoritySnapshotInvalidationQueryKeys,
} from './authoritySnapshotHelpers.js';

function isEnabledCategory(category) {
  const token = String(category || '').trim();
  return Boolean(token) && token !== 'all';
}

export function useAuthoritySnapshot({
  category,
  enabled = true,
  refetchIntervalMs = 10000,
} = {}) {
  const queryClient = useQueryClient();
  const active = Boolean(enabled) && isEnabledCategory(category);
  const normalizedCategory = String(category || '').trim();

  const query = useQuery({
    queryKey: ['data-authority', 'snapshot', normalizedCategory],
    queryFn: () => api.get(`/data-authority/${encodeURIComponent(normalizedCategory)}/snapshot`),
    enabled: active,
    staleTime: 2500,
    refetchInterval: active ? refetchIntervalMs : false,
  });

  const refreshFromDataChange = useCallback((message) => {
    if (!shouldRefreshAuthoritySnapshot({
      message,
      category: normalizedCategory,
      domains: AUTHORITY_SNAPSHOT_DOMAINS,
    })) {
      return;
    }
    const queryKeys = resolveAuthoritySnapshotInvalidationQueryKeys({
      message,
      category: normalizedCategory,
    });
    for (const queryKey of queryKeys) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [normalizedCategory, queryClient]);

  useDataChangeSubscription({
    category: normalizedCategory,
    domains: AUTHORITY_SNAPSHOT_DOMAINS,
    enabled: active,
    onDataChange: refreshFromDataChange,
  });

  return {
    ...query,
    snapshot: query.data || null,
    authorityVersionToken: buildAuthorityVersionToken(query.data),
  };
}
