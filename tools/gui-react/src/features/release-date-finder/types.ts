export interface EvidenceSource {
  readonly source_url: string;
  readonly source_page: string;
  readonly source_type: 'manufacturer' | 'retailer' | 'review' | 'press' | 'other';
  readonly tier: 'tier1' | 'tier2' | 'tier3' | 'unknown';
  readonly excerpt: string;
}

export interface PublisherCandidateRef {
  readonly candidate_id: number;
  readonly source_id: string;
  readonly source_type: string;
  readonly model: string;
  readonly value: string;
  readonly confidence: number;
  readonly status: string;
  readonly submitted_at: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ReleaseDateFinderCandidate {
  readonly variant_id: string | null;
  readonly variant_key: string;
  readonly variant_label: string;
  readonly variant_type: 'color' | 'edition';
  readonly value: string;
  readonly confidence: number;
  readonly unknown_reason: string;
  readonly below_confidence: boolean;
  readonly sources: readonly EvidenceSource[];
  readonly ran_at: string;
  readonly rejected_by_gate?: boolean;
  readonly rejection_reasons?: readonly { reason_code: string; detail?: unknown }[];
  readonly publisher_error?: string;
  readonly publisher_candidates?: readonly PublisherCandidateRef[];
}

export interface ReleaseDateFinderRun {
  readonly run_number: number;
  readonly ran_at: string;
  readonly model: string;
  readonly fallback_used: boolean;
  readonly effort_level?: string;
  readonly access_mode?: string;
  readonly thinking?: boolean;
  readonly web_search?: boolean;
  readonly started_at?: string | null;
  readonly duration_ms?: number | null;
  readonly selected: { candidates: readonly ReleaseDateFinderCandidate[] };
  readonly prompt: { system: string; user: string };
  readonly response: {
    readonly started_at?: string;
    readonly duration_ms?: number;
    readonly variant_id: string | null;
    readonly variant_key: string;
    readonly variant_label: string;
    readonly release_date: string;
    readonly confidence: number;
    readonly unknown_reason: string;
    readonly evidence: readonly EvidenceSource[];
    readonly discovery_log: { urls_checked: string[]; queries_run: string[]; notes: string[] };
  };
}

export interface ReleaseDateFinderResult {
  readonly product_id: string;
  readonly category: string;
  readonly run_count: number;
  readonly last_ran_at: string;
  readonly candidates: readonly ReleaseDateFinderCandidate[];
  readonly candidate_count: number;
  readonly published_value: string;
  readonly published_confidence: number | null;
  readonly selected: { candidates: readonly ReleaseDateFinderCandidate[] };
  readonly runs: readonly ReleaseDateFinderRun[];
}

export interface ReleaseDateFinderDeleteResponse {
  readonly ok: boolean;
  readonly remaining_runs?: number;
}

export interface AcceptedResponse {
  readonly status: 'accepted';
  readonly operationId: string;
}
