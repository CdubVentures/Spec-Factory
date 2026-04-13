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
  /** True = LLM vision evaluator chose this as the best image for its view. */
  eval_best?: boolean;
  /** Vision evaluator flags: 'watermark' | 'badge' | 'cropped' | 'wrong_product'. */
  eval_flags?: string[];
  /** LLM vision evaluator explanation for the ranking. */
  eval_reasoning?: string;
  /** Source URL of the evaluated image. */
  eval_source?: string;
  /** Selected as a hero shot by the carousel builder. */
  hero?: boolean;
  /** Order among hero shots (1 = primary). */
  hero_rank?: number | null;
}

export interface ProductImageFinderRun {
  run_number: number;
  ran_at: string;
  model: string;
  fallback_used: boolean;
  effort_level?: string;
  access_mode?: string;
  /** Run mode: 'view' for angle-based, 'hero' for studio product shots. Absent on legacy runs. */
  mode?: 'view' | 'hero';
  /** Shared ID across all runs in a single loop invocation. Absent on non-loop runs. */
  loop_id?: string | null;
  /** ISO timestamp when the run started. Absent on legacy runs. */
  started_at?: string | null;
  /** Total run duration in milliseconds. Absent on legacy runs. */
  duration_ms?: number | null;
  selected: { images: ProductImageEntry[] };
  prompt: { system: string; user: string };
  response: {
    images: ProductImageEntry[];
    download_errors: Array<{ view: string; url: string; error: string }>;
    discovery_log: { urls_checked: string[]; queries_run: string[]; notes: string[] };
    variant_key: string;
    variant_label: string;
    /** Run mode (duplicated from run level for SQL blob access). */
    mode?: 'view' | 'hero';
    /** Loop ID (duplicated from run level for SQL blob access). */
    loop_id?: string | null;
    /** Started at (duplicated from run level for SQL blob access). */
    started_at?: string | null;
    /** Duration ms (duplicated from run level for SQL blob access). */
    duration_ms?: number | null;
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

/** 202 Accepted response — returned immediately by fire-and-forget POST handlers. */
export interface AcceptedResponse {
  ok: true;
  operationId: string;
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
