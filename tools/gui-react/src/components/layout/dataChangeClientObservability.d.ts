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
