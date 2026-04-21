/**
 * keyFinder dashboard — shared types + run-mode gate.
 *
 * Single source of truth for which run verbs are live at which scope.
 * When a future phase (3b Loop, 5 Smart Loop) ships, flip the flag here.
 */

export type KeyStatus =
  | 'resolved'
  | 'below_threshold'
  | 'unk'
  | 'unresolved'
  | null;

/** One row returned by GET /key-finder/:cat/:pid/summary — one per eligible key. */
export interface KeyFinderSummaryRow {
  readonly field_key: string;
  readonly group: string;
  readonly label: string;
  readonly difficulty: string;
  readonly availability: string;
  readonly required_level: string;
  readonly variant_dependent: boolean;
  /** calcKeyBudget(fieldRule, variantCount, settings).attempts — what Loop mode would spend. */
  readonly budget: number | null;
  readonly last_run_number: number | null;
  readonly last_ran_at: string | null;
  readonly last_status: KeyStatus;
  readonly last_value: unknown;
  readonly last_confidence: number | null;
  readonly last_model: string | null;
  readonly candidate_count: number;
  readonly published: boolean;
  readonly run_count: number;
}

export type KeyHistoryScope = 'key' | 'group' | 'product';

export interface KeyHistoryRun {
  readonly run_number: number;
  readonly ran_at: string;
  readonly model: string;
  readonly thinking?: boolean;
  readonly web_search?: boolean;
  readonly effort_level?: string;
  readonly selected?: unknown;
  readonly prompt?: { system?: string; user?: string };
  readonly response: {
    readonly primary_field_key: string;
    readonly results: Record<string, {
      readonly value: unknown;
      readonly confidence: number;
      readonly unknown_reason: string;
      readonly evidence_refs: ReadonlyArray<unknown>;
      readonly discovery_log?: {
        readonly urls_checked: readonly string[];
        readonly queries_run: readonly string[];
        readonly notes: readonly string[];
      };
    }>;
  };
}

export interface KeyFinderDetail {
  readonly product_id: string;
  readonly category: string;
  readonly scope: string;
  readonly field_key: string | null;
  readonly group: string | null;
  readonly selected: unknown;
  readonly runs: readonly KeyHistoryRun[];
  readonly candidates: readonly unknown[];
}

export interface ReservedKeysResponse {
  readonly reserved: readonly string[];
}

export interface KeyFilterState {
  readonly search: string;
  readonly difficulty: string;   // '' = all
  readonly availability: string;
  readonly required: string;     // 'mandatory' | 'non_mandatory' | ''
  readonly status: string;       // 'resolved' | 'unresolved' | 'unk' | 'below_threshold' | ''
}

export const DEFAULT_FILTERS: KeyFilterState = Object.freeze({
  search: '',
  difficulty: '',
  availability: '',
  required: '',
  status: '',
});

/** A key merged with its summary + runtime running state. */
export interface KeyEntry {
  readonly field_key: string;
  readonly label: string;
  readonly difficulty: string;
  readonly availability: string;
  readonly required_level: string;
  readonly variant_dependent: boolean;
  readonly budget: number | null;
  readonly last_run_number: number | null;
  readonly last_value: unknown;
  readonly last_confidence: number | null;
  readonly last_status: KeyStatus;
  readonly last_model: string | null;
  readonly candidate_count: number;
  readonly published: boolean;
  readonly run_count: number;
  readonly running: boolean;
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
 * Phase 3b ships → flip `keyLoop` to true + wire the loop mutation.
 * Phase 5 ships → flip the 4 group/product flags + wire Smart Loop backend.
 */
export const LIVE_MODES: Readonly<Record<RunMode, boolean>> = Object.freeze({
  keyRun: true,
  keyLoop: false,
  groupRun: false,
  groupLoop: false,
  productRun: false,
  productLoop: false,
});

export const DISABLED_REASONS: Readonly<Record<RunMode, string>> = Object.freeze({
  keyRun: '',
  keyLoop: 'Per-key Smart Loop — Phase 3b',
  groupRun: 'Group walk — Phase 5',
  groupLoop: 'Group Smart Loop — Phase 5',
  productRun: 'All-groups walk — Phase 5',
  productLoop: 'All-groups Smart Loop — Phase 5',
});
