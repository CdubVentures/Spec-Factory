export type DataChangeMessage = {
  type?: string;
  event?: string;
  category?: string;
  categories?: string[];
  domains?: string[];
  [key: string]: unknown;
};

export type DataChangeInvalidationOptions = {
  message?: DataChangeMessage | null;
  categories?: string[];
  fallbackCategory?: string;
};

export type DataChangeQueryClient = {
  invalidateQueries: (options: { queryKey: readonly unknown[] }) => unknown;
};

export declare const KNOWN_DATA_CHANGE_DOMAINS: readonly string[];
export declare const DATA_CHANGE_EVENT_DOMAIN_FALLBACK: Readonly<Record<string, readonly string[]>>;

export declare function normalizeDataChangeCategory(value: unknown): string;
export declare function collectDataChangeCategories(input: {
  categories?: readonly unknown[];
  fallbackCategory?: unknown;
}): string[];

export declare function normalizeDataChangeToken(value: unknown): string;
export declare function collectDataChangeDomains(domains: readonly unknown[] | unknown): string[];

export declare function resolveDataChangeInvalidationQueryKeys(
  options?: DataChangeInvalidationOptions,
): unknown[][];

export declare function invalidateDataChangeQueries(
  options?: DataChangeInvalidationOptions & { queryClient?: DataChangeQueryClient | null },
): unknown[][];

export declare function findUnmappedDataChangeDomains(
  domains: string[] | readonly string[],
): string[];

export declare function resolveDataChangeEventName(message: unknown): string;
export declare function dataChangeAffectsCategory(message: unknown, category: unknown): boolean;
export declare function dataChangeAffectsDomains(message: unknown, requiredDomains: readonly unknown[]): boolean;
export declare function shouldHandleDataChangeMessage(options: {
  message: unknown;
  category?: unknown;
  requiredDomains?: readonly unknown[];
  categoryOptional?: boolean;
}): boolean;

export type DataChangeScopeMessage = {
  category?: string;
  categories?: string[];
};

export declare function resolveDataChangeScopedCategories(
  message: DataChangeScopeMessage | null | undefined,
  fallbackCategory: string,
): string[];

export declare function applyDataChangeInvalidation(args: {
  message: DataChangeScopeMessage | null | undefined;
  fallbackCategory: string;
  invalidateForCategory: (category: string) => void;
}): string[];

export type DataChangeClientObservabilitySnapshot = {
  invalidation: {
    flush_total: number;
    query_keys_total: number;
    categories_total: number;
    by_category: Record<string, { flush_total: number; query_keys_total: number }>;
    last_flush_at: string | null;
  };
};

export declare function resetDataChangeClientObservability(): void;

export declare function recordDataChangeInvalidationFlush(args?: {
  queryKeys?: unknown[][] | number;
  categories?: string[];
}): {
  ts: string;
  queryKeyCount: number;
  categories: string[];
};

export declare function getDataChangeClientObservabilitySnapshot(): DataChangeClientObservabilitySnapshot;

export type DataChangeInvalidationScheduler = {
  schedule: (args?: DataChangeInvalidationOptions) => unknown[][];
  flush: () => unknown[][];
  dispose: () => void;
  pendingCount: () => number;
};

export declare function createDataChangeInvalidationScheduler(args?: {
  queryClient?: DataChangeQueryClient | null;
  delayMs?: number;
  setTimeoutFn?: (fn: () => void, delay: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  onFlush?: (payload: {
    ts: string;
    queryKeys: unknown[][];
    queryKeyCount: number;
    categories: string[];
  }) => void;
}): DataChangeInvalidationScheduler;
