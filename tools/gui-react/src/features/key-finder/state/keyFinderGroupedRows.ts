/**
 * keyFinder grouped-rows selector — pure function.
 *
 * Input:  ReviewLayout rows (ordered by Field Studio) + summary rows (per-product
 *         run rollup) + reserved-keys denylist + runningSet (from operations store)
 *         + filter state.
 * Output: { groups: [{ name, keys, stats }], totals }
 *
 * Pipeline:
 *   1. Drop rows where field_rule.variant_dependent === true (manual-override turf)
 *   2. Drop rows where field_key ∈ reserved set (CEF/PIF/RDF/SKF-owned)
 *   3. Left-join with summary rows by field_key
 *   4. Override status with 'running' when runningSet.has(field_key)
 *   5. Apply filters (search substring + enum matches)
 *   6. groupBy field_rule.group, preserving first-seen order
 *   7. Within each group, preserve input order (which is Field Studio key_order)
 *   8. Drop empty groups
 */

import type { ReviewLayoutRow } from '../../../types/review.ts';
import type {
  KeyFinderSummaryRow,
  KeyFilterState,
  KeyEntry,
  KeyGroup,
  GroupedRows,
  KeyStatus,
} from '../types.ts';

interface OpState {
  readonly status: 'running' | 'queued';
  readonly mode: 'run' | 'loop';
}

interface SelectArgs {
  readonly layout: ReadonlyArray<ReviewLayoutRow> | undefined;
  readonly summary: ReadonlyArray<KeyFinderSummaryRow> | undefined;
  readonly reserved: ReadonlySet<string> | ReadonlyArray<string> | undefined;
  readonly runningSet: ReadonlySet<string>;
  /** Phase 3b: per-fieldKey op status + mode (Loop spinner vs Queued pill). */
  readonly opStates?: ReadonlyMap<string, OpState>;
  /** Per-fieldKey list of primaries currently carrying this key as passenger.
   *  Feeds the Riding column on each KeyRow. */
  readonly passengerRides?: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Per-primaryFieldKey list of passengers it's actively carrying (dual of
   *  passengerRides). Feeds the Passengers column on each KeyRow. */
  readonly activePassengers?: ReadonlyMap<string, ReadonlyArray<string>>;
  /** Keys currently waiting in a Loop-group chain (the current key in the
   *  chain is running and has its own opState; these are the ones NOT yet
   *  dispatched). Rendered as Loop-queued so the row's Loop button shows
   *  "Queued" without needing a fake server-side op. */
  readonly chainQueuedKeys?: ReadonlySet<string>;
  readonly filters: KeyFilterState;
}

function toReservedSet(reserved: ReadonlySet<string> | ReadonlyArray<string> | undefined): ReadonlySet<string> {
  if (!reserved) return new Set<string>();
  if (reserved instanceof Set) return reserved;
  return new Set<string>(reserved as ReadonlyArray<string>);
}

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function matchesFilters(
  entry: KeyEntry,
  groupName: string,
  filters: KeyFilterState,
): boolean {
  if (filters.search) {
    const needle = normalize(filters.search);
    const hay = `${normalize(entry.field_key)} ${normalize(entry.label)} ${normalize(groupName)}`;
    if (!hay.includes(needle)) return false;
  }
  if (filters.difficulty && entry.difficulty !== filters.difficulty) return false;
  if (filters.availability && entry.availability !== filters.availability) return false;
  if (filters.required && entry.required_level !== filters.required) return false;
  if (filters.status) {
    // status filter maps to the running-override OR the derived last_status
    const effective = entry.running ? 'running' : (entry.last_status ?? '');
    if (effective !== filters.status) return false;
  }
  return true;
}

/* ── Priority sort for Loop chains ──────────────────────────────── */

// Mirrors the backend helper `src/features/key/keyBundlerSortAxes.js`. Both
// sides use the same 3-axis contract (difficulty, required_level, availability)
// under a configurable precedence from the `bundlingSortAxisOrder` knob.
// Within-axis rank is fixed (easy<medium<hard<very_hard, mandatory<non_mandatory,
// always<sometimes<rare). `field_key` is the final deterministic tiebreaker.
// The Loop Group / Loop All chain picks its next primary off this order.
export const DEFAULT_AXIS_ORDER: readonly string[] = Object.freeze(['difficulty', 'required_level', 'availability']);
const KNOWN_AXES: ReadonlySet<string> = new Set(DEFAULT_AXIS_ORDER);

