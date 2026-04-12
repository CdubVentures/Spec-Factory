// AUTO-GENERATED from backend shape descriptors — do not edit manually.
// Run: node tools/gui-react/scripts/generateReviewTypes.js
//
// Shape descriptors live in:
//   src/features/review/contracts/reviewFieldContract.js

export interface FieldStateSelectedGen {
  value: unknown;
  unit?: string | null;
  confidence: number;
  status: string;
  color: 'green' | 'yellow' | 'red' | 'gray';
}

export interface CandidateEvidenceGen {
  url: string;
  retrieved_at: string;
  snippet_id: string;
  snippet_hash: string;
  quote: string;
  quote_span: number[] | null;
  snippet_text: string;
  source_id: string;
}

export interface ReviewCandidateGen {
  candidate_id: string;
  value: unknown;
  unit?: string | null;
  score: number;
  source_id: string;
  source: string;
  tier: number | null;
  method: string | null;
  evidence: Record<string, unknown>;
  is_synthetic_selected?: boolean;
  llm_extract_model?: string | null;
  llm_extract_provider?: string | null;
  llm_validate_model?: string | null;
  llm_validate_provider?: string | null;
}

export interface FieldStateGen {
  selected: Record<string, unknown>;
  needs_review: boolean;
  reason_codes: string[];
  candidate_count: number;
  candidates: ReviewCandidateGen[];
  accepted_candidate_id: string | null;
  selected_candidate_id: string | null;
  source?: string;
  method?: string;
  tier?: number | null;
  evidence_url?: string;
  evidence_quote?: string;
  overridden?: boolean;
  source_timestamp?: string | null;
}

export interface ProductIdentityGen {
  id: number;
  identifier: string;
  brand: string;
  model: string;
  variant: string;
}

export interface ProductMetricsGen {
  confidence: number;
  coverage: number;
  flags: number;
  missing: number;
  has_run: boolean;
  updated_at: string;
}

export interface ProductReviewPayloadGen {
  product_id: string;
  category: string;
  identity: Record<string, unknown>;
  fields: Record<string, unknown>;
  metrics: Record<string, unknown>;
  hasRun?: boolean;
}

export interface ReviewLayoutRowGen {
  group: string;
  key: string;
  label: string;
  field_rule: Record<string, unknown>;
}

export interface ReviewLayoutGen {
  category: string;
  rows: ReviewLayoutRowGen[];
}

export interface RunMetricsGen {
  confidence: number;
  coverage: number;
  flags: number;
  missing: number;
  count: number;
}

export interface ProductsIndexResponseGen {
  products: ProductReviewPayloadGen[];
  brands: string[];
  total: number;
  metrics_run: boolean;
}

export interface CandidateResponseGen {
  product_id: string;
  field: string;
  candidates: ReviewCandidateGen[];
  candidate_count: number;
}
