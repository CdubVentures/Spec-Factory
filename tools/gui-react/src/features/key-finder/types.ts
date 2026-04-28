/**
 * keyFinder dashboard — shared types + run-mode gate.
 *
 * Single source of truth for which run verbs are live at which scope.
 * When a future phase (3b Loop, 5 Smart Loop) ships, flip the flag here.
 */

export type KeyStatus =
  | 'resolved'
  | 'below_threshold'
  | 'unresolved'
  | null;

export type ComponentRunKind =
  | ''
  | 'component'
  | 'component_brand'
  | 'component_link';

export type KeyRunBlockedReason =
  | ''
  | 'component_parent_unpublished';

/** One row returned by GET /key-finder/:cat/:pid/summary — one per eligible key. */
export interface KeyFinderSummaryRow {
  readonly field_key: string;
  readonly group: string;
  readonly label: string;
  readonly difficulty: string;
  readonly availability: string;
  readonly required_level: string;
  readonly variant_dependent: boolean;
  readonly product_image_dependent: boolean;
  readonly uses_variant_inventory: boolean;
  readonly uses_pif_priority_images: boolean;
  /** calcKeyBudget(fieldRule, familySize, settings).attempts — what Loop mode would spend. */
  readonly budget: number | null;
  /** Fractional raw budget (before ceil). attempts = ceil(raw_budget) so this value
   *  is what the UI displays in the Re-Run column. With default perExtra=0.25, a
   *  5-product-family mandatory-rare-very_hard key would show 9.5 here, budget=10. */
  readonly raw_budget: number | null;
  /** True when this key is currently running as a primary in some in-flight call.
   *  Used by the frontend to show a "busy primary" visual state on the Loop button. */
  readonly in_flight_as_primary: boolean;
  /** How many concurrent calls are currently carrying this key as a passenger.
   *  Non-zero → render a "riding elsewhere" badge on the Loop button. */
  readonly in_flight_as_passenger_count: number;
  /** Bundling pool for this row's difficulty tier (bundlingPoolPerPrimary[difficulty]).
   *  Capacity this key can carry in passengers when it's the primary. Returned even
   *  when bundlingEnabled=false so the UI can surface per-tier capacity. */
  readonly bundle_pool: number;
  /** Sum of `bundle_preview[].cost` — what the packer actually packed. Rendered
   *  alongside the pool ("{used}/{pool}") so users can confirm the pack fits. */
  readonly bundle_total_cost: number;
  /** Passengers that WOULD bundle with this row if run now. Each entry carries
   *  the effective per-passenger cost after the family-size surcharge so the
   *  UI can render "{field_key} (cost)" and the user can eyeball-sum against
   *  the primary's pool. Empty when bundlingEnabled=false or no eligible peers. */
  readonly bundle_preview: ReadonlyArray<{ readonly field_key: string; readonly cost: number }>;
  readonly dedicated_run?: boolean;
  readonly component_run_kind?: ComponentRunKind;
  readonly component_parent_key?: string;
  readonly component_dependency_satisfied?: boolean;
  readonly run_blocked_reason?: KeyRunBlockedReason;
  /** Owning component for sibling-attribute fields (e.g. `sensor_dpi_max` →
   *  'sensor'). Sourced from studioMap.component_sources[].roles.properties[].
   *  Empty string when the field is not a component attribute. Drives the
   *  per-component color tint on the KeyRow taxonomy icon strip so all keys
   *  in one component family read as one group at a glance. */
  readonly belongs_to_component?: string;
  readonly last_run_number: number | null;
  readonly last_ran_at: string | null;
  readonly last_status: KeyStatus;
  readonly last_value: unknown;
  readonly last_confidence: number | null;
  readonly last_model: string | null;
  /** Last-run badge fields — mirrors persisted run.fallback_used /
   *  access_mode / effort_level / thinking / web_search so the Last Model
   *  column can render the same LAB/API + FB + thinking/webSearch badge set
   *  that Run History uses via FinderRunModelBadge. null when the key has
   *  never been run. */
  readonly last_fallback_used: boolean | null;
  readonly last_access_mode: string | null;
  readonly last_effort_level: string | null;
  readonly last_thinking: boolean | null;
  readonly last_web_search: boolean | null;
  readonly candidate_count: number;
  readonly published: boolean;
  /** True when the key's top-value bucket publishes under the stricter
   *  passenger-exclude thresholds (default 95 conf / 3 evidence refs). Same
   *  deterministic gate the publisher uses, just tighter. When true, the key
   *  stops being bundled as a passenger on peer primaries — users still Run /
   *  Loop it directly. Distinct from `published`: a key can be `published` at
   *  51 confidence with 1 evidence ref, but not `concrete_evidence`. */
  readonly concrete_evidence: boolean;
  /** Top candidate's confidence (0-100) for the Concrete column's tooltip.
   *  Display-only — does NOT drive the gate. Null when no candidates exist. */
  readonly top_confidence: number | null;
  /** Top candidate's evidence_count for the Concrete column's tooltip.
   *  Display-only — does NOT drive the gate. Null when no candidates exist. */
  readonly top_evidence_count: number | null;
  readonly run_count: number;
}

