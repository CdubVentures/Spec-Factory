import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { createSettingsOptimisticMutationContract } from '../../../stores/settingsMutationContract';
import { publishSettingsPropagation } from '../../../stores/settingsPropagationContract';
// WHY: O(1) — types and envelope extractor derived from backend contract SSOT.
import { extractSourceEntryFromEnvelope } from './sourceEntryDerived';
import type { SourceEntry, SourceEntryEnvelope } from './sourceEntryDerived';
export type { SourceEntry, DiscoveryConfig, CrawlConfig, FieldCoverage } from './sourceEntryDerived';

interface SourceStrategyAuthorityOptions {
  category: string;
  enabled?: boolean;
  autoQueryEnabled?: boolean;
  onError?: (error: Error | unknown) => void;
  onToggled?: (entry: SourceEntry) => void;
  onCreated?: (entry: SourceEntry) => void;
  onUpdated?: (entry: SourceEntry) => void;
  onDeleted?: (sourceId: string) => void;
}

interface SourceStrategyAuthorityResult {
  entries: SourceEntry[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  isSaving: boolean;
  isToggling: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  reload: () => Promise<SourceEntry[] | undefined>;
  createEntry: (payload: Partial<SourceEntry>) => void;
  updateEntry: (sourceId: string, payload: Partial<SourceEntry>) => void;
  toggleEnabled: (entry: SourceEntry) => void;
  deleteEntry: (sourceId: string) => void;
}

interface SourceStrategyReaderOptions {
  category: string;
  enabled?: boolean;
  autoQueryEnabled?: boolean;
}

interface SourceStrategyReaderResult {
  entries: SourceEntry[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  reload: () => Promise<SourceEntry[] | undefined>;
}

function errorMessage(error: Error | unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || '').trim() || 'Unable to load source strategy.';
}

export function sourceStrategyQueryKey(category: string) {
  return ['source-strategy', category] as const;
}

export function readSourceStrategySnapshot(
  queryClient: QueryClient,
  category: string,
): SourceEntry[] | undefined {
  const cached = queryClient.getQueryData<unknown>(sourceStrategyQueryKey(category));
  return Array.isArray(cached) ? cached as SourceEntry[] : undefined;
}

export function useSourceStrategyReader({
  category,
  enabled = true,
  autoQueryEnabled = true,
}: SourceStrategyReaderOptions): SourceStrategyReaderResult {
  const queryClient = useQueryClient();
  const queryKey = sourceStrategyQueryKey(category);
  const categoryQuery = `?category=${encodeURIComponent(category)}`;
  const { data: entries = [], isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<SourceEntry[]>(`/source-strategy${categoryQuery}`),
    enabled: enabled && autoQueryEnabled,
  });

  async function reload() {
    if (!enabled) return undefined;
    const result = await refetch();
    if (result.data) {
      queryClient.setQueryData(queryKey, result.data);
    }
    return result.data;
  }

  return {
    entries,
    isLoading: enabled ? isLoading : false,
    isError: enabled ? isError : false,
    errorMessage: enabled && isError ? errorMessage(error) : '',
    reload,
  };
}

