export interface ColorEditionFinderColorDetail {
  readonly found_run: number;
  readonly found_at: string;
  readonly model: string;
}

export interface ColorEditionFinderEditionDetail {
  readonly found_run: number;
  readonly found_at: string;
  readonly model: string;
}

/** The paired selected state: colors + editions with their colors + default. */
export interface ColorEditionFinderSelected {
  readonly colors: readonly string[];
  readonly color_names?: Readonly<Record<string, string>>;
  readonly editions: Readonly<Record<string, { readonly display_name?: string; readonly colors: readonly string[] }>>;
  readonly default_color: string;
}

/** Validation rejection detail from the candidate gate. */
export interface ColorEditionFinderRejection {
  readonly reason_code: string;
  readonly detail: Readonly<Record<string, unknown>>;
}

/** v2 discovery audit log — per-run feed-forward data. */
export interface DiscoveryLog {
  readonly confirmed_from_known: readonly string[];
  readonly added_new: readonly string[];
  readonly rejected_from_known: readonly string[];
  readonly urls_checked: readonly string[];
  readonly queries_run: readonly string[];
}

/** A single historical run entry with full prompt/response audit trail. */
export interface ColorEditionFinderRunEntry {
  readonly run_number: number;
  readonly ran_at: string;
  readonly model: string;
  readonly fallback_used: boolean;
  readonly effort_level?: string;
  readonly access_mode?: string;
  readonly cooldown_until: string;
  readonly started_at?: string;
  readonly duration_ms?: number | null;
  readonly selected: ColorEditionFinderSelected;
  readonly prompt: { readonly system: string; readonly user: string };
  // WHY: Successful runs store ColorEditionFinderSelected; rejected runs store
  // { status: 'rejected', raw, rejections }. Union via optional fields.
  // v2 adds siblings_excluded + discovery_log audit trail.
  readonly response: ColorEditionFinderSelected & {
    readonly status?: 'rejected';
    readonly raw?: Readonly<Record<string, unknown>>;
    readonly rejections?: readonly ColorEditionFinderRejection[];
    readonly siblings_excluded?: readonly string[];
    readonly discovery_log?: DiscoveryLog;
  };
}

/** A source entry from a candidate submission. */
export interface CefSourceEntry {
  readonly source: string;
  readonly model?: string;
  readonly run_id?: string;
  readonly run_number?: number;
  readonly confidence: number;
  readonly submitted_at: string;
}

/** A single candidate row with its evidence chain. */
export interface CefCandidateEntry {
  readonly candidate_id: number;
  readonly value: string;
  readonly confidence: number;
  readonly source_count: number;
  readonly sources: readonly CefSourceEntry[];
  readonly status: 'candidate' | 'resolved';
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly submitted_at: string;
}

/** Published truth from summary table + detail from latest run. */
export interface CefPublishedState {
  readonly colors: readonly string[];
  readonly editions: readonly string[];
  readonly default_color: string;
  readonly color_names?: Readonly<Record<string, string>>;
  readonly edition_details?: Readonly<Record<string, { readonly display_name?: string; readonly colors?: readonly string[] }>>;
}

export interface ColorEditionFinderResult {
  readonly product_id: string;
  readonly category: string;
  readonly cooldown_until: string;
  readonly on_cooldown: boolean;
  readonly run_count: number;
  readonly last_ran_at: string;
  // Published truth from field_candidates
  readonly published?: CefPublishedState;
  readonly candidates?: {
    readonly colors: readonly CefCandidateEntry[];
    readonly editions: readonly CefCandidateEntry[];
  };
  readonly runs: readonly ColorEditionFinderRunEntry[];
  // Deprecated: kept for backward compat
  readonly colors: readonly string[];
  readonly editions: readonly string[];
  readonly default_color: string;
  readonly selected: ColorEditionFinderSelected;
  readonly color_details: Readonly<Record<string, ColorEditionFinderColorDetail>>;
  readonly edition_details: Readonly<Record<string, ColorEditionFinderEditionDetail>>;
}

/** 202 Accepted response — returned immediately by fire-and-forget POST handlers. */
export interface AcceptedResponse {
  readonly ok: true;
  readonly operationId: string;
}

export interface ColorEditionFinderRunResponse {
  readonly ok: boolean;
  readonly colors: readonly string[];
  readonly editions: readonly string[];
  readonly fallbackUsed: boolean;
}

export interface ColorEditionFinderDeleteRunResponse {
  readonly ok: boolean;
  readonly remaining_runs: number;
}

export interface ColorEditionFinderDeleteAllResponse {
  readonly ok: boolean;
}

export interface ColorRegistryEntry {
  readonly name: string;
  readonly hex: string;
  readonly css_var: string;
}
