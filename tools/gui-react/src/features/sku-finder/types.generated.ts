// AUTO-GENERATED from src/features/sku/*Schema.js
// Run: node tools/gui-react/scripts/generateFinderTypes.js skuFinder
// Do not edit manually.

export interface EvidenceRef {
  url: string;
  tier: string;
  confidence: number;
  // Evidence-upgrade fields — populated by RDF + variantScalarFieldProducer
  // when they opt into the extended evidence shape. CEF/PIF/carousel leave
  // these undefined. Optional so legacy pre-upgrade refs still parse cleanly.
  supporting_evidence?: string;
  evidence_kind?: string;
}

export interface PublisherCandidateRef {
  candidate_id: number;
  source_id: string;
  source_type: string;
  model: string;
  value: string;
  confidence: number;
  status: string;
  submitted_at: string;
  metadata?: Record<string, unknown>;
}

export interface RejectionMetadata {
  reason_code: string;
  detail?: unknown;
}

export interface SkuFinderLlmResponse {
  sku: string;
  confidence: number;
  unknown_reason: string;
  evidence_refs: EvidenceRef[];
  discovery_log: {
    urls_checked: string[];
    queries_run: string[];
    notes: string[];
  };
}

export interface SkuFinderCandidate {
  variant_id: string | null;
  variant_key: string;
  variant_label: string;
  variant_type: string;
  value: string;
  confidence: number;
  unknown_reason: string;
  sources: EvidenceRef[];
  ran_at: string;
  rejected_by_gate?: boolean;
  rejection_reasons?: RejectionMetadata[];
  publisher_error?: string;
  publisher_candidates?: PublisherCandidateRef[];
}

export interface SkuFinderRun {
  run_number: number;
  ran_at: string;
  model: string;
  fallback_used: boolean;
  effort_level?: string;
  access_mode?: string;
  thinking?: boolean;
  web_search?: boolean;
  started_at?: string | null;
  duration_ms?: number | null;
  selected: {
    candidates: SkuFinderCandidate[];
  };
  prompt: {
    system: string;
    user: string;
  };
  response: {
    sku: string;
    confidence: number;
    unknown_reason: string;
    evidence_refs: EvidenceRef[];
    discovery_log: {
      urls_checked: string[];
      queries_run: string[];
      notes: string[];
    };
    started_at?: string;
    duration_ms?: number;
    variant_id: string | null;
    variant_key: string;
    variant_label: string;
    loop_id?: string;
  };
}

export interface SkuFinderResult {
  product_id: string;
  category: string;
  run_count: number;
  last_ran_at: string;
  candidates: SkuFinderCandidate[];
  candidate_count: number;
  published_value: string;
  published_confidence: number | null;
  selected: {
    candidates: SkuFinderCandidate[];
  };
  runs: SkuFinderRun[];
}
