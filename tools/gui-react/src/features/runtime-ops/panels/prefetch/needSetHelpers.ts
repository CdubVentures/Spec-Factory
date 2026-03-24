import type { PrefetchSchema4Bundle, PrefetchNeedSetPlannerRow } from '../../types.ts';

/* ── Sort logic ─────────────────────────────────────────────────────── */

export type PlannerSortKey = 'field_key' | 'required_level' | 'state' | 'bundle_id';

export function sortPlannerRows(
  rows: PrefetchNeedSetPlannerRow[],
  sortKey: PlannerSortKey,
  sortDir: 'asc' | 'desc',
): PrefetchNeedSetPlannerRow[] {
  const sorted = [...rows];
  const bucketOrder: Record<string, number> = { core: 0, secondary: 1, expected: 2, optional: 3 };
  const stateOrder: Record<string, number> = { missing: 0, conflict: 1, weak: 2, satisfied: 3 };
  sorted.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'field_key') {
      cmp = String(a.field_key || '').localeCompare(String(b.field_key || ''));
    } else if (sortKey === 'required_level') {
      cmp = (bucketOrder[a.priority_bucket] ?? 99) - (bucketOrder[b.priority_bucket] ?? 99);
    } else if (sortKey === 'state') {
      cmp = (stateOrder[a.state] ?? 99) - (stateOrder[b.state] ?? 99);
    } else if (sortKey === 'bundle_id') {
      cmp = String(a.bundle_id || '').localeCompare(String(b.bundle_id || ''));
    }
    if (cmp === 0) cmp = String(a.field_key || '').localeCompare(String(b.field_key || ''));
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return sorted;
}

/* ── Derive rows from bundles ───────────────────────────────────────── */

export function derivePlannerRows(bundles: PrefetchSchema4Bundle[]): PrefetchNeedSetPlannerRow[] {
  const rows: PrefetchNeedSetPlannerRow[] = [];
  for (const bundle of bundles) {
    for (const f of bundle.fields) {
      rows.push({ field_key: f.key, priority_bucket: f.bucket, state: f.state, bundle_id: bundle.key });
    }
  }
  return rows;
}

/* ── Group bundles by phase ─────────────────────────────────────────── */

export function groupBundlesByPhase(bundles: PrefetchSchema4Bundle[]) {
  const now: PrefetchSchema4Bundle[] = [];
  const next: PrefetchSchema4Bundle[] = [];
  const hold: PrefetchSchema4Bundle[] = [];
  for (const b of bundles) {
    if (b.phase === 'now') now.push(b);
    else if (b.phase === 'next') next.push(b);
    else hold.push(b);
  }
  return { now, next, hold };
}

/* ── Categorize deltas ──────────────────────────────────────────────── */

export interface DeltaCategories {
  resolved: string[];
  improved: string[];
  newFields: string[];
  escalated: string[];
  regressed: string[];
}

export function categorizeDeltas(deltas: Array<{ field: string; from: string; to: string }>): DeltaCategories {
  const resolved: string[] = [];
  const improved: string[] = [];
  const newFields: string[] = [];
  const escalated: string[] = [];
  const regressed: string[] = [];
  for (const d of deltas) {
    if (d.to === 'satisfied') resolved.push(d.field);
    else if (d.from === 'none') newFields.push(d.field);
    else if (d.to === 'weak' && d.from === 'missing') improved.push(d.field);
    else if (d.from === 'satisfied' || d.from === 'weak') regressed.push(d.field);
    else escalated.push(d.field);
  }
  return { resolved, improved, newFields, escalated, regressed };
}

/* ── Next action text for field state ─────────────────────────────── */

export function nextAction(state: string): string {
  if (state === 'satisfied') return '\u2014';
  if (state === 'missing') return 'search';
  if (state === 'weak') return 're-search / verify';
  if (state === 'conflict') return 'targeted resolution';
  return 'search';
}

/*
 * WHY: sf-chip-info-strong uses hardcoded blue-700 (rgb(29 78 216)) which is
 * readable on white, unlike --sf-state-info-fg (#38bdf8) which is invisible.
 * border-current uses the chip's own text color for the border.
 */
export function phaseBadgeCls(phase: string): string {
  if (phase === 'now') return 'sf-chip-info-strong border-[1.5px] border-current';
  if (phase === 'next') return 'sf-chip-neutral border-[1.5px] border-current';
  return 'sf-chip-neutral border-[1.5px] border-current';
}
