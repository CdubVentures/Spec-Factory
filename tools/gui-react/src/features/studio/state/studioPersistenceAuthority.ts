import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { FieldStudioMapResponse, StudioConfig } from '../../../types/studio.ts';
import { hasStudioMapPayload } from './studioPagePersistence.ts';

interface StudioPersistenceAuthorityOptions {
  category: string;
  onStudioDocsSaved?: () => void;
}

type StudioQueryClient = ReturnType<typeof useQueryClient>;

type StudioPersistenceResult =
  | { skipped: false; response: FieldStudioMapResponse }
  | { skipped: true; response: FieldStudioMapResponse | null };

function listHasRows(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function patchStudioConfigCache({
  queryClient,
  category,
  response,
}: {
  queryClient: StudioQueryClient;
  category: string;
  response: FieldStudioMapResponse;
}): void {
  queryClient.setQueryData(['studio-config', category], response);
}

function preserveCachedComponentSources({
  body,
  queryClient,
  category,
}: {
  body: StudioConfig;
  queryClient: StudioQueryClient;
  category: string;
}): StudioConfig {
  if (listHasRows(body.component_sources)) return body;

  const cached = queryClient.getQueryData<FieldStudioMapResponse>(['studio-config', category]);
  const cachedSources = cached?.map?.component_sources;
  if (!listHasRows(cachedSources)) return body;

  return {
    ...body,
    component_sources: cachedSources,
  };
}

export function useStudioPersistenceAuthority({
  category,
  onStudioDocsSaved,
}: StudioPersistenceAuthorityOptions) {
  const queryClient = useQueryClient();

  // WHY: Single PUT — server validates + normalizes. No pre-flight POST needed.
  const persistStudioMap = async (body: StudioConfig): Promise<StudioPersistenceResult> => {
    if (!hasStudioMapPayload(body)) {
      return {
        skipped: true,
        response: queryClient.getQueryData<FieldStudioMapResponse>(['studio-config', category]) ?? null,
      };
    }
    const safeBody = preserveCachedComponentSources({ body, queryClient, category });
    const response = await api.put<FieldStudioMapResponse>(`/studio/${category}/field-studio-map`, safeBody);
    return { skipped: false, response };
  };

  const saveMapMut = useMutation({
    mutationFn: (body: StudioConfig) => persistStudioMap(body),
    onSuccess: (result) => {
      if (result.skipped) return;
      patchStudioConfigCache({ queryClient, category, response: result.response });
    },
  });

  const saveStudioDocsMut = useMutation({
    mutationFn: (body: StudioConfig) => persistStudioMap(body),
    onSuccess: (result) => {
      if (result.skipped) return;
      patchStudioConfigCache({ queryClient, category, response: result.response });
      onStudioDocsSaved?.();
    },
    onError: (error: Error) => {
      console.error('[studio-persist] save failed:', error.message);
    },
  });

  // WHY: Fire-and-forget order persistence. No query invalidation — this
  // intentionally avoids triggering React Query refetch → rehydration.
  const saveFieldKeyOrderMut = useMutation({
    mutationFn: (order: string[]) =>
      api.put<{ ok: boolean }>(`/studio/${category}/field-key-order`, { order }),
  });

  return {
    saveMapMut,
    saveStudioDocsMut,
    saveFieldKeyOrderMut,
  };
}
