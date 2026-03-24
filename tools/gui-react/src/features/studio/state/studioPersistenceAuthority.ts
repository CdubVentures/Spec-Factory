import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import {
  assertFieldStudioMapValidationOrThrow,
  resolveFieldStudioMapPayloadForSave,
} from './mapValidationPreflight.js';
import type { StudioConfig } from '../../../types/studio';
import type { FieldStudioMapValidationResponse } from '../components/studioSharedTypes';

interface StudioPersistenceAuthorityOptions {
  category: string;
  onStudioDocsSaved?: () => void;
}

export function useStudioPersistenceAuthority({
  category,
  onStudioDocsSaved,
}: StudioPersistenceAuthorityOptions) {
  const queryClient = useQueryClient();

  const persistStudioMap = async (body: StudioConfig) => {
    const validation = await api.post<FieldStudioMapValidationResponse>(`/studio/${category}/validate-field-studio-map`, body);
    const payload = resolveFieldStudioMapPayloadForSave({
      result: assertFieldStudioMapValidationOrThrow({
        result: validation,
        actionLabel: 'save mapping',
      }),
      fallback: body,
    }) as StudioConfig;
    return api.put<unknown>(`/studio/${category}/field-studio-map`, payload);
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
  });

  return {
    saveMapMut,
    saveStudioDocsMut,
  };
}
