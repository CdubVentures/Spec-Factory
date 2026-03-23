export type AuthoritySnapshot = {
  category: string;
  authority_version: string;
  version: {
    map_hash: string | null;
    compiled_hash: string | null;
    specdb_sync_version: number | null;
    updated_at: string | null;
  };
  changed_domains: string[];
  compile_stale: boolean;
  source_timestamps: {
    compiled_at: string | null;
    map_saved_at: string | null;
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
    settings_persistence?: {
      writes?: {
        attempt_total?: number;
        success_total?: number;
        failed_total?: number;
        by_section?: Record<string, unknown>;
        by_target?: Record<string, unknown>;
        last_attempt_at?: string | null;
        last_success_at?: string | null;
        last_failure_at?: string | null;
        last_failure_reason?: string;
      };
      stale_reads?: {
        total?: number;
        by_section?: Record<string, number>;
        by_reason?: Record<string, number>;
        by_from_version?: Record<string, number>;
        by_to_version?: Record<string, number>;
        last_detected_at?: string | null;
        last_reason?: string;
      };
      migrations?: {
        total?: number;
        by_from_version?: Record<string, number>;
        by_to_version?: Record<string, number>;
        last_migration_at?: string | null;
        last_from_version?: number | null;
        last_to_version?: number | null;
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
