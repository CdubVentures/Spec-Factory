import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import {
  assertWorkbookMapValidationOrThrow,
  resolveWorkbookMapPayloadForSave,
} from './mapValidationPreflight.js';
import type { StudioConfig } from '../../types/studio';

interface FieldStudioMapValidationResponse {
  valid?: boolean;
  ok?: boolean;
  errors?: string[];
  warnings?: string[];
  normalized?: StudioConfig | null;
}

interface StudioPersistenceAuthorityOptions {
  category: string;
  onDraftsSaved?: () => void;
}

export function useStudioPersistenceAuthority({
  category,
  onDraftsSaved,
}: StudioPersistenceAuthorityOptions) {
  const queryClient = useQueryClient();

  const saveMapMut = useMutation({
    mutationFn: async (body: StudioConfig) => {
      const validation = await api.post<FieldStudioMapValidationResponse>(`/studio/${category}/validate-field-studio-map`, body);
      const payload = resolveWorkbookMapPayloadForSave({
        result: assertWorkbookMapValidationOrThrow({
          result: validation,
          actionLabel: 'save mapping',
        }),
        fallback: body,
      }) as StudioConfig;
      return api.put<unknown>(`/studio/${category}/field-studio-map`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studio-config', category] });
    },
  });

  const saveDraftsMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<unknown>(`/studio/${category}/save-drafts`, body),
    onSuccess: () => {
      onDraftsSaved?.();
    },
  });

  return {
    saveMapMut,
    saveDraftsMut,
  };
}
