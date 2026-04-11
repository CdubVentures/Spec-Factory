export interface ProductImageEntry {
  view: string;
  filename: string;
  url: string;
  source_page: string;
  alt_text: string;
  bytes: number;
  variant_key: string;
  variant_label: string;
  variant_type: 'color' | 'edition';
  downloaded_at: string;
}

export interface ProductImageFinderRun {
  run_number: number;
  ran_at: string;
  model: string;
  fallback_used: boolean;
  selected: { images: ProductImageEntry[] };
  response: {
    images: ProductImageEntry[];
    download_errors: Array<{ view: string; url: string; error: string }>;
    discovery_log: { urls_checked: string[]; queries_run: string[]; notes: string[] };
    variant_key: string;
    variant_label: string;
  };
}

export interface ProductImageFinderResult {
  product_id: string;
  category: string;
  images: Array<{ view: string; filename: string; variant_key: string }>;
  image_count: number;
  cooldown_until: string;
  on_cooldown: boolean;
  run_count: number;
  last_ran_at: string;
  selected: { images: ProductImageEntry[] };
  runs: ProductImageFinderRun[];
}

export interface ProductImageFinderRunResponse {
  ok: boolean;
  images: ProductImageEntry[];
  download_errors: Array<{ view: string; url: string; error: string }>;
  variants_processed: number;
  fallbackUsed: boolean;
  rejected: boolean;
  rejections?: Array<{ reason_code: string; message: string }>;
}

export interface ProductImageFinderDeleteResponse {
  ok: boolean;
  remaining_runs?: number;
}

export interface VariantInfo {
  key: string;
  label: string;
  type: 'color' | 'edition';
}
