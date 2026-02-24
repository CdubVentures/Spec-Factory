export type AuthoritySnapshot = {
  category: string;
  authority_version: string;
  version: {
    draft_hash: string | null;
    compiled_hash: string | null;
    specdb_sync_version: number | null;
    updated_at: string | null;
  };
  changed_domains: string[];
  compile_stale: boolean;
  source_timestamps: {
    compiled_at: string | null;
    draft_saved_at: string | null;
    specdb_sync_at: string | null;
  };
  specdb_sync: {
    status: string;
    version: number;
    updated_at: string | null;
    meta: Record<string, unknown>;
  };
  observability?: {
    data_change?: {
      total?: number;
      last_broadcast_at?: string | null;
      category_count?: number;
      by_event?: Record<string, number>;
    };
    queue_cleanup?: {
      attempt_total?: number;
      success_total?: number;
      failed_total?: number;
      last_success_at?: string | null;
      last_failure_at?: string | null;
      last_failure_reason?: string;
      category?: {
        attempt_total?: number;
        success_total?: number;
        failed_total?: number;
      };
    };
  };
};

export declare function useAuthoritySnapshot(options?: {
  category: string;
  enabled?: boolean;
  refetchIntervalMs?: number;
}): {
  snapshot: AuthoritySnapshot | null;
  authorityVersionToken: string;
  data: AuthoritySnapshot | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};
