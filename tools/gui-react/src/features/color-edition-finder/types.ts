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
  readonly thinking?: boolean;
  readonly web_search?: boolean;
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

/** A single candidate row — one per variant per extraction event (source-centric). */
export interface CefCandidateEntry {
  readonly candidate_id: number;
  readonly source_id: string;
  readonly source_type: string;
  readonly model: string;
  readonly value: string;
  readonly confidence: number;
  readonly status: 'candidate' | 'resolved';
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly submitted_at: string;
  readonly variant_id: string | null;
}

/** Published truth from summary table + detail from latest run. */
export interface CefPublishedState {
  readonly colors: readonly string[];
  readonly editions: readonly string[];
  readonly default_color: string;
  readonly color_names?: Readonly<Record<string, string>>;
  readonly edition_details?: Readonly<Record<string, { readonly display_name?: string; readonly colors?: readonly string[] }>>;
}

export interface CefVariantRegistryEntry {
  readonly variant_id: string;
  readonly variant_key: string;
  readonly variant_type: 'color' | 'edition';
  readonly variant_label: string;
  readonly color_atoms: readonly string[];
  readonly edition_slug: string | null;
  readonly edition_display_name: string | null;
  readonly created_at: string;
  readonly updated_at?: string;
}

export interface ColorEditionFinderResult {
  readonly product_id: string;
  readonly category: string;
  readonly run_count: number;
  readonly last_ran_at: string;
  readonly published: CefPublishedState;
  readonly variant_registry: readonly CefVariantRegistryEntry[];
  readonly candidates?: {
    readonly colors: readonly CefCandidateEntry[];
    readonly editions: readonly CefCandidateEntry[];
  };
  readonly runs: readonly ColorEditionFinderRunEntry[];
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

export interface VariantDeleteResponse {
  readonly deleted: boolean;
  readonly variant?: CefVariantRegistryEntry;
  readonly published?: {
    readonly colors: readonly string[];
    readonly editions: readonly string[];
    readonly defaultColor: string;
  };
}

export interface VariantDeleteAllResponse {
  readonly deleted: number;
  readonly variants: readonly CefVariantRegistryEntry[];
}

export interface ColorRegistryEntry {
  readonly name: string;
  readonly hex: string;
  readonly css_var: string;
}