const REQUIRED_RANK: Readonly<Record<string, number>> = { mandatory: 0, non_mandatory: 1 };
const AVAILABILITY_RANK: Readonly<Record<string, number>> = { always: 0, sometimes: 1, rare: 2 };
const DIFFICULTY_RANK: Readonly<Record<string, number>> = { easy: 0, medium: 1, hard: 2, very_hard: 3 };

const AXIS_RANK_TABLE: Readonly<Record<string, { table: Readonly<Record<string, number>>; fallback: number }>> = {
  required_level: { table: REQUIRED_RANK, fallback: REQUIRED_RANK.non_mandatory + 1 },
  availability: { table: AVAILABILITY_RANK, fallback: AVAILABILITY_RANK.rare + 1 },
  difficulty: { table: DIFFICULTY_RANK, fallback: DIFFICULTY_RANK.very_hard + 1 },
};

function axisRank(axis: string, row: PrioritySortable): number {
  const spec = AXIS_RANK_TABLE[axis];
  if (!spec) return 0;
  const v = (row as unknown as Record<string, string>)[axis] ?? '';
  const r = spec.table[v];
  return typeof r === 'number' ? r : spec.fallback;
}

/**
 * Normalize a user-provided CSV axis order to a total ordering over all 3
 * known axes. Preserves user-supplied order, drops unknowns, dedupes on first
 * occurrence, and appends any missing axes in DEFAULT_AXIS_ORDER.
 */
export function parseAxisOrder(csv: string | null | undefined): readonly string[] {
  const raw = String(csv ?? '').trim();
  if (!raw) return [...DEFAULT_AXIS_ORDER];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of raw.split(',')) {
    const axis = token.trim();
    if (KNOWN_AXES.has(axis) && !seen.has(axis)) {
      seen.add(axis);
      result.push(axis);
    }
  }
  if (result.length === 0) return [...DEFAULT_AXIS_ORDER];
  for (const axis of DEFAULT_AXIS_ORDER) {
    if (!seen.has(axis)) result.push(axis);
  }
  return result;
}

export interface PrioritySortable {
  readonly field_key: string;
  readonly required_level: string;
  readonly availability: string;
  readonly difficulty: string;
}

export function sortKeysByPriority<T extends PrioritySortable>(
  rows: ReadonlyArray<T>,
  axisOrder?: readonly string[],
): ReadonlyArray<T> {
  const axes = axisOrder && axisOrder.length > 0 ? axisOrder : DEFAULT_AXIS_ORDER;
  return [...rows].sort((a, b) => {
    for (const axis of axes) {
      const aR = axisRank(axis, a);
      const bR = axisRank(axis, b);
      if (aR !== bR) return aR - bR;
    }
    if (a.field_key < b.field_key) return -1;
    if (a.field_key > b.field_key) return 1;
    return 0;
  });
}

