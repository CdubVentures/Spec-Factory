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
  brand?: string;
  model?: string;
  variant?: string;
  status: string;
  started_at: string;
  ended_at: string;
  counters: RunCounters;
  size_bytes?: number;
  storage_metrics?: StorageMetrics;
  picker_label?: string;
  storage_origin?: string;
  storage_state?: 'live' | 'local' | 's3' | 'synced';
}

export interface RunSourceEntry {
  url: string;
  final_url?: string;
  status: number;
  success: boolean;
  blocked: boolean;
  block_reason: string | null;
  worker_id: string;
  content_hash: string;
  html_file: string;
  screenshot_count: number;
  video_file: string | null;
  timeout_rescued: boolean;
  fetch_error: string | null;
  html_size?: number;
  video_size?: number;
  screenshot_size?: number;
  total_size?: number;
}

export interface RunSourcesPage {
  limit: number;
  offset: number;
  total: number;
  has_more: boolean;
}

export interface StorageRunsResponse {
  runs: RunInventoryRow[];
}

export interface StageTimestamp {
  started_at: string;
  ended_at: string;
}

export interface RunDetailResponse extends RunInventoryRow {
  sources?: RunSourceEntry[];
  sources_page?: RunSourcesPage;
  out_root: string;
  run_base: string;
  latest_base: string;
  identity_fingerprint: string;
  dedupe_mode: string;
  stage_cursor: string;
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
  category?: string;
  product_id?: string;
  error?: string;
}

export interface BulkDeleteResponse {
  ok: boolean;
  deleted: Array<{ run_id: string; deleted_from: string }>;
  errors: Array<{ run_id: string; error: string }>;
  categories?: string[];
  product_ids?: string[];
}

export interface PruneResponse {
  ok: boolean;
  pruned: number;
  errors: Array<{ run_id: string; error: string }>;
  categories?: string[];
  product_ids?: string[];
}

export interface PurgeResponse {
  ok: boolean;
  purged: number;
  categories?: string[];
  product_ids?: string[];
}

export interface DeleteUrlResponse {
  ok: boolean;
  url: string;
  product_id: string;
  category?: string;
  reason?: string;
  sql?: { rows_deleted: number };
  fs?: { files_deleted: number; product_json_updated: boolean };
}

export interface PurgeProductHistoryResponse {
  ok: boolean;
  product_id: string;
  category?: string;
  runs_deleted: number;
  sql?: { rows_deleted: number };
  fs?: { run_dirs_deleted: number; output_dir_deleted: boolean; product_json_reset: boolean };
  error?: string;
}

export interface ExportResponse {
  exported_at: string;
  storage_backend: string;
  runs: RunInventoryRow[];
}

