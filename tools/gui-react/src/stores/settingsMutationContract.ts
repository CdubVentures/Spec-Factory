import type { QueryClient, QueryKey } from '@tanstack/react-query';

export interface SettingsOptimisticMutationContext<TQueryData> {
  previousData: TQueryData | undefined;
  hadPreviousData: boolean;
}

interface CreateSettingsOptimisticMutationContractOptions<
  TPayload,
  TResponse,
  TQueryData,
  TPersisted,
> {
  queryClient: QueryClient;
  queryKey: QueryKey;
  mutationFn: (payload: TPayload) => Promise<TResponse>;
  toOptimisticData: (payload: TPayload, previousData: TQueryData | undefined) => TQueryData;
  toAppliedData: (
    response: TResponse,
    payload: TPayload,
    previousData: TQueryData | undefined,
  ) => TQueryData;
  toPersistedResult: (
    response: TResponse,
    payload: TPayload,
    previousData: TQueryData | undefined,
    appliedData: TQueryData,
  ) => TPersisted;
  onPersisted?: (result: TPersisted, payload: TPayload) => void;
  onError?: (error: Error | unknown) => void;
  rollbackOnError?: boolean;
}

function rollbackQueryData<TQueryData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  context: SettingsOptimisticMutationContext<TQueryData> | undefined,
) {
  if (!context) return;
  if (context.hadPreviousData) {
    queryClient.setQueryData(queryKey, context.previousData);
    return;
  }
  queryClient.removeQueries({ queryKey, exact: true });
}

export function createSettingsOptimisticMutationContract<
  TPayload,
  TResponse,
  TQueryData,
  TPersisted,
>({
  queryClient,
  queryKey,
  mutationFn,
  toOptimisticData,
  toAppliedData,
  toPersistedResult,
  onPersisted,
  onError,
  rollbackOnError = true,
}: CreateSettingsOptimisticMutationContractOptions<TPayload, TResponse, TQueryData, TPersisted>) {
  return {
    mutationFn,
    onMutate: async (payload: TPayload): Promise<SettingsOptimisticMutationContext<TQueryData>> => {
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData<TQueryData>(queryKey);
      const optimisticData = toOptimisticData(payload, previousData);
      queryClient.setQueryData(queryKey, optimisticData);
      return {
        previousData,
        hadPreviousData: previousData !== undefined,
      };
    },
    onSuccess: (
      response: TResponse,
      payload: TPayload,
      context: SettingsOptimisticMutationContext<TQueryData> | undefined,
    ) => {
      const previousData = context?.previousData;
      const appliedData = toAppliedData(response, payload, previousData);
      queryClient.setQueryData(queryKey, appliedData);
      const persistedResult = toPersistedResult(response, payload, previousData, appliedData);
      onPersisted?.(persistedResult, payload);
    },
    onError: (
      error: Error | unknown,
      _payload: TPayload,
      context: SettingsOptimisticMutationContext<TQueryData> | undefined,
    ) => {
      if (rollbackOnError) {
        rollbackQueryData(queryClient, queryKey, context);
      }
      onError?.(error);
    },
  } as const;
}

