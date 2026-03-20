import { useMemo } from 'react';
import type { PrefetchNeedSetData, PrefetchSchema4Bundle, PrefetchNeedSetPlannerRow, NeedSetField, PrefetchLlmCall } from '../../types';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand';
import type { RuntimeIdxBadge } from '../../types';
import {
  formatNumber,
  queryFamilyBadge,
} from '../../../indexing/helpers';
import { usePersistedTab, usePersistedNullableTab, usePersistedExpandMap } from '../../../../stores/tabStore';
import { usePersistedToggle } from '../../../../stores/collapseStore';

/* ── Props ──────────────────────────────────────────────────────────── */

interface PrefetchNeedSetPanelProps {
  data: PrefetchNeedSetData;
  persistScope: string;
  idxRuntime?: RuntimeIdxBadge[];
  needsetPlannerCalls?: PrefetchLlmCall[];
}

/* ── Theme-aligned badge helpers ───────────────────────────────────── */

function stateBadge(state: string): { label: string; cls: string } {
  if (state === 'missing') return { label: 'missing', cls: 'sf-chip-danger' };
  if (state === 'weak') return { label: 'weak', cls: 'sf-chip-warning' };
  if (state === 'conflict') return { label: 'conflict', cls: 'sf-chip-danger' };
  if (state === 'satisfied' || state === 'covered') return { label: 'satisfied', cls: 'sf-chip-success' };
  return { label: state || 'unknown', cls: 'sf-chip-neutral' };
}

function bucketBadge(bucket: string): { label: string; cls: string } {
  if (bucket === 'core') return { label: 'core', cls: 'sf-chip-danger' };
  if (bucket === 'secondary') return { label: 'secondary', cls: 'sf-chip-warning' };
  if (bucket === 'expected') return { label: 'expected', cls: 'sf-chip-info' };
  if (bucket === 'optional') return { label: 'optional', cls: 'sf-chip-neutral' };
  return { label: bucket || 'unknown', cls: 'sf-chip-neutral' };
}

function stateDotCls(state: string): string {
  if (state === 'missing') return 'bg-[var(--sf-state-error-fg)]';
  if (state === 'weak') return 'bg-[var(--sf-state-warning-fg)]';
  if (state === 'conflict') return 'bg-[var(--sf-state-error-fg)]';
  if (state === 'satisfied' || state === 'covered') return 'bg-[var(--sf-state-success-fg)]';
  return 'sf-bg-surface-soft-strong';
}

/*
 * WHY: blocker cards use chip classes because state-fg tokens (#38bdf8, #f59e0b)
 * are too light for standalone text on white backgrounds — chip classes pair
 * foreground + background for guaranteed contrast across all themes.
 */
function blockerChipCls(key: string): string {
  if (key === 'missing') return 'sf-chip-neutral';
  if (key === 'weak' || key === 'weak_evidence') return 'sf-chip-warning';
  if (key === 'conflict') return 'sf-chip-danger';
  if (key === 'needs_exact_match') return 'sf-chip-confirm';
  return 'sf-chip-neutral';
}

/* ── Sort logic ─────────────────────────────────────────────────────── */

type PlannerSortKey = 'field_key' | 'required_level' | 'state' | 'bundle_id';

