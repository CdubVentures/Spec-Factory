import type { DataChangeInvalidationOptions, DataChangeQueryClient } from './index.js';

export declare const KNOWN_DATA_CHANGE_DOMAINS: readonly string[];
export declare const DATA_CHANGE_EVENT_DOMAIN_FALLBACK: Readonly<Record<string, readonly string[]>>;

export declare function resolveDataChangeInvalidationQueryKeys(
  options?: DataChangeInvalidationOptions,
): unknown[][];

export declare function invalidateDataChangeQueries(
  options?: DataChangeInvalidationOptions & { queryClient?: DataChangeQueryClient | null },
): unknown[][];

export declare function findUnmappedDataChangeDomains(
  domains: string[] | readonly string[],
): string[];