/** One run returned by GET /key-finder/:cat/:pid — mirrors what keyFinder.js
 *  persists via `insertRun` (src/features/key/keyFinder.js:437-455). Used by
 *  the Run History section at the bottom of the Key Finder panel. */
export interface KeyFinderRun {
  readonly run_number: number;
  readonly ran_at: string;
  readonly started_at?: string | null;
  readonly duration_ms?: number | null;
  readonly model: string;
  readonly access_mode?: string;
  readonly effort_level?: string;
  readonly fallback_used?: boolean;
  readonly thinking?: boolean;
  readonly web_search?: boolean;
  readonly prompt?: { readonly system?: string; readonly user?: string };
  readonly response: {
    readonly primary_field_key: string;
    readonly results: Record<string, {
      readonly value: unknown;
      readonly confidence: number;
      readonly unknown_reason?: string;
      readonly evidence_refs?: ReadonlyArray<unknown>;
      readonly discovery_log?: {
        readonly urls_checked?: readonly string[];
        readonly queries_run?: readonly string[];
        readonly notes?: readonly string[];
      };
    }>;
    readonly discovery_log?: {
      readonly urls_checked?: readonly string[];
      readonly queries_run?: readonly string[];
      readonly notes?: readonly string[];
    };
  };
}

export interface KeyFinderAllRunsResponse {
  readonly product_id: string;
  readonly category: string;
  readonly runs: readonly KeyFinderRun[];
}

export interface ReservedKeysResponse {
  readonly reserved: readonly string[];
}

export interface KeyFilterState {
  readonly search: string;
  readonly difficulty: string;   // '' = all
  readonly availability: string;
  readonly required: string;     // 'mandatory' | 'non_mandatory' | ''
  readonly status: string;       // 'resolved' | 'unresolved' | 'below_threshold' | ''
}

export const DEFAULT_FILTERS: KeyFilterState = Object.freeze({
  search: '',
  difficulty: '',
  availability: '',
  required: '',
  status: '',
});

/** Per-fieldKey list of primaries currently carrying it as a passenger.
 *  Empty when the key isn't riding anywhere. Drives the "Riding" column on
 *  each KeyRow (one chip per primary, with a live spinner). */
export type RidingPrimaries = readonly string[];

/** A key merged with its summary + runtime running state. */
export interface KeyEntry {
  readonly field_key: string;
  readonly label: string;
  readonly difficulty: string;
  readonly availability: string;
  readonly required_level: string;
  readonly variant_dependent: boolean;
  readonly product_image_dependent: boolean;
  readonly uses_variant_inventory: boolean;
  readonly uses_pif_priority_images: boolean;
  readonly budget: number | null;
  readonly raw_budget: number | null;
  readonly in_flight_as_primary: boolean;
  readonly in_flight_as_passenger_count: number;
  readonly bundle_pool: number;
  readonly bundle_total_cost: number;
  readonly bundle_preview: ReadonlyArray<{ readonly field_key: string; readonly cost: number }>;
  readonly dedicated_run: boolean;
  readonly component_run_kind: ComponentRunKind;
  readonly component_parent_key: string;
  readonly component_dependency_satisfied: boolean;
  readonly run_blocked_reason: KeyRunBlockedReason;
  /** Owning component for sibling-attribute fields. See KeyFinderSummaryRow. */
  readonly belongs_to_component: string;
  readonly last_run_number: number | null;
  readonly last_value: unknown;
  readonly last_confidence: number | null;
  readonly last_status: KeyStatus;
  readonly last_model: string | null;
  readonly last_fallback_used: boolean | null;
  readonly last_access_mode: string | null;
  readonly last_effort_level: string | null;
  readonly last_thinking: boolean | null;
  readonly last_web_search: boolean | null;
  readonly candidate_count: number;
  readonly published: boolean;
  /** See KeyFinderSummaryRow.concrete_evidence. */
  readonly concrete_evidence: boolean;
  /** See KeyFinderSummaryRow.top_confidence. */
  readonly top_confidence: number | null;
  /** See KeyFinderSummaryRow.top_evidence_count. */
  readonly top_evidence_count: number | null;
  readonly run_count: number;
  /** True when ANY op (Run or Loop) is active (running or queued) for this key. */
  readonly running: boolean;
  /**
   * Mode of the active op if any. null when idle. Used by KeyRow to route the
   * running-spinner / queued-pill onto the correct button (Run vs Loop).
   */
  readonly opMode: 'run' | 'loop' | null;
  /**
   * Status of the active op if any. null when idle. 'queued' only applies to
   * Loop per Phase 3b UX — Run serializes silently through the lock and never
   * shows as queued to the user.
   */
  readonly opStatus: 'running' | 'queued' | null;
  /**
   * Primaries this key is currently riding on as a passenger. Empty when not
   * riding anywhere. Populated from `useOperationsStore` via
   * `selectPassengerRidesSignature` — each entry is a primary fieldKey whose
   * op is still running and has this key in its `passengerFieldKeys`.
   */
  readonly ridingPrimaries: RidingPrimaries;
  /**
   * Passengers this key is currently carrying (dual of ridingPrimaries).
   * Populated when THIS key is a running primary; each entry is one of the
   * keys packed into its LLM call. Empty when the key is idle OR running solo.
   * Drops to empty the moment the primary's op reaches a terminal status.
   */
  readonly activePassengers: RidingPrimaries;
}