export function selectKeyFinderGroupedRows({
  layout,
  summary,
  reserved,
  runningSet,
  opStates,
  passengerRides,
  activePassengers,
  chainQueuedKeys,
  filters,
}: SelectArgs): GroupedRows {
  const layoutRows = Array.isArray(layout) ? layout : [];
  const summaryByKey = new Map<string, KeyFinderSummaryRow>();
  if (Array.isArray(summary)) {
    for (const row of summary) summaryByKey.set(row.field_key, row);
  }
  const reservedSet = toReservedSet(reserved);

  let excluded = 0;
  let base = 0;
  const totals = { eligible: 0, resolved: 0, unresolved: 0, running: 0 };

  // Preserve layout order → use an array of groups, not a Map, so insertion order = first-seen
  const groupIndex = new Map<string, KeyEntry[]>();
  const groupOrder: string[] = [];

  for (const row of layoutRows) {
    const fk = row.key;
    if (!fk) { excluded += 1; continue; }
    if (row.field_rule?.variant_dependent === true) { excluded += 1; continue; }
    if (reservedSet.has(fk)) { excluded += 1; continue; }
    base += 1;

    const groupName = (row.group || '').trim() || '_ungrouped';
    const s = summaryByKey.get(fk);
    const opState = opStates?.get(fk) || null;
    // An op is "active" if it's running OR queued. The running flag drives the
    // legacy status-pill rendering + KPI count; opMode/opStatus route the
    // Loop-specific UI (spinner on Loop button vs Queued pill).
    const running = opState !== null || runningSet.has(fk);
    // Chain-queued keys don't have a real opState yet — synthesize loop/queued
    // so the row's Loop button renders as Queued. Falls through when a real
    // opState takes over (once the chain advances to this key).
    const chainQueued = !opState && (chainQueuedKeys?.has(fk) ?? false);
    const effectiveOpMode = opState?.mode ?? (chainQueued ? 'loop' : null);
    const effectiveOpStatus = opState?.status ?? (chainQueued ? 'queued' : null);
    const rawStatus = (s?.last_status ?? null) as KeyStatus | 'unk';
    const baseStatus: KeyStatus = rawStatus === 'unk' ? 'unresolved' : rawStatus;

    const entry: KeyEntry = {
      field_key: fk,
      label: row.label || fk,
      difficulty: s?.difficulty || '',
      availability: s?.availability || '',
      required_level: s?.required_level || '',
      variant_dependent: false,
      product_image_dependent: s?.product_image_dependent ?? false,
      uses_variant_inventory: s?.uses_variant_inventory ?? false,
      uses_pif_priority_images: s?.uses_pif_priority_images ?? false,
      budget: s?.budget ?? null,
      raw_budget: s?.raw_budget ?? null,
      in_flight_as_primary: s?.in_flight_as_primary ?? false,
      in_flight_as_passenger_count: s?.in_flight_as_passenger_count ?? 0,
      bundle_pool: s?.bundle_pool ?? 0,
      bundle_total_cost: s?.bundle_total_cost ?? 0,
      bundle_preview: s?.bundle_preview ?? [],
      dedicated_run: s?.dedicated_run === true,
      component_run_kind: s?.component_run_kind ?? '',
      component_parent_key: s?.component_parent_key ?? '',
      component_dependency_satisfied: s?.component_dependency_satisfied ?? true,
      run_blocked_reason: s?.run_blocked_reason ?? '',
      belongs_to_component: s?.belongs_to_component ?? '',
      last_run_number: s?.last_run_number ?? null,
      last_value: s?.last_value ?? null,
      last_confidence: s?.last_confidence ?? null,
      last_status: running ? null : baseStatus,
      last_model: s?.last_model ?? null,
      last_fallback_used: s?.last_fallback_used ?? null,
      last_access_mode: s?.last_access_mode ?? null,
      last_effort_level: s?.last_effort_level ?? null,
      last_thinking: s?.last_thinking ?? null,
      last_web_search: s?.last_web_search ?? null,
      candidate_count: s?.candidate_count ?? 0,
      published: s?.published ?? false,
      concrete_evidence: s?.concrete_evidence ?? false,
      top_confidence: s?.top_confidence ?? null,
      top_evidence_count: s?.top_evidence_count ?? null,
      run_count: s?.run_count ?? 0,
      running,
      opMode: effectiveOpMode,
      opStatus: effectiveOpStatus,
      ridingPrimaries: passengerRides?.get(fk) ?? [],
      activePassengers: activePassengers?.get(fk) ?? [],
    };

    if (!matchesFilters(entry, groupName, filters)) continue;

    if (!groupIndex.has(groupName)) {
      groupIndex.set(groupName, []);
      groupOrder.push(groupName);
    }
    groupIndex.get(groupName)!.push(entry);

    totals.eligible += 1;
    if (running) totals.running += 1;
    else if (entry.last_status === 'resolved') totals.resolved += 1;
    else totals.unresolved += 1;
  }

  const groups: KeyGroup[] = [];
  for (const name of groupOrder) {
    const keys = groupIndex.get(name)!;
    if (keys.length === 0) continue;
    const stats = { total: keys.length, resolved: 0, unresolved: 0, running: 0 };
    for (const k of keys) {
      if (k.running) stats.running += 1;
      else if (k.last_status === 'resolved') stats.resolved += 1;
      else stats.unresolved += 1;
    }
    groups.push({ name, keys, stats });
  }

  return {
    groups,
    totals: {
      base,
      eligible: totals.eligible,
      resolved: totals.resolved,
      unresolved: totals.unresolved,
      running: totals.running,
      excluded,
    },
  };
}