export function useSourceStrategyAuthority({
  category,
  enabled = true,
  autoQueryEnabled = true,
  onError,
  onToggled,
  onCreated,
  onUpdated,
  onDeleted,
}: SourceStrategyAuthorityOptions): SourceStrategyAuthorityResult {
  const queryClient = useQueryClient();
  const queryKey = sourceStrategyQueryKey(category);
  const categoryQuery = `?category=${encodeURIComponent(category)}`;
  const { data: entries = [], isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<SourceEntry[]>(`/source-strategy${categoryQuery}`),
    enabled: enabled && autoQueryEnabled,
  });

  const toggleMutation = useMutation(
    createSettingsOptimisticMutationContract<SourceEntry, SourceEntryEnvelope, SourceEntry[], SourceEntry>({
      queryClient,
      queryKey,
      mutationFn: (entry) =>
        api.put<SourceEntryEnvelope>(
          `/source-strategy/${entry.sourceId}${categoryQuery}`,
          { discovery: { enabled: !entry.discovery.enabled } },
        ),
      toOptimisticData: (entry, previousEntries) => {
        const baseline = Array.isArray(previousEntries) ? previousEntries : [];
        return baseline.map((item) => (
          item.sourceId === entry.sourceId
            ? { ...item, discovery: { ...item.discovery, enabled: !item.discovery.enabled } }
            : item
        ));
      },
      toAppliedData: (response, _entry, previousEntries) => {
        const nextEntry = extractSourceEntryFromEnvelope(response);
        const baseline = Array.isArray(previousEntries) ? previousEntries : [];
        return baseline.map((item) => (item.sourceId === nextEntry.sourceId ? nextEntry : item));
      },
      toPersistedResult: (response) => extractSourceEntryFromEnvelope(response),
      onPersisted: (nextEntry) => {
        publishSettingsPropagation({ domain: 'source-strategy', category });
        onToggled?.(nextEntry);
      },
      onError,
    }),
  );

  const createMutation = useMutation({
    mutationFn: (payload: Partial<SourceEntry>) =>
      api.post<{ ok: boolean; sourceId?: string }>(`/source-strategy${categoryQuery}`, payload),
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey });
      const sid = response?.sourceId || '';
      const updatedEntries = queryClient.getQueryData<SourceEntry[]>(queryKey) || [];
      const created = updatedEntries.find((e) => e.sourceId === sid) || updatedEntries[0];
      if (created) {
        publishSettingsPropagation({ domain: 'source-strategy', category });
        onCreated?.(created);
      }
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: ({ sourceId, payload }: { sourceId: string; payload: Partial<SourceEntry> }) =>
      api.put<SourceEntryEnvelope>(`/source-strategy/${sourceId}${categoryQuery}`, payload),
    onSuccess: (response) => {
      const updatedEntry = extractSourceEntryFromEnvelope(response);
      const baseline = queryClient.getQueryData<SourceEntry[]>(queryKey) || [];
      queryClient.setQueryData(
        queryKey,
        baseline.map((e) => (e.sourceId === updatedEntry.sourceId ? updatedEntry : e)),
      );
      publishSettingsPropagation({ domain: 'source-strategy', category });
      onUpdated?.(updatedEntry);
    },
    onError,
  });

  const deleteMutation = useMutation(
    createSettingsOptimisticMutationContract<string, unknown, SourceEntry[], string>({
      queryClient,
      queryKey,
      mutationFn: (sourceId) => api.del<unknown>(`/source-strategy/${sourceId}${categoryQuery}`),
      toOptimisticData: (sourceId, previousEntries) => {
        const baseline = Array.isArray(previousEntries) ? previousEntries : [];
        return baseline.filter((e) => e.sourceId !== sourceId);
      },
      toAppliedData: (_response, sourceId, previousEntries) => {
        const baseline = Array.isArray(previousEntries) ? previousEntries : [];
        return baseline.filter((e) => e.sourceId !== sourceId);
      },
      toPersistedResult: (_response, sourceId) => sourceId,
      onPersisted: (sourceId) => {
        publishSettingsPropagation({ domain: 'source-strategy', category });
        onDeleted?.(sourceId);
      },
      onError,
    }),
  );

  async function reload() {
    if (!enabled) return undefined;
    const result = await refetch();
    return result.data;
  }

  function createEntry(payload: Partial<SourceEntry>) {
    if (!enabled) return;
    createMutation.mutate(payload);
  }

  function updateEntry(sourceId: string, payload: Partial<SourceEntry>) {
    if (!enabled) return;
    updateMutation.mutate({ sourceId, payload });
  }

  function toggleEnabled(entry: SourceEntry) {
    if (!enabled) return;
    toggleMutation.mutate(entry);
  }

  function deleteEntry(sourceId: string) {
    if (!enabled) return;
    deleteMutation.mutate(sourceId);
  }

  return {
    entries,
    isLoading: enabled ? isLoading : false,
    isError: enabled ? isError : false,
    errorMessage: enabled && isError ? errorMessage(error) : '',
    isSaving: createMutation.isPending || updateMutation.isPending || toggleMutation.isPending || deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    reload,
    createEntry,
    updateEntry,
    toggleEnabled,
    deleteEntry,
  };
}
