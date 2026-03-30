import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { StudioConfig } from '../../../types/studio.ts';

interface StudioPersistenceAuthorityOptions {
  category: string;
  onStudioDocsSaved?: () => void;
}

export function useStudioPersistenceAuthority({
  category,
  onStudioDocsSaved,
}: StudioPersistenceAuthorityOptions) {
  const queryClient = useQueryClient();

  // WHY: Single PUT — server validates + normalizes. No pre-flight POST needed.
  const persistStudioMap = async (body: StudioConfig) => {
    return api.put<unknown>(`/studio/${category}/field-studio-map`, body);
  };

  const saveMapMut = useMutation({
    mutationFn: (body: StudioConfig) => persistStudioMap(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio-config', category] });
    },
  });

  const saveStudioDocsMut = useMutation({
    mutationFn: (body: StudioConfig) => persistStudioMap(body),
    onSuccess: () => {
      onStudioDocsSaved?.();
    },
    onError: (error: Error) => {
      console.error('[studio-persist] save failed:', error.message);
    },
  });

  return {
    saveMapMut,
    saveStudioDocsMut,
  };
}
