import { useCallback, useEffect } from 'react';
import {
  useMutation,
  type QueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';

import { api } from '../../../api/client.ts';
import type { ProcessStatus } from '../../../types/events.ts';
import type { FieldStudioMapResponse } from '../../../types/studio.ts';
import type { FieldStudioMapValidationResponse } from '../components/studioSharedTypes.ts';
import type { StudioTabId } from './studioPageTabs.ts';
import { invalidateFieldRulesQueries } from './invalidateFieldRulesQueries.ts';
import { assertFieldStudioMapValidationOrThrow } from './mapValidationPreflight.js';

export interface StudioProcessStatusSnapshot {
  running?: boolean;
  exitCode?: number | null;
}

export interface RunEnumConsistencyOptions {
  reviewEnabled?: boolean;
  formatGuidance?: string;
}

export interface UseStudioPageMutationsInput {
  category: string;
  processStatus?: StudioProcessStatusSnapshot | null;
  queryClient: QueryClient;
  setActiveTab: (nextTab: StudioTabId) => void;
  setProcessStatus: (status: ProcessStatus) => void;
}

export interface UseStudioPageMutationsResult {
  compileMut: UseMutationResult<ProcessStatus, Error, void>;
  validateRulesMut: UseMutationResult<ProcessStatus, Error, void>;
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
  runCompileFromStudio: () => Promise<ProcessStatus>;
  runEnumConsistency: (
    fieldKey: string,
    options?: RunEnumConsistencyOptions,
  ) => Promise<unknown>;
  refreshStudioData: () => Promise<void>;
}

export function useStudioPageMutations({
  category,
  processStatus,
  queryClient,
  setActiveTab,
  setProcessStatus,
}: UseStudioPageMutationsInput): UseStudioPageMutationsResult {
  useEffect(() => {
    if (!processStatus?.running && processStatus?.exitCode !== undefined) {
      invalidateFieldRulesQueries(queryClient, category);
    }
  }, [processStatus?.running, processStatus?.exitCode, queryClient, category]);

  const compileMut = useMutation<ProcessStatus, Error, void>({
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
      return api.post<ProcessStatus>(`/studio/${category}/compile`);
    },
    onSuccess: (data) => setProcessStatus(data),
  });

  const validateRulesMut = useMutation<ProcessStatus, Error, void>({
    mutationFn: () =>
      api.post<ProcessStatus>(`/studio/${category}/validate-rules`),
    onSuccess: (data) => setProcessStatus(data),
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
    invalidateFieldRulesQueries(queryClient, category);
  }, [category, queryClient]);

  return {
    compileMut,
    validateRulesMut,
    enumConsistencyMut,
    runCompileFromStudio,
    runEnumConsistency,
    refreshStudioData,
  };
}