function sortPlannerRows(
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

/*
 * WHY: sf-chip-info-strong uses hardcoded blue-700 (rgb(29 78 216)) which is
 * readable on white, unlike --sf-state-info-fg (#38bdf8) which is invisible.
 * border-current uses the chip's own text color for the border.
 */
function phaseBadgeCls(phase: string): string {
  if (phase === 'now') return 'sf-chip-info-strong border-[1.5px] border-current';
  if (phase === 'next') return 'sf-chip-neutral border-[1.5px] border-current';
  return 'sf-chip-neutral border-[1.5px] border-current';
}

/* ── Next action text for field state ─────────────────────────────── */

function nextAction(state: string): string {
  if (state === 'satisfied') return '\u2014';
  if (state === 'missing') return 'search';
  if (state === 'weak') return 're-search / verify';
  if (state === 'conflict') return 'targeted resolution';
  return 'search';
}

/* ── Section: BundleCard ────────────────────────────────────────────── */

interface BundleCardProps {
  bundle: PrefetchSchema4Bundle;
  expanded: boolean;
  onToggle: () => void;
}

function BundleCard({ bundle, expanded, onToggle }: BundleCardProps) {
  const fields = bundle.fields ?? [];
  const satisfiedCount = fields.filter(f => f.state === 'satisfied').length;
  const totalCount = fields.length;
  const progressPct = totalCount > 0 ? (satisfiedCount / totalCount) * 100 : 0;
  const isActive = bundle.phase === 'now' || fields.some(f => f.state !== 'satisfied');

  const sortedFields = useMemo(() =>
    [...fields].sort((a, b) => {
      const order: Record<string, number> = { core: 0, secondary: 1, expected: 2, optional: 3 };
      return (order[a.bucket] ?? 9) - (order[b.bucket] ?? 9);
    }),
  [fields]);

  return (
    <div className={`sf-surface-elevated border sf-border-soft rounded-sm transition-opacity ${isActive ? 'opacity-100' : 'opacity-70'}`}>
      {/* Clickable header */}
      <div
        onClick={onToggle}
        className="grid gap-4 px-5 py-3.5 cursor-pointer select-none"
        /* WHY: 3-col grid matches reference — phase pill | content | progress */
        style={{ gridTemplateColumns: 'auto 1fr auto' }}
      >
        {/* Phase pill */}
        <div className="pt-0.5">
          <span className={`inline-block px-2 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em] ${phaseBadgeCls(bundle.phase)}`}>
            {bundle.phase || 'hold'}
          </span>
        </div>

        {/* Center: label + desc + metadata grid */}
        <div className="min-w-0">
          <div className="text-[15px] font-bold sf-text-primary leading-tight">{bundle.label || bundle.key}</div>
          <div className="mt-0.5 text-xs sf-text-muted truncate">{bundle.desc}</div>

          {/* Metadata grid — reason from LLM planner */}
          {isActive && bundle.reason_active && (
            <div className="grid grid-cols-2 gap-x-5 gap-y-1 mt-2.5 pt-2 border-t sf-border-soft">
              {([
                ['reason active', bundle.reason_active],
              ] as const).filter(([, val]) => val).map(([lbl, val]) => (
                <div key={lbl} className="flex gap-1.5 items-baseline">
                  <span className="text-[8px] font-bold uppercase tracking-[0.08em] sf-text-subtle shrink-0 min-w-[3.2rem]">{lbl}</span>
                  <span className="text-[11px] font-mono sf-text-muted">{val}</span>
                </div>
              ))}
            </div>
          )}

          {/* Inactive message */}
          {!isActive && (
            <div className="text-[10px] font-mono sf-text-subtle italic mt-1">Not queued this round</div>
          )}
        </div>

        {/* Right: ratio + bar */}
        <div className="text-right shrink-0 min-w-[8.5rem]">
          <div className={`text-[13px] font-bold font-mono mb-1.5 ${progressPct === 100 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-primary'}`}>
            {satisfiedCount}/{totalCount}
          </div>
          {/* Progress bar — fixed width + border to match reference */}
          <div className="w-[130px] ml-auto h-1 rounded-sm overflow-hidden sf-bg-surface-soft-strong border sf-border-soft">
            <div
              className={`h-full rounded-sm transition-all ${progressPct === 100 ? 'bg-[var(--sf-state-success-fg)]' : 'bg-[var(--sf-token-accent)]'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Expanded: field table */}
      {expanded && (
        <div className="border-t sf-border-soft overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="sf-surface-elevated">
                {['field', 'bucket', 'state', 'next action'].map(h => (
                  <th key={h} className="py-2 px-5 text-left text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle border-b sf-border-soft">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedFields.map(f => {
                const stB = stateBadge(f.state);
                const bB = bucketBadge(f.bucket);
                return (
                  <tr key={f.key} className={`border-b sf-border-soft ${f.state === 'conflict' ? 'bg-[var(--sf-state-error-bg)]' : ''}`}>
                    <td className={`py-1.5 px-5 font-mono font-medium ${f.state === 'satisfied' ? 'sf-text-subtle' : 'sf-text-primary'}`}>{f.key}</td>
                    <td className="py-1.5 px-5"><span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[0.08em] ${bB.cls}`}>{bB.label}</span></td>
                    <td className="py-1.5 px-5">
                      <span className="inline-flex items-center gap-1">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${stateDotCls(f.state)}`} />
                        <span className={`text-[10px] font-semibold uppercase tracking-[0.04em] ${stB.cls}`}>{stB.label}</span>
                      </span>
                    </td>
                    <td className="py-1.5 px-5 font-mono sf-text-muted">{nextAction(f.state)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Derive rows from bundles ───────────────────────────────────────── */

function derivePlannerRows(bundles: PrefetchSchema4Bundle[]): PrefetchNeedSetPlannerRow[] {
  const rows: PrefetchNeedSetPlannerRow[] = [];
  for (const bundle of bundles) {
    for (const f of bundle.fields) {
      rows.push({ field_key: f.key, priority_bucket: f.bucket, state: f.state, bundle_id: bundle.key });
    }
  }
  return rows;
}

/* ── Group bundles by phase ─────────────────────────────────────────── */

function groupBundlesByPhase(bundles: PrefetchSchema4Bundle[]) {
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

function categorizeDeltas(deltas: Array<{ field: string; from: string; to: string }>) {
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

/* ── Source family icons (profile influence) ───────────────────────── */

function FamilyIcon({ family, size = 14 }: { family: string; size?: number }) {
  const s = size;
  const common = { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'inline-block shrink-0' };
  if (family === 'manufacturer_html') return <svg {...common}><circle cx="8" cy="8" r="6" /><ellipse cx="8" cy="8" rx="3" ry="6" /><line x1="2" y1="8" x2="14" y2="8" /></svg>;
  if (family === 'manual_pdf') return <svg {...common}><path d="M4.5 2h5L13 5.5V14h-8.5V2z" /><path d="M9 2v4h4" /><line x1="6" y1="8.5" x2="11" y2="8.5" /><line x1="6" y1="10.5" x2="10" y2="10.5" /></svg>;
  if (family === 'support_docs') return <svg {...common}><path d="M3 9V7a5 5 0 0 1 10 0v2" /><rect x="1.5" y="8.5" width="3" height="4" rx="1" /><rect x="11.5" y="8.5" width="3" height="4" rx="1" /></svg>;
  if (family === 'review_lookup') return <svg {...common}><path d="M2 5h12l-1.5 7H3.5z" /><circle cx="5.5" cy="3.5" r="1.5" /><circle cx="10.5" cy="3.5" r="1.5" /></svg>;
  if (family === 'benchmark_lookup') return <svg {...common}><path d="M3 13V7" /><path d="M6.5 13V5" /><path d="M10 13V8" /><path d="M13 13V3" /><line x1="2" y1="13" x2="14" y2="13" /></svg>;
  if (family === 'fallback_web') return <svg {...common}><circle cx="7" cy="7" r="4.5" /><line x1="10.5" y1="10.5" x2="14" y2="14" /></svg>;
  if (family === 'targeted_single' || family === 'targeted_single_field') return <svg {...common}><circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none" /></svg>;
  return <svg {...common}><circle cx="8" cy="8" r="6" /></svg>;
}

/* ── LLM Pending Bar ──────────────────────────────────────────────── */

function LlmPendingBar() {
  return (
    <div className="flex items-center gap-2.5 py-3 px-4 rounded-sm sf-surface-elevated border sf-border-soft">
      <div className="w-20 h-1 rounded-sm overflow-hidden sf-bg-surface-soft-strong">
        <div className="h-full w-full rounded-sm bg-[var(--sf-token-accent)] animate-pulse" />
      </div>
      <span className="text-[10px] font-mono font-semibold tracking-[0.02em] sf-text-muted">
        search planner LLM in progress&hellip;
      </span>
    </div>
  );
}

/* ── Section header ────────────────────────────────────────────────── */

/* ── Main Panel ─────────────────────────────────────────────────────── */

const PLANNER_SORT_KEYS = ['field_key', 'required_level', 'state', 'bundle_id'] as const;
const SORT_DIRS = ['asc', 'desc'] as const;
const DRILLDOWN_FILTERS = ['unresolved', 'escalated', 'all'] as const;

export function PrefetchNeedSetPanel({ data, persistScope, idxRuntime, needsetPlannerCalls }: PrefetchNeedSetPanelProps) {
  const [plannerSortKey, setPlannerSortKey] = usePersistedTab<PlannerSortKey>(`runtimeOps:needset:sortKey:${persistScope}`, 'required_level', { validValues: PLANNER_SORT_KEYS });
  const [plannerSortDir, setPlannerSortDir] = usePersistedTab<'asc' | 'desc'>(`runtimeOps:needset:sortDir:${persistScope}`, 'asc', { validValues: SORT_DIRS });
  const [fieldFilter, setFieldFilter] = usePersistedTab<string>(`runtimeOps:needset:fieldFilter:${persistScope}`, '');
  const [expandedBundles, toggleBundle, replaceExpandedBundles] = usePersistedExpandMap(`runtimeOps:needset:expandedBundles:${persistScope}`);
  const [showQueryPreview, toggleShowQueryPreview] = usePersistedToggle(`runtimeOps:needset:showQueryPreview:${persistScope}`, false);
  const [drilldownFilter, setDrilldownFilter] = usePersistedTab<'unresolved' | 'escalated' | 'all'>(`runtimeOps:needset:drilldownFilter:${persistScope}`, 'unresolved', { validValues: DRILLDOWN_FILTERS });
  const [drilldownOpen, toggleDrilldownOpen, setDrilldownOpen] = usePersistedToggle(`runtimeOps:needset:drilldownOpen:${persistScope}`, true);
  const [historyOpen, toggleHistoryOpen, setHistoryOpen] = usePersistedToggle(`runtimeOps:needset:historyOpen:${persistScope}`, false);
  const [expandedHistoryField, setExpandedHistoryField] = usePersistedNullableTab(`runtimeOps:needset:expandedHistory:${persistScope}`, null);

  const summary = data.summary;
  const blockers = data.blockers;
  /* WHY: backward-compat bundles from NeedSet use different keys (bundle_id,
     priority_bucket, states) vs Schema 4 (key, priority, phase, queries).
     Normalize so the panel renders either shape. */
  const bundles = useMemo(() => {
    const raw = (data.bundles ?? []) as Array<PrefetchSchema4Bundle & { bundle_id?: string; priority_bucket?: string }>;
    return raw.map((b) => ({
      key: (b.key ?? b.bundle_id ?? '') as string,
      label: (b.label ?? b.bundle_id ?? '') as string,
      desc: (b.desc ?? '') as string,
      priority: (b.priority ?? b.priority_bucket ?? 'secondary') as 'core' | 'secondary' | 'optional',
      phase: (b.phase ?? 'now') as 'now' | 'next' | 'hold',
      source_target: (b.source_target ?? '') as string,
      content_target: (b.content_target ?? '') as string,
      search_intent: (b.search_intent ?? null) as string | null,
      host_class: (b.host_class ?? null) as string | null,
      query_family_mix: (b.query_family_mix ?? null) as string | null,
      reason_active: (b.reason_active ?? null) as string | null,
      fields: Array.isArray(b.fields)
        ? b.fields.map((f) => ({
            key: f.key ?? '',
            state: f.state ?? 'missing',
            bucket: f.bucket ?? 'secondary',
          }))
        : [],
    }));
  }, [data.bundles]);
  const profileInfluence = data.profile_influence;
  const deltas = data.deltas ?? [];
  const round = data.round;
  const hasData = summary !== undefined || bundles.length > 0;
  // WHY: Pre-LLM data (blockers, deltas, field history) arrives instantly from
  // Schema 2/3. LLM-dependent sections (bundles, profile, drilldown) need Schema 4.
  const hasPreLlmData = summary !== undefined;
  const hasLlmData = bundles.length > 0;
  const isLlmPending = hasPreLlmData && !hasLlmData;

  // WHY: Builder always sets rows=[] (not undefined), so ?? never triggers.
  // Use length check to fall back to deriving rows from bundles.
  const plannerRows = useMemo(
    () => (data.rows && data.rows.length > 0) ? data.rows : derivePlannerRows(bundles),
    [data.rows, bundles],
  );

  /* Drilldown rows enriched with bundle info */
  const drilldownRows = useMemo(() => {
    const rows: Array<PrefetchNeedSetPlannerRow & { bundle_label: string; phase: string; source_target: string }> = [];
    for (const bundle of bundles) {
      for (const f of bundle.fields) {
        rows.push({
          field_key: f.key,
          priority_bucket: f.bucket,
          state: f.state,
          bundle_id: bundle.key,
          bundle_label: bundle.label || bundle.key,
          phase: bundle.phase,
          source_target: bundle.source_target || '',
        });
      }
    }
    return rows;
  }, [bundles]);

  const filteredDrilldownRows = useMemo(() => {
    let rows = drilldownRows;
    if (drilldownFilter === 'unresolved') rows = rows.filter(r => r.state !== 'satisfied');
    else if (drilldownFilter === 'escalated') rows = rows.filter(r => r.state === 'conflict' || r.state === 'weak');
    if (fieldFilter) rows = rows.filter(r => r.field_key.toLowerCase().includes(fieldFilter.toLowerCase()));
    return sortPlannerRows(rows, plannerSortKey, plannerSortDir);
  }, [drilldownRows, drilldownFilter, fieldFilter, plannerSortKey, plannerSortDir]);

  const handlePlannerSort = (key: PlannerSortKey) => {
    if (key === plannerSortKey) {
      setPlannerSortDir(plannerSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setPlannerSortKey(key);
      setPlannerSortDir('asc');
    }
  };

  const sortArrow = (key: PlannerSortKey) =>
    plannerSortKey === key ? (plannerSortDir === 'asc' ? ' \u25b4' : ' \u25be') : '';

  const TIER_CATEGORIES = ['targeted_specification', 'targeted_sources', 'targeted_groups', 'targeted_single'] as const;
  const tierEntries = useMemo(() => {
    if (!profileInfluence) return [];
    // WHY: Always show all 4 tier categories so the user sees the full picture
    // even when a tier has 0 allocated (e.g. 0/5 sources on round 0).
    return TIER_CATEGORIES
      .map((cat) => ({ category: cat, count: (profileInfluence[cat] as number) ?? 0 }));
  }, [profileInfluence]);

  const tierTotal = tierEntries.reduce((s, e) => s + e.count, 0);
  const grouped = useMemo(() => groupBundlesByPhase(bundles), [bundles]);
  const deltaCats = useMemo(() => categorizeDeltas(deltas), [deltas]);
  const activeBundles = grouped.now.length + grouped.next.length;

  /* ── Field history (anti-garbage feedback loop) ────────────────────── */
  const ESCALATION_THRESHOLD = 3;

  const historyFields = useMemo(() => {
    const fields = data.fields ?? [];
    return fields
      .filter((f: NeedSetField) => {
        const h = f.history;
        if (!h) return false;
        return h.query_count > 0 || h.no_value_attempts > 0 || (h.domains_tried?.length ?? 0) > 0;
      })
      .sort((a: NeedSetField, b: NeedSetField) => {
        const aAttempts = a.history?.no_value_attempts ?? 0;
        const bAttempts = b.history?.no_value_attempts ?? 0;
        if (bAttempts !== aAttempts) return bAttempts - aAttempts;
        return (b.history?.query_count ?? 0) - (a.history?.query_count ?? 0);
      });
  }, [data.fields]);

  const stuckFieldCount = historyFields.filter(
    (f: NeedSetField) => (f.history?.no_value_attempts ?? 0) >= ESCALATION_THRESHOLD,
  ).length;

  /* Empty state */
  if (!hasData && data.total_fields === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">NeedSet</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128203;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for NeedSet computation</div>
          <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">
            The NeedSet will appear after the first computation round. It groups unresolved fields
            into search bundles by priority, content type, and source affinity to shape discovery.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ── Hero Band ─────────────────────────────────────── */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">NeedSet</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Search Planner</span>
          {round !== undefined && (
            <span className="px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.06em] text-[var(--sf-token-accent)] border-[1.5px] border-[var(--sf-token-accent)]">
              round {round}
            </span>
          )}
        </>}
        trailing={<>
          <span className="px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.06em] sf-chip-warning border-[1.5px] border-current">LLM</span>
          <Tip text="Search gap planner — groups unresolved fields into search bundles by priority, content type, and source affinity." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        {/* Big stat numbers — 4-col grid with colored values */}
        {summary && (
          <HeroStatGrid>
            <HeroStat value={formatNumber(summary.core_unresolved)} label="core unresolved" colorClass="text-[var(--sf-state-error-fg)]" />
            <HeroStat value={formatNumber(summary.conflicts)} label="conflict" colorClass={summary.conflicts > 0 ? 'text-[var(--sf-state-error-fg)]' : 'text-[var(--sf-state-success-fg)]'} />
            <HeroStat value={`${activeBundles}/${bundles.length}`} label="bundles active / tracked" />
            <HeroStat value={profileInfluence?.total_unresolved_keys ?? 0} label="unresolved keys" />
          </HeroStatGrid>
        )}

        {/* Narrative — budget-aware */}
        {summary && profileInfluence && (
          <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
            {profileInfluence.budget != null && (
              <strong className="sf-text-primary not-italic">Budget: {profileInfluence.budget} queries &mdash; </strong>
            )}
            <strong className="sf-text-primary not-italic">{profileInfluence.targeted_specification}/{profileInfluence.targeted_specification > 0 ? 1 : 1} spec seed, </strong>
            <strong className="sf-text-primary not-italic">{profileInfluence.targeted_sources}/{profileInfluence.total_sources ?? 0} sources, </strong>
            <strong className="sf-text-primary not-italic">{profileInfluence.targeted_groups}/{profileInfluence.total_groups ?? 0} groups, </strong>
            <strong className="sf-text-primary not-italic">{profileInfluence.targeted_single}/{profileInfluence.total_unresolved_keys ?? 0} keys. </strong>
            {(profileInfluence.overflow_groups > 0 || profileInfluence.overflow_keys > 0) && (
              <span className="text-xs sf-text-muted">
                ({[
                  profileInfluence.overflow_groups > 0 ? `${profileInfluence.overflow_groups} groups` : '',
                  profileInfluence.overflow_keys > 0 ? `${profileInfluence.overflow_keys} keys` : '',
                ].filter(Boolean).join(' + ')} deferred)
              </span>
            )}
            {' '}{summary.core_unresolved + summary.secondary_unresolved + (summary.optional_unresolved ?? 0)} unresolved fields across {activeBundles} active bundles, with {summary.core_unresolved} core fields still missing.
          </div>
        )}
      </HeroBand>

      {/* ── Why We're Stuck ───────────────────────────────── */}
      {blockers && (
        <div>
          <SectionHeader>why we&apos;re stuck</SectionHeader>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {([
              ['missing', blockers.missing, '\u25CB'],
              ['weak_evidence', blockers.weak, '\u25D0'],
              ['conflict', blockers.conflict, '\u2298'],
              ['needs_exact_match', blockers.needs_exact_match, '\u25C8'],
            ] as const).map(([key, count, icon]) => (
              <div
                key={key}
                className={`px-4 py-3.5 rounded-sm border sf-border-soft ${blockerChipCls(key)} ${(count ?? 0) === 0 ? 'opacity-60' : ''} transition-opacity`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold leading-none">{formatNumber(count ?? 0)}</span>
                  <span className="text-base">{icon}</span>
                </div>
                <div className="mt-1.5 text-[10px] font-bold font-mono uppercase tracking-[0.06em]">{key.replace(/_/g, ' ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Search Focus Bundles ──────────────────────────── */}
      {isLlmPending && (
        <div>
          <SectionHeader>search focus bundles</SectionHeader>
          <LlmPendingBar />
        </div>
      )}
      {bundles.length > 0 && (
        <div>
          <SectionHeader>search focus bundles</SectionHeader>

          {/* NOW phase */}
          {grouped.now.length > 0 && (
            <div className="flex flex-col gap-2">
              {grouped.now.map((b) => (
                <BundleCard key={b.key} bundle={b} expanded={!!expandedBundles[b.key]} onToggle={() => toggleBundle(b.key)} />
              ))}
            </div>
          )}

          {/* NEXT phase */}
          {grouped.next.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {grouped.next.map((b) => (
                <BundleCard key={b.key} bundle={b} expanded={!!expandedBundles[b.key]} onToggle={() => toggleBundle(b.key)} />
              ))}
            </div>
          )}

          {/* HOLD / unqueued */}
          {grouped.hold.length > 0 && (
            <>
              <div className="mt-5 mb-2 text-[10px] font-bold uppercase tracking-[0.06em] sf-text-subtle">
                observed &middot; not queued this round
              </div>
              <div className="flex flex-col gap-2">
                {grouped.hold.map((b) => (
                  <BundleCard key={b.key} bundle={b} expanded={!!expandedBundles[b.key]} onToggle={() => toggleBundle(b.key)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Profile Influence ─────────────────────────────── */}
      {isLlmPending && (
        <div>
          <SectionHeader>profile influence</SectionHeader>
          <LlmPendingBar />
        </div>
      )}
      {tierEntries.length > 0 && profileInfluence && (
        <div>
          <SectionHeader>profile influence</SectionHeader>
          <div className="space-y-3">
            {/* Segmented bar — tier distribution */}
            {tierTotal > 0 && (
              <div className="flex h-5 rounded-sm overflow-hidden border sf-border-soft">
                {tierEntries.map((e) => (
                  <div
                    key={e.category}
                    className={`flex items-center justify-center text-[10px] font-bold ${
                      e.category === 'targeted_specification' ? 'bg-blue-600 text-white' :
                      e.category === 'targeted_sources' ? 'bg-violet-600 text-white' :
                      e.category === 'targeted_groups' ? 'bg-amber-500 text-white' :
                      'bg-emerald-600 text-white'
                    }`}
                    style={{ width: `${(e.count / tierTotal) * 100}%` }}
                    title={`${e.category.replace(/_/g, ' ')}: ${e.count}`}
                  >
                    {e.count}
                  </div>
                ))}
              </div>
            )}
            {/* Legend — always shows all tiers with allocated / total */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs sf-text-muted">
              {tierEntries.map((e) => {
                const total =
                  e.category === 'targeted_specification' ? 1 :
                  e.category === 'targeted_sources' ? (profileInfluence.total_sources ?? 0) :
                  e.category === 'targeted_groups' ? (profileInfluence.total_groups ?? 0) :
                  (profileInfluence.total_unresolved_keys ?? 0);
                return (
                  <span key={e.category} className="flex items-center gap-2">
                    <span className={`inline-block w-3 h-3 rounded-sm ${
                      e.category === 'targeted_specification' ? 'bg-blue-600' :
                      e.category === 'targeted_sources' ? 'bg-violet-600' :
                      e.category === 'targeted_groups' ? 'bg-amber-500' :
                      'bg-emerald-600'
                    }`} />
                    <span className="font-semibold">{e.category.replace(/targeted_/g, '').replace(/_/g, ' ')}</span>
                    <span className="font-mono font-bold sf-text-primary">{e.count}/{total}</span>
                  </span>
                );
              })}
            </div>
            {/* Stats row */}
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted pt-2 border-t sf-border-soft">
              {profileInfluence.budget != null && (
                <span>budget <strong className="sf-text-primary">{profileInfluence.allocated ?? 0}/{profileInfluence.budget}</strong></span>
              )}
              <span>groups now <strong className="sf-text-primary">{profileInfluence.groups_now}</strong></span>
              <span>groups next <strong className="sf-text-primary">{profileInfluence.groups_next}</strong></span>
              <span>groups hold <strong className="sf-text-primary">{profileInfluence.groups_hold}</strong></span>
              <span>unresolved keys <strong className="sf-text-primary">{profileInfluence.total_unresolved_keys}</strong></span>
              <span>confidence <strong className="sf-text-primary">{(profileInfluence.planner_confidence ?? 0).toFixed(2)}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* ── What Changed This Round ───────────────────────── */}
      {deltas.length > 0 && (
        <div>
          <SectionHeader>what changed this round</SectionHeader>
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 space-y-3">
            {/* Counter cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
              <div>
                <div className={`text-[22px] font-bold leading-none ${deltaCats.resolved.length > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-subtle'}`}>
                  {deltaCats.resolved.length > 0 ? `+${deltaCats.resolved.length}` : '0'}
                </div>
                <div className={`mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] ${deltaCats.resolved.length > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-subtle'}`}>resolved</div>
              </div>
              <div>
                <div className={`text-[22px] font-bold leading-none ${deltaCats.improved.length > 0 ? 'text-[var(--sf-token-accent)]' : 'sf-text-subtle'}`}>
                  {deltaCats.improved.length > 0 ? `+${deltaCats.improved.length}` : '0'}
                </div>
                <div className={`mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] ${deltaCats.improved.length > 0 ? 'text-[var(--sf-token-accent)]' : 'sf-text-subtle'}`}>improved</div>
              </div>
              <div>
                <div className="text-[22px] font-bold sf-text-subtle leading-none">{deltaCats.newFields.length}</div>
                <div className="mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] sf-text-subtle">new</div>
              </div>
              <div>
                <div className={`text-[22px] font-bold leading-none ${deltaCats.escalated.length > 0 ? 'text-[var(--sf-state-confirm-fg)]' : 'sf-text-subtle'}`}>
                  {deltaCats.escalated.length > 0 ? `+${deltaCats.escalated.length}` : '0'}
                </div>
                <div className={`mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] ${deltaCats.escalated.length > 0 ? 'text-[var(--sf-state-confirm-fg)]' : 'sf-text-subtle'}`}>escalated</div>
              </div>
              <div>
                <div className="text-[22px] font-bold sf-text-muted leading-none">{deltaCats.regressed.length}</div>
                <div className="mt-1 text-[10px] font-bold font-mono uppercase tracking-[0.06em] sf-text-muted">regressed</div>
              </div>
            </div>
            {/* Field chips */}
            <div className="flex flex-wrap gap-1.5 pt-3 border-t sf-border-soft">
              {deltaCats.resolved.map((f) => (
                <span key={f} className="sf-chip-success inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-semibold border sf-border-soft">
                  {'\u2713'} {f}
                </span>
              ))}
              {deltaCats.improved.map((f) => (
                <span key={f} className="sf-chip-info inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-semibold border sf-border-soft">
                  {'\u2191'} {f}
                </span>
              ))}
              {deltaCats.escalated.map((f) => (
                <span key={f} className="sf-chip-confirm inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-semibold border sf-border-soft">
                  {'\u26a0'} {f}
                </span>
              ))}
              {deltaCats.regressed.map((f) => (
                <span key={f} className="sf-chip-neutral inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-mono font-semibold border sf-border-soft">
                  {'\u2193'} {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Field History ──────────────────────────────────── */}
      {(historyFields.length > 0 || hasPreLlmData) && (
        <div>
          <CollapsibleSectionHeader isOpen={historyOpen} onToggle={toggleHistoryOpen} summary={historyFields.length > 0 ? <>{historyFields.length} tracked{stuckFieldCount > 0 && <span className="text-[var(--sf-state-error-fg)]"> &middot; {stuckFieldCount} stuck</span>}</> : <>awaiting search data</>}>field history</CollapsibleSectionHeader>

          {historyOpen && historyFields.length === 0 && (
            <div className="mt-3 px-4 py-3 rounded-sm sf-surface-elevated border sf-border-soft text-xs sf-text-muted italic">
              No search history yet &mdash; history populates as searches complete and fields accumulate evidence across rounds.
            </div>
          )}

          {historyOpen && historyFields.length > 0 && (
            <div className="mt-3 space-y-2">
              {/* Summary stat */}
              {stuckFieldCount > 0 && (
                <div className="px-4 py-2.5 rounded-sm border border-[var(--sf-state-error-border)] bg-[var(--sf-state-error-bg)] text-xs sf-text-muted italic">
                  <strong className="not-italic text-[var(--sf-state-error-fg)]">{stuckFieldCount} field{stuckFieldCount !== 1 ? 's' : ''}</strong> failed {ESCALATION_THRESHOLD}+ search rounds without finding a value — the planner will radically change strategy for these.
                </div>
              )}

              {/* History table */}
              <div className="overflow-x-auto overflow-y-auto max-h-[112rem] border sf-border-soft rounded-sm">
                <table className="min-w-full text-xs">
                  <thead className="sf-surface-elevated sticky top-0">
                    <tr>
                      {['field', 'state', 'queries', 'domains', 'hosts', 'evidence', 'no-value', 'urls'].map(h => (
                        <th key={h} className="py-2 px-3 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {historyFields.map((f: NeedSetField) => {
                      const h = f.history;
                      if (!h) return null;
                      const isStuck = h.no_value_attempts >= ESCALATION_THRESHOLD;
                      const isExpanded = expandedHistoryField === f.field_key;
                      const stB = stateBadge(f.state);
                      return (
                        <tr
                          key={f.field_key}
                          onClick={() => setExpandedHistoryField(isExpanded ? null : f.field_key)}
                          className={`border-b sf-border-soft cursor-pointer hover:sf-surface-elevated ${isStuck ? 'bg-[var(--sf-state-error-bg)]' : ''}`}
                        >
                          <td className="py-1.5 px-3 font-mono font-medium sf-text-primary">{f.field_key}</td>
                          <td className="py-1.5 px-3">
                            <span className="inline-flex items-center gap-1">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${stateDotCls(f.state)}`} />
                              <span className={`text-[10px] font-semibold uppercase ${stB.cls}`}>{stB.label}</span>
                            </span>
                          </td>
                          <td className="py-1.5 px-3 font-mono text-center">{h.query_count}</td>
                          <td className="py-1.5 px-3 font-mono text-center">{h.domains_tried?.length ?? 0}</td>
                          <td className="py-1.5 px-3">
                            <div className="flex flex-wrap gap-0.5">
                              {(h.host_classes_tried ?? []).map(hc => (
                                <span key={hc} className="px-1 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.04em] sf-bg-surface-soft-strong sf-text-subtle">{hc}</span>
                              ))}
                            </div>
                          </td>
                          <td className="py-1.5 px-3">
                            <div className="flex flex-wrap gap-0.5">
                              {(h.evidence_classes_tried ?? []).map(ec => (
                                <span key={ec} className={`px-1 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.04em] ${queryFamilyBadge(ec)}`}>{ec.replace(/_/g, ' ')}</span>
                              ))}
                            </div>
                          </td>
                          <td className={`py-1.5 px-3 font-mono font-bold text-center ${isStuck ? 'text-[var(--sf-state-error-fg)]' : 'sf-text-muted'}`}>
                            {h.no_value_attempts}
                          </td>
                          <td className="py-1.5 px-3 font-mono text-center sf-text-muted">{h.urls_examined_count}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Expanded detail for selected field */}
              {expandedHistoryField && (() => {
                const f = historyFields.find((ff: NeedSetField) => ff.field_key === expandedHistoryField);
                const h = f?.history;
                if (!h) return null;
                return (
                  <div className="sf-surface-elevated rounded-sm border sf-border-soft px-4 py-3 space-y-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-primary">
                      {expandedHistoryField} — search history detail
                    </div>
                    {(h.existing_queries?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">queries tried ({h.existing_queries?.length ?? 0})</div>
                        {(h.existing_queries ?? []).map((q, i) => (
                          <div key={i} className="pl-3 text-[11px] font-mono sf-text-muted leading-relaxed">&rarr; {q}</div>
                        ))}
                      </div>
                    )}
                    {(h.domains_tried?.length ?? 0) > 0 && (
                      <div>
                        <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">domains visited ({h.domains_tried?.length ?? 0})</div>
                        <div className="flex flex-wrap gap-1.5 pl-3">
                          {(h.domains_tried ?? []).map(d => (
                            <span key={d} className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono sf-bg-surface-soft-strong sf-text-muted">{d}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-mono sf-text-subtle pt-2 border-t sf-border-soft">
                      <span>dupes suppressed: <strong className="sf-text-primary">{h.duplicate_attempts_suppressed}</strong></span>
                      <span>refs found: <strong className="sf-text-primary">{h.refs_found ?? 0}</strong></span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Field Drilldown ───────────────────────────────── */}
      {isLlmPending && (
        <div>
          <SectionHeader>field drilldown</SectionHeader>
          <LlmPendingBar />
        </div>
      )}
      {plannerRows.length > 0 && (
        <div>
          <CollapsibleSectionHeader isOpen={drilldownOpen} onToggle={toggleDrilldownOpen} summary={<>{drilldownRows.length} fields</>}>field drilldown</CollapsibleSectionHeader>

          {drilldownOpen && (
            <div className="mt-3 space-y-2">
              {/* Filter buttons */}
              <div className="flex items-center gap-2">
                {([
                  ['unresolved', 'Unresolved'],
                  ['escalated', 'Escalated'],
                  ['all', 'All fields'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setDrilldownFilter(key)}
                    className={`px-2.5 py-1 rounded-sm text-[10px] font-bold font-mono tracking-[0.04em] border cursor-pointer transition-colors ${
                      drilldownFilter === key
                        ? 'text-[var(--sf-token-text-inverse)] bg-[var(--sf-token-text-primary)] border-transparent'
                        : 'sf-text-muted sf-surface-elevated sf-border-soft hover:sf-text-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="text-[10px] font-mono sf-text-subtle ml-2">
                  showing {filteredDrilldownRows.length} of {drilldownRows.length}
                </span>
              </div>

              {/* Text filter */}
              <input
                type="text"
                placeholder="filter by field name..."
                value={fieldFilter}
                onChange={(e) => setFieldFilter(e.target.value)}
                className="w-full px-2 py-1 rounded-sm border sf-border-soft sf-surface-panel sf-text-primary text-xs"
              />

              {/* Table */}
              <div className="overflow-x-auto overflow-y-auto max-h-[84rem] border sf-border-soft rounded-sm">
                <table className="min-w-full text-xs">
                  <thead className="sf-surface-elevated sticky top-0">
                    <tr>
                      {[
                        { key: 'field_key' as const, label: 'field' },
                        { key: 'bundle_id' as const, label: 'bundle' },
                        { key: 'required_level' as const, label: 'bucket' },
                        { key: 'state' as const, label: 'state' },
                      ].map(col => (
                        <th key={col.key} className="py-2 px-3 text-left border-b sf-border-soft">
                          <button onClick={() => handlePlannerSort(col.key)} className="hover:underline text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">
                            {col.label}{sortArrow(col.key)}
                          </button>
                        </th>
                      ))}
                      <th className="py-2 px-3 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">next action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrilldownRows.map((row) => {
                      const bB = bucketBadge(row.priority_bucket);
                      const stB = stateBadge(row.state);
                      return (
                        <tr key={`${row.field_key}-${row.bundle_id}`} className={`sf-table-row border-b sf-border-soft ${row.state === 'conflict' ? 'bg-[var(--sf-state-error-bg)]' : ''}`}>
                          <td className={`py-1.5 px-3 font-mono font-medium ${row.state === 'satisfied' ? 'sf-text-subtle' : 'sf-text-primary'}`}>{row.field_key}</td>
                          <td className="py-1.5 px-3 font-mono sf-text-muted">{row.bundle_id || '\u2014'}</td>
                          <td className="py-1.5 px-3">
                            <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase ${bB.cls}`}>{bB.label}</span>
                          </td>
                          <td className="py-1.5 px-3">
                            <span className="inline-flex items-center gap-1">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${stateDotCls(row.state)}`} />
                              <span className={`text-[10px] font-semibold uppercase ${stB.cls}`}>{stB.label}</span>
                            </span>
                          </td>
                          <td className="py-1.5 px-3 font-mono sf-text-muted">{nextAction(row.state)}</td>
                        </tr>
                      );
                    })}
                    {filteredDrilldownRows.length === 0 && (
                      <tr><td className="py-3 px-3 sf-text-muted text-center" colSpan={5}>no matching fields</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Debug ─────────────────────────────────────────── */}
      <DebugJsonDetails label="raw needset json" data={data} />
    </div>
  );
}
