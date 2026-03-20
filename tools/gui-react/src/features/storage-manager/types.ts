// WHY: TypeScript interfaces for the Storage Manager panel.
// Shapes mirror the backend /storage/* endpoint responses.

export interface StorageArtifactBreakdown {
  type: string;
  count: number;
  size_bytes: number;
  path: string;
}

export interface StorageMetrics {
  total_size_bytes: number;
  artifact_breakdown: StorageArtifactBreakdown[];
  computed_at: string;
}

export interface StorageBackendDetail {
  root_path?: string;
  bucket?: string;
  prefix?: string;
  region?: string;
  disk_free_bytes?: number;
}

export interface StorageOverviewResponse {
  total_runs: number;
  total_size_bytes: number;
  categories: string[];
  products_indexed: number;
  oldest_run: string | null;
  newest_run: string | null;
  avg_run_size_bytes: number;
  storage_backend: string;
  backend_detail: StorageBackendDetail;
}

export interface RunCounters {
  pages_checked: number;
  fetched_ok: number;
  fetched_404: number;
  fetched_blocked: number;
  fetched_error: number;
  parse_completed: number;
  indexed_docs: number;
  fields_filled: number;
  search_workers: number;
}

export interface RunInventoryRow {
  run_id: string;
  category: string;
  product_id: string;
  status: string;
  started_at: string;
  ended_at: string;
  counters: RunCounters;
  storage_metrics?: StorageMetrics;
  picker_label?: string;
  storage_origin?: string;
}

export interface StorageRunsResponse {
  runs: RunInventoryRow[];
}

export interface StageTimestamp {
  started_at: string;
  ended_at: string;
}

export interface RunDetailResponse extends RunInventoryRow {
  out_root: string;
  events_path: string;
  run_base: string;
  latest_base: string;
  identity_fingerprint: string;
  dedupe_mode: string;
  phase_cursor: string;
  stages?: {
    search?: StageTimestamp;
    fetch?: StageTimestamp;
    parse?: StageTimestamp;
    index?: StageTimestamp;
  };
  needset: {
    total_fields: number;
    generated_at: string | null;
    summary: Record<string, number>;
    rows_count: number;
  };
  search_profile: {
    status: string;
    query_count: number;
    generated_at: string | null;
  };
  artifacts: {
    has_needset: boolean;
    has_search_profile: boolean;
    needset_path: string;
    search_profile_path: string;
    brand_resolution_path: string;
  };
}

export interface DeleteRunResponse {
  ok: boolean;
  run_id: string;
  deleted_from: string;
  error?: string;
}

export interface BulkDeleteResponse {
  ok: boolean;
  deleted: Array<{ run_id: string; deleted_from: string }>;
  errors: Array<{ run_id: string; error: string }>;
}

export interface PruneResponse {
  ok: boolean;
  pruned: number;
  errors: Array<{ run_id: string; error: string }>;
}

export interface PurgeResponse {
  ok: boolean;
  purged: number;
}

export interface RecalculateResponse {
  ok: boolean;
  runs_scanned: number;
  runs_updated: number;
  total_size_bytes: number;
  errors: Array<{ run_id: string; error: string }>;
}

export interface ExportResponse {
  exported_at: string;
  storage_backend: string;
  runs: RunInventoryRow[];
}
