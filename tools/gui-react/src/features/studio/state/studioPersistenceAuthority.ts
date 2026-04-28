import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { FieldStudioMapResponse, StudioConfig } from '../../../types/studio.ts';

interface StudioPersistenceAuthorityOptions {
  category: string;
  onStudioDocsSaved?: () => void;
}

type StudioQueryClient = ReturnType<typeof useQueryClient>;

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

export function useStudioPersistenceAuthority({
  category,
  onStudioDocsSaved,
}: StudioPersistenceAuthorityOptions) {
  const queryClient = useQueryClient();

  // WHY: Single PUT — server validates + normalizes. No pre-flight POST needed.
  const persistStudioMap = async (body: StudioConfig) => {
    return api.put<FieldStudioMapResponse>(`/studio/${category}/field-studio-map`, body);
  };

  const saveMapMut = useMutation({
    mutationFn: (body: StudioConfig) => persistStudioMap(body),
    onSuccess: (response) => {
      patchStudioConfigCache({ queryClient, category, response });
    },
  });

  const saveStudioDocsMut = useMutation({
    mutationFn: (body: StudioConfig) => persistStudioMap(body),
    onSuccess: (response) => {
      patchStudioConfigCache({ queryClient, category, response });
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
