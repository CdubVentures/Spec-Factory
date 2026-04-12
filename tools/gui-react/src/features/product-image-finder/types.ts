export interface ProductImageEntry {
  view: string;
  filename: string;
  url: string;
  source_page: string;
  alt_text: string;
  bytes: number;
  width: number;
  height: number;
  quality_pass: boolean;
  variant_key: string;
  variant_label: string;
  variant_type: 'color' | 'edition';
  downloaded_at: string;
  /** Raw download filename in originals/ subdirectory (e.g. "top-black.jpg"). Absent on pre-RMBG entries. */
  original_filename?: string;
  /** Whether RMBG 2.0 background removal succeeded. Absent or false on pre-RMBG entries. */
  bg_removed?: boolean;
  /** Source format before PNG conversion (e.g. "jpg", "webp"). Absent on pre-RMBG entries. */
  original_format?: string;
  /** True when RMBG succeeded but trim produced empty canvas. */
  trim_failed?: boolean;
}

export interface ProductImageFinderRun {
  run_number: number;
  ran_at: string;
  model: string;
  fallback_used: boolean;
  selected: { images: ProductImageEntry[] };
  prompt: { system: string; user: string };
  response: {
    images: ProductImageEntry[];
    download_errors: Array<{ view: string; url: string; error: string }>;
    discovery_log: { urls_checked: string[]; queries_run: string[]; notes: string[] };
    variant_key: string;
    variant_label: string;
  };
}

/* ── Carousel progress types ──────────────────────────────────────── */

export interface CarouselViewDetail {
  count: number;
  satisfied: boolean;
  attempts: number;
  exhausted: boolean;
}

export interface CarouselProgress {
  viewsFilled: number;
  viewsTotal: number;
  viewDetails: Record<string, CarouselViewDetail>;
  heroCount: number;
  heroTarget: number;
  heroSatisfied: boolean;
  heroAttempts: number;
  heroExhausted: boolean;
}

export interface CarouselSettings {
  viewAttemptBudget: number;
  heroAttemptBudget: number;
  heroEnabled: boolean;
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
  carouselProgress?: Record<string, CarouselProgress>;
  carouselSettings?: CarouselSettings;
}

export interface ProductImageFinderRunResponse {
  ok: boolean;
  images: ProductImageEntry[];
  download_errors: Array<{ view: string; url: string; error: string }>;
  variants_processed: number;
  fallbackUsed: boolean;
  rejected: boolean;
  rejections?: Array<{ reason_code: string; message: string }>;
  carouselProgress?: Record<string, CarouselProgress>;
  carouselSettings?: CarouselSettings;
}

export interface ProductImageFinderLoopResponse {
  ok: boolean;
  images: ProductImageEntry[];
  download_errors: Array<{ view: string; url: string; error: string }>;
  variants_processed: number;
  totalLlmCalls: number;
  fallbackUsed: boolean;
  rejected: boolean;
  rejections?: Array<{ reason_code: string; message: string }>;
  carouselProgress?: Record<string, CarouselProgress>;
  carouselSettings?: CarouselSettings;
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
