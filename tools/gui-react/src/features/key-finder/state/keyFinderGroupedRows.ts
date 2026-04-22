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

interface SelectArgs {
  readonly layout: ReadonlyArray<ReviewLayoutRow> | undefined;
  readonly summary: ReadonlyArray<KeyFinderSummaryRow> | undefined;
  readonly reserved: ReadonlySet<string> | ReadonlyArray<string> | undefined;
  readonly runningSet: ReadonlySet<string>;
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

export function selectKeyFinderGroupedRows({
  layout,
  summary,
  reserved,
  runningSet,
  filters,
}: SelectArgs): GroupedRows {
  const layoutRows = Array.isArray(layout) ? layout : [];
  const summaryByKey = new Map<string, KeyFinderSummaryRow>();
  if (Array.isArray(summary)) {
    for (const row of summary) summaryByKey.set(row.field_key, row);
  }
  const reservedSet = toReservedSet(reserved);

  let excluded = 0;
  const totals = { eligible: 0, resolved: 0, unresolved: 0, running: 0 };

  // Preserve layout order → use an array of groups, not a Map, so insertion order = first-seen
  const groupIndex = new Map<string, KeyEntry[]>();
  const groupOrder: string[] = [];

  for (const row of layoutRows) {
    const fk = row.key;
    if (!fk) { excluded += 1; continue; }
    if (row.field_rule?.variant_dependent === true) { excluded += 1; continue; }
    if (reservedSet.has(fk)) { excluded += 1; continue; }

    const groupName = (row.group || '').trim() || '_ungrouped';
    const s = summaryByKey.get(fk);
    const running = runningSet.has(fk);
    const baseStatus: KeyStatus = (s?.last_status ?? null) as KeyStatus;

    const entry: KeyEntry = {
      field_key: fk,
      label: row.label || fk,
      difficulty: s?.difficulty || '',
      availability: s?.availability || '',
      required_level: s?.required_level || '',
      variant_dependent: false,
      budget: s?.budget ?? null,
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
      eligible: totals.eligible,
      resolved: totals.resolved,
      unresolved: totals.unresolved,
      running: totals.running,
      excluded,
    },
  };
}
