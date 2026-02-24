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

export declare function resolveDataChangeInvalidationQueryKeys(
  options?: DataChangeInvalidationOptions,
): unknown[][];

export declare function invalidateDataChangeQueries(
  options?: DataChangeInvalidationOptions & { queryClient?: DataChangeQueryClient | null },
): unknown[][];

export declare function findUnmappedDataChangeDomains(domains: string[] | readonly string[]): string[];
