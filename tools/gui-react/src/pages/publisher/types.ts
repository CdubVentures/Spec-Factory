export interface PublisherSourceEntry {
  confidence: number;
  run_id?: string;
  submitted_at?: string;
  model?: string;
  artifact?: string;
  url?: string;
  source?: string;
  overridden_by?: string;
  reason?: string;
}

export interface PublisherRepairEntry {
  step: string;
  before: unknown;
  after: unknown;
  rule: string;
}

export interface PublisherRejectionEntry {
  reason_code: string;
  detail?: Record<string, unknown>;
}

export interface PublisherValidationJson {
  valid?: boolean;
  repairs: PublisherRepairEntry[];
  rejections: PublisherRejectionEntry[];
}

export interface PublisherPublishResult {
  status: 'published' | 'below_threshold' | 'manual_override_locked' | 'skipped';
  confidence?: number;
  threshold?: number;
  reason?: string;
  published_at?: string;
}

export interface PublisherMetadataJson {
  publish_result?: PublisherPublishResult;
  source?: string;
  [key: string]: unknown;
}

export interface EvidenceRef {
  url: string;
  tier: string;
  confidence: number | null;
  http_status: number | null;
  accepted: 0 | 1;
}

export interface PublisherCandidateRow {
  id: number;
  row_kind?: 'candidate' | 'stripped_unknown';
  unknown_stripped?: boolean;
  unknown_reason?: string | null;
  run_number?: number | null;
  category: string;
  product_id: string;
  field_key: string;
  value: string | null;
  confidence: number;
  source_id: string;
  source_type: string;
  llm_model: string;
  validation_json: PublisherValidationJson;
  metadata_json: PublisherMetadataJson;
  status: 'candidate' | 'resolved' | 'stripped';
  submitted_at: string;
  updated_at: string;
  brand?: string;
  model?: string;
  variant?: string;
  evidence?: EvidenceRef[];
  evidence_accepted_count?: number;
  evidence_rejected_count?: number;
}

export interface PublisherStats {
  total: number;
  resolved: number;
  pending: number;
  repaired: number;
  products: number;
  unknown_stripped?: number;
}

export interface PublisherCandidatesResponse {
  rows: PublisherCandidateRow[];
  total: number;
  page: number;
  limit: number;
  stats: PublisherStats;
}
