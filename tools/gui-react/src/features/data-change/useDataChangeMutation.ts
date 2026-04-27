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

interface DataChangeMessageEntities {
  readonly productIds?: readonly string[];
  readonly fieldKeys?: readonly string[];
}

interface DataChangeMutationMessage {
  readonly category?: string;
  readonly categories?: readonly string[];
  readonly domains?: readonly string[];
  readonly entities?: DataChangeMessageEntities;
  readonly meta?: Record<string, unknown>;
}

type DataChangeMessageResolver<TData, TVariables, TOnMutateResult> = (args: {
  readonly data: TData;
  readonly variables: TVariables;
  readonly onMutateResult: TOnMutateResult;
  readonly mutationContext: MutationFunctionContext;
}) => DataChangeMutationMessage;

export interface UseDataChangeMutationArgs<TData, TError, TVariables, TOnMutateResult> {
  readonly event: string;
  readonly category?: string;
  readonly categories?: readonly string[];
  readonly mutationFn: MutationFunction<TData, TVariables>;
  readonly resolveDataChangeMessage?: DataChangeMessageResolver<TData, TVariables, TOnMutateResult>;
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

function asStringArray(values: readonly string[] | undefined): string[] {
  return Array.isArray(values) ? [...values] : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function addEntityToken(tokens: string[], seen: Set<string>, value: unknown): void {
  const values = Array.isArray(value) ? value : [value];
  for (const rawValue of values) {
    const token = String(rawValue ?? '').trim();
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
}

function deriveDataChangeEntities(
  entities: DataChangeMessageEntities | undefined,
  scopes: readonly unknown[],
): DataChangeMessageEntities | undefined {
  const productIds: string[] = [];
  const fieldKeys: string[] = [];
  const seenProductIds = new Set<string>();
  const seenFieldKeys = new Set<string>();

  addEntityToken(productIds, seenProductIds, entities?.productIds);
  addEntityToken(fieldKeys, seenFieldKeys, entities?.fieldKeys);

  for (const scope of scopes) {
    const record = asRecord(scope);
    addEntityToken(productIds, seenProductIds, record.productIds);
    addEntityToken(productIds, seenProductIds, record.productId);
    addEntityToken(fieldKeys, seenFieldKeys, record.fieldKeys);
    addEntityToken(fieldKeys, seenFieldKeys, record.fields);
    addEntityToken(fieldKeys, seenFieldKeys, record.fieldKey);
    addEntityToken(fieldKeys, seenFieldKeys, record.field);
  }

  if (productIds.length === 0 && fieldKeys.length === 0) return undefined;
  return { productIds, fieldKeys };
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
  resolveDataChangeMessage,
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

      const messageScope = resolveDataChangeMessage?.(resolverArgs);
      const scopedCategory = messageScope?.category ?? category;
      const scopedCategories = [
        ...categories,
        ...asStringArray(messageScope?.categories),
      ];
      const entities = deriveDataChangeEntities(messageScope?.entities, [
        messageScope?.meta,
        data,
        variables,
        onMutateResult,
      ]);

      const invalidatedKeys = invalidateDataChangeQueries({
        queryClient,
        message: {
          type: 'data-change',
          event,
          category: scopedCategory,
          categories: scopedCategories,
          domains: asStringArray(messageScope?.domains),
          entities,
          meta: messageScope?.meta,
        },
        categories: scopedCategories,
        fallbackCategory: scopedCategory,
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
