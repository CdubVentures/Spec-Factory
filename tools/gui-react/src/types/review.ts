// WHY: Public API for review types. These interfaces are manually maintained
// with richer nested typing than the generated baseline. The shape descriptor
// alignment test (reviewShapeAlignment.test.js) ensures these stay in sync
// with the backend contract (reviewFieldContract.js).
//
// Generated structural baseline: review.generated.ts
// Backend SSOT: src/features/review/contracts/reviewFieldContract.js
// Codegen: node tools/gui-react/scripts/generateReviewTypes.js

export interface ReviewLayoutRow {
  group: string;
  key: string;
  label: string;
  field_rule: {
    type: string;
    required: boolean;
    units: string | null;
    enum_name: string | null;
    component_type: string | null;
    enum_source: string | null;
  };
}

export interface ReviewLayout {
  category: string;
  rows: ReviewLayoutRow[];
}

export interface CandidateEvidence {
  url: string;
  retrieved_at: string;
  snippet_id: string;
  snippet_hash: string;
  quote: string;
  quote_span: number[] | null;
  snippet_text: string;
  source_id: string;
}

export interface ReviewCandidate {
  candidate_id: string;
  value: unknown;
  unit?: string | null;
  score: number;
  source_id: string;
  source: string;
  tier: number | null;
  method: string | null;
  evidence: CandidateEvidence;
  is_synthetic_selected?: boolean;
  llm_extract_model?: string | null;
  llm_extract_provider?: string | null;
  llm_validate_model?: string | null;
  llm_validate_provider?: string | null;
  // Per-source candidate fields
  status?: 'candidate' | 'resolved';
  model?: string | null;
  run_id?: string | null;
  submitted_at?: string | null;
  evidence_url?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface FieldState {
  selected: {
    value: unknown;
    unit?: string | null;
    confidence: number;
    status: string;
    color: 'green' | 'yellow' | 'red' | 'gray';
  };
  candidate_count: number;
  candidates: ReviewCandidate[];
  overridden?: boolean;
  source?: string;
  source_timestamp?: string | null;
  method?: string;
  tier?: number | null;
  evidence_url?: string;
  evidence_quote?: string;
  accepted_candidate_id?: string | null;
  selected_candidate_id?: string | null;
}

export interface ProductReviewPayload {
  product_id: string;
  category: string;
  identity: {
    id: number;
    identifier: string;
    brand: string;
    model: string;
    variant: string;
  };
  fields: Record<string, FieldState>;
  metrics: {
    confidence: number;
    coverage: number;
    missing: number;
    has_run: boolean;
    updated_at: string;
  };
  hasRun?: boolean;
}

// ── Review Grid Overhaul types ───────────────────────────────────

export type CellMode = 'viewing' | 'selected' | 'editing';
export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

export interface BrandFilter {
  mode: 'all' | 'none' | 'custom';
  selected: Set<string>;
}

export interface RunMetrics {
  confidence: number;
  coverage: number;
  missing: number;
  count: number;
}

export interface ProductsIndexResponse {
  products: ProductReviewPayload[];
  brands: string[];
  total: number;
  metrics_run?: RunMetrics;
}

export interface CandidateResponse {
  product_id: string;
  field: string;
  candidates: ReviewCandidate[];
  candidate_count: number;
}
