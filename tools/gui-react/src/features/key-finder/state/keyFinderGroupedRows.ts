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

// Mirrors keyBundler.js:99-112 — mandatory before non-mandatory, always before
// sometimes before rare, easy before very_hard, then field_key alphabetical.
// The Loop Group / Loop All chain picks its next primary off this order so
// easy+always+mandatory unresolved keys get their Loops fired first.
const REQUIRED_RANK: Readonly<Record<string, number>> = { mandatory: 0, non_mandatory: 1 };
const AVAILABILITY_RANK: Readonly<Record<string, number>> = { always: 0, sometimes: 1, rare: 2 };
const DIFFICULTY_RANK: Readonly<Record<string, number>> = { easy: 0, medium: 1, hard: 2, very_hard: 3 };

function rankOr(table: Readonly<Record<string, number>>, key: string, fallback: number): number {
  const r = table[key];
  return typeof r === 'number' ? r : fallback;
}

export interface PrioritySortable {
  readonly field_key: string;
  readonly required_level: string;
  readonly availability: string;
  readonly difficulty: string;
}

export function sortKeysByPriority<T extends PrioritySortable>(rows: ReadonlyArray<T>): ReadonlyArray<T> {
  return [...rows].sort((a, b) => {
    const aReq = rankOr(REQUIRED_RANK, a.required_level, REQUIRED_RANK.non_mandatory + 1);
    const bReq = rankOr(REQUIRED_RANK, b.required_level, REQUIRED_RANK.non_mandatory + 1);
    if (aReq !== bReq) return aReq - bReq;
    const aAvail = rankOr(AVAILABILITY_RANK, a.availability, AVAILABILITY_RANK.rare + 1);
    const bAvail = rankOr(AVAILABILITY_RANK, b.availability, AVAILABILITY_RANK.rare + 1);
    if (aAvail !== bAvail) return aAvail - bAvail;
    const aDiff = rankOr(DIFFICULTY_RANK, a.difficulty, DIFFICULTY_RANK.very_hard + 1);
    const bDiff = rankOr(DIFFICULTY_RANK, b.difficulty, DIFFICULTY_RANK.very_hard + 1);
    if (aDiff !== bDiff) return aDiff - bDiff;
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
    const baseStatus: KeyStatus = (s?.last_status ?? null) as KeyStatus;

    const entry: KeyEntry = {
      field_key: fk,
      label: row.label || fk,
      difficulty: s?.difficulty || '',
      availability: s?.availability || '',
      required_level: s?.required_level || '',
      variant_dependent: false,
      budget: s?.budget ?? null,
      raw_budget: s?.raw_budget ?? null,
      in_flight_as_primary: s?.in_flight_as_primary ?? false,
      in_flight_as_passenger_count: s?.in_flight_as_passenger_count ?? 0,
      bundle_pool: s?.bundle_pool ?? 0,
      bundle_total_cost: s?.bundle_total_cost ?? 0,
      bundle_preview: s?.bundle_preview ?? [],
      last_run_number: s?.last_run_number ?? null,
      last_value: s?.last_value ?? null,
      last_confidence: s?.last_confidence ?? null,
      last_status: running ? null : baseStatus,
      last_model: s?.last_model ?? null,
      candidate_count: s?.candidate_count ?? 0,
      published: s?.published ?? false,
      run_count: s?.run_count ?? 0,
      running,
      opMode: opState?.mode ?? null,
      opStatus: opState?.status ?? null,
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