export interface KeyGroup {
  readonly name: string;
  readonly keys: readonly KeyEntry[];
  readonly stats: {
    readonly total: number;
    readonly resolved: number;
    readonly unresolved: number;
    readonly running: number;
  };
}

export interface GroupedRows {
  readonly groups: readonly KeyGroup[];
  readonly totals: {
    /** Rows that survive variant-dependent + reserved exclusion, BEFORE user filters. */
    readonly base: number;
    /** Rows that survive exclusions AND the current user filter state. */
    readonly eligible: number;
    readonly resolved: number;
    readonly unresolved: number;
    readonly running: number;
    readonly excluded: number;
  };
}

// ── Run-mode gate ─────────────────────────────────────────────────────

export type RunMode =
  | 'keyRun'
  | 'keyLoop'
  | 'groupRun'
  | 'groupLoop'
  | 'productRun'
  | 'productLoop';

/**
 * Which run verbs are LIVE at each scope today.
 * All 6 modes are live after Stage C 2026-04-22.
 */
export const LIVE_MODES: Readonly<Record<RunMode, boolean>> = Object.freeze({
  keyRun: true,
  keyLoop: true,
  groupRun: true,
  groupLoop: true,
  productRun: true,
  productLoop: true,
});

export const DISABLED_REASONS: Readonly<Record<RunMode, string>> = Object.freeze({
  keyRun: '',
  keyLoop: '',
  groupRun: '',
  groupLoop: '',
  productRun: '',
  productLoop: '',
});

/**
 * Professional tooltip copy keyed by run mode + context. Rendered via the
 * native `title` attribute for now; future upgrade to <Tooltip> component
 * is a UI polish pass.
 */
export const TOOLTIPS = Object.freeze({
  keyRun: 'Focused key run — one LLM call for this key only. Click multiple times to queue additional runs (the server serializes them per-key). Honors the alwaysSoloRun contract: never bundles passengers when that knob is on.',
  keyLoop: 'Budget-bounded retry loop. Each iteration packs passengers live, subject to per-tier caps and hard-block on busy primaries.',
  keyRiding: 'Already riding as a passenger in another call — firing Loop now would add a dedicated primary attempt for this key.',
  keyPrompt: 'Loop prompt preview only — updates live as the snapshot changes.',
  keyUnpub: 'Unpub — demote the published value back to a candidate and wipe the publisher-stamped confidence + evidence rows. Runs and discovery history stay; a future Run can re-resolve. Reversible.',
  keyDelete: 'Delete — wipe every trace for this key: published value, confidence, candidates, evidence, URL/query history, and every run where this key was the primary. Fresh slate. Not reversible.',
  groupRun: 'Run every key in this group as one sorted line using the Key Finder sort-axis setting. Each dispatch recalculates passengers before the next key starts.',
  groupLoop: 'Loop unresolved keys in this group as one sorted line using the Key Finder sort-axis setting. Each Loop exits on published or budget exhausted.',
  productRun: 'Run every key across all groups as one global sorted line using the Key Finder sort-axis setting.',
  productLoop: 'Loop unresolved keys across all groups as one global sorted line. Prevents concurrent group loops from choosing overlapping passengers.',
});
