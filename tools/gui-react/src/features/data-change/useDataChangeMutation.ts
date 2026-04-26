import {
  useMutation,
  useQueryClient,
  type MutationFunction,
  type MutationFunctionContext,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
} from '@tanstack/react-query';
import {
  DATA_CHANGE_EVENT_DOMAIN_FALLBACK,
  invalidateDataChangeQueries,
} from './invalidationResolver.js';

type QueryKeyResolver<TData, TVariables, TOnMutateResult> = (args: {
  readonly data: TData;
  readonly variables: TVariables;
  readonly onMutateResult: TOnMutateResult;
  readonly mutationContext: MutationFunctionContext;
}) => readonly QueryKey[];

type QueryKeyInput<TData, TVariables, TOnMutateResult> =
  | readonly QueryKey[]
  | QueryKeyResolver<TData, TVariables, TOnMutateResult>;

export interface UseDataChangeMutationArgs<TData, TError, TVariables, TOnMutateResult> {
  readonly event: string;
  readonly category?: string;
  readonly categories?: readonly string[];
  readonly mutationFn: MutationFunction<TData, TVariables>;
  readonly extraQueryKeys?: QueryKeyInput<TData, TVariables, TOnMutateResult>;
  readonly removeQueryKeys?: QueryKeyInput<TData, TVariables, TOnMutateResult>;
  readonly options?: Omit<
    UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
    'mutationFn' | 'onSuccess'
  > & {
    readonly onSuccess?: UseMutationOptions<TData, TError, TVariables, TOnMutateResult>['onSuccess'];
  };
}

function queryKeySignature(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey);
}

function resolveQueryKeyInput<TData, TVariables, TOnMutateResult>(
  input: QueryKeyInput<TData, TVariables, TOnMutateResult> | undefined,
  args: {
    readonly data: TData;
    readonly variables: TVariables;
    readonly onMutateResult: TOnMutateResult;
    readonly mutationContext: MutationFunctionContext;
  },
): readonly QueryKey[] {
  if (!input) return [];
  return typeof input === 'function' ? input(args) : input;
}

function assertKnownDataChangeEvent(event: string): void {
  if (Object.prototype.hasOwnProperty.call(DATA_CHANGE_EVENT_DOMAIN_FALLBACK, event)) return;
  throw new Error(`Unknown data-change event: ${event}`);
}

export function useDataChangeMutation<
  TData,
  TError = Error,
  TVariables = void,
  TOnMutateResult = unknown,
>({
  event,
  category = '',
  categories = [],
  mutationFn,
  extraQueryKeys,
  removeQueryKeys,
  options,
}: UseDataChangeMutationArgs<TData, TError, TVariables, TOnMutateResult>): UseMutationResult<TData, TError, TVariables, TOnMutateResult> {
  assertKnownDataChangeEvent(event);
  const queryClient = useQueryClient();

  return useMutation<TData, TError, TVariables, TOnMutateResult>({
    ...options,
    mutationFn,
    onSuccess: (data, variables, onMutateResult, mutationContext) => {
      const resolverArgs = { data, variables, onMutateResult, mutationContext };
      const removedKeys = resolveQueryKeyInput(removeQueryKeys, resolverArgs);
      for (const queryKey of removedKeys) {
        queryClient.removeQueries({ queryKey });
      }

      const invalidatedKeys = invalidateDataChangeQueries({
        queryClient,
        message: { type: 'data-change', event, category },
        categories: categories.length > 0 ? [...categories] : [],
        fallbackCategory: category,
      });

      const seen = new Set(invalidatedKeys.map(queryKeySignature));
      for (const queryKey of resolveQueryKeyInput(extraQueryKeys, resolverArgs)) {
        const signature = queryKeySignature(queryKey);
        if (seen.has(signature)) continue;
        seen.add(signature);
        queryClient.invalidateQueries({ queryKey });
      }

      return options?.onSuccess?.(data, variables, onMutateResult, mutationContext);
    },
  });
}
