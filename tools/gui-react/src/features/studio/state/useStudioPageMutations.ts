import { useCallback } from 'react';
import {
  useMutation,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { api } from '../../../api/client.ts';
import type { FieldStudioMapResponse } from '../../../types/studio.ts';
import type { FieldStudioMapValidationResponse } from '../components/studioSharedTypes.ts';
import type { StudioTabId } from './studioPageTabs.ts';
import { assertFieldStudioMapValidationOrThrow } from './mapValidationPreflight.js';

interface CompileResponse {
  operationId: string;
  type: string;
  category: string;
  running: boolean;
}

export interface RunEnumConsistencyOptions {
  reviewEnabled?: boolean;
  formatGuidance?: string;
}

export interface UseStudioPageMutationsInput {
  category: string;
  queryClient: QueryClient;
  setActiveTab: (nextTab: StudioTabId) => void;
}

export interface UseStudioPageMutationsResult {
  compileMut: UseMutationResult<CompileResponse, Error, void>;
  validateRulesMut: UseMutationResult<CompileResponse, Error, void>;
  enumConsistencyMut: UseMutationResult<
    unknown,
    Error,
    {
      field: string;
      apply?: boolean;
      formatGuidance?: string;
      reviewEnabled?: boolean;
    }
  >;
  runCompileFromStudio: () => Promise<CompileResponse>;
  runEnumConsistency: (
    fieldKey: string,
    options?: RunEnumConsistencyOptions,
  ) => Promise<unknown>;
  refreshStudioData: () => Promise<void>;
}

export function useStudioPageMutations({
  category,
  queryClient,
  setActiveTab,
}: UseStudioPageMutationsInput): UseStudioPageMutationsResult {
  const compileMut = useMutation<CompileResponse, Error, void>({
    mutationFn: async () => {
      const currentMap = await api.get<FieldStudioMapResponse>(
        `/studio/${category}/field-studio-map`,
      );
      const validation = await api.post<FieldStudioMapValidationResponse>(
        `/studio/${category}/validate-field-studio-map`,
        currentMap?.map || {},
      );
      assertFieldStudioMapValidationOrThrow({
        result: validation,
        actionLabel: 'compile',
        allowLegacyCompileBypass: true,
      });
      return api.post<CompileResponse>(`/studio/${category}/compile`);
    },
    // WHY: No onSuccess needed — operation lifecycle comes via operations WS channel
  });

  const validateRulesMut = useMutation<CompileResponse, Error, void>({
    mutationFn: () =>
      api.post<CompileResponse>(`/studio/${category}/validate-rules`),
    // WHY: No onSuccess needed — operation lifecycle comes via operations WS channel
  });

  const enumConsistencyMut = useMutation({
    mutationFn: (body: {
      field: string;
      apply?: boolean;
      formatGuidance?: string;
      reviewEnabled?: boolean;
    }) => api.post(`/studio/${category}/enum-consistency`, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['enumReviewData', category],
      });
      await queryClient.invalidateQueries({
        queryKey: ['reviewProductsIndex', category],
      });
      await queryClient.invalidateQueries({
        queryKey: ['studio-known-values', category],
      });
    },
  });

  const runCompileFromStudio = useCallback(async () => {
    setActiveTab('reports');
    return compileMut.mutateAsync();
  }, [setActiveTab, compileMut]);

  const runEnumConsistency = useCallback(
    (fieldKey: string, options?: RunEnumConsistencyOptions) =>
      enumConsistencyMut.mutateAsync({
        field: fieldKey,
        apply: options?.reviewEnabled !== false,
        formatGuidance: options?.formatGuidance,
        reviewEnabled: options?.reviewEnabled,
      }),
    [enumConsistencyMut],
  );

  const refreshStudioData = useCallback(async () => {
    await api.post(`/studio/${category}/invalidate-cache`);
  }, [category]);

  return {
    compileMut,
    validateRulesMut,
    enumConsistencyMut,
    runCompileFromStudio,
    runEnumConsistency,
    refreshStudioData,
  };
}
