import { useMemo } from 'react';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import type { PrefetchNeedSetData, PrefetchSearchPlanBundle, PrefetchLlmCall, NeedSetField } from '../../types.ts';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { PrefetchEmptyState } from './PrefetchEmptyState.tsx';
import type { RuntimeIdxBadge } from '../../types.ts';
import { formatNumber } from '../../../indexing/helpers.tsx';
import { resolveBlockerBadge } from '../../badgeRegistries.ts';
import { usePersistedTab, usePersistedNullableTab, usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import { derivePlannerRows, groupBundlesByPhase, categorizeDeltas } from './needSetHelpers.ts';
import type { PlannerSortKey } from './needSetHelpers.ts';
import { NeedSetBundleCard } from './NeedSetBundleCard.tsx';
import { NeedSetFieldDrilldown } from './NeedSetFieldDrilldown.tsx';
import type { DrilldownRow } from './NeedSetFieldDrilldown.tsx';
import { NeedSetFieldHistory } from './NeedSetFieldHistory.tsx';
import { NeedSetDeltasSummary } from './NeedSetDeltasSummary.tsx';
import { NeedSetProfileInfluence } from './NeedSetProfileInfluence.tsx';

/* ── Props ──────────────────────────────────────────────────────────── */

interface PrefetchNeedSetPanelProps {
  data: PrefetchNeedSetData;
  persistScope: string;
  idxRuntime?: RuntimeIdxBadge[];
  needsetPlannerCalls?: PrefetchLlmCall[];
}

/* ── Constants ─────────────────────────────────────────────────────── */

const PLANNER_SORT_KEYS = ['field_key', 'required_level', 'state', 'bundle_id'] as const;
const SORT_DIRS = ['asc', 'desc'] as const;
const DRILLDOWN_FILTERS = ['unresolved', 'escalated', 'all'] as const;
const ESCALATION_THRESHOLD = 3;

/* ── Main Panel ─────────────────────────────────────────────────────── */

export function PrefetchNeedSetPanel({ data, persistScope, idxRuntime }: PrefetchNeedSetPanelProps) {
  const scrollRef = usePersistedScroll(`scroll:needset:${persistScope}`);
  const [plannerSortKey, setPlannerSortKey] = usePersistedTab<PlannerSortKey>(`runtimeOps:needset:sortKey:${persistScope}`, 'required_level', { validValues: PLANNER_SORT_KEYS });
  const [plannerSortDir, setPlannerSortDir] = usePersistedTab<'asc' | 'desc'>(`runtimeOps:needset:sortDir:${persistScope}`, 'asc', { validValues: SORT_DIRS });
  const [fieldFilter, setFieldFilter] = usePersistedTab<string>(`runtimeOps:needset:fieldFilter:${persistScope}`, '');
  const [expandedBundles, toggleBundle] = usePersistedExpandMap(`runtimeOps:needset:expandedBundles:${persistScope}`);
  const [drilldownFilter, setDrilldownFilter] = usePersistedTab<'unresolved' | 'escalated' | 'all'>(`runtimeOps:needset:drilldownFilter:${persistScope}`, 'unresolved', { validValues: DRILLDOWN_FILTERS });
  const [drilldownOpen, toggleDrilldownOpen] = usePersistedToggle(`runtimeOps:needset:drilldownOpen:${persistScope}`, true);
  const [historyOpen, toggleHistoryOpen] = usePersistedToggle(`runtimeOps:needset:historyOpen:${persistScope}`, false);
  const [expandedHistoryField, setExpandedHistoryField] = usePersistedNullableTab(`runtimeOps:needset:expandedHistory:${persistScope}`, null);

  const summary = data.summary;
  const blockers = data.blockers;
  /* WHY: backward-compat bundles from NeedSet use different keys (bundle_id,
     priority_bucket, states) vs Search Plan (key, priority, phase, queries).
     Normalize so the panel renders either shape. */
  const bundles = useMemo(() => {
    const raw = (data.bundles ?? []) as Array<PrefetchSearchPlanBundle & { bundle_id?: string; priority_bucket?: string }>;
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
  // NeedSet/Context. LLM-dependent sections (bundles, profile, drilldown) need Search Plan.
  const hasPreLlmData = summary !== undefined;
  const hasLlmData = bundles.length > 0;
  const isLlmPending = hasPreLlmData && !hasLlmData;

  // WHY: Builder always sets rows=[] (not undefined), so ?? never triggers.
  // Use length check to fall back to deriving rows from bundles.
  const plannerRows = useMemo(
    () => (data.rows && data.rows.length > 0) ? data.rows : derivePlannerRows(bundles),
    [data.rows, bundles],
  );

  const drilldownRows = useMemo<DrilldownRow[]>(() => {
    const rows: DrilldownRow[] = [];
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

  const handlePlannerSort = (key: PlannerSortKey) => {
    if (key === plannerSortKey) {
      setPlannerSortDir(plannerSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setPlannerSortKey(key);
      setPlannerSortDir('asc');
    }
  };

  const grouped = useMemo(() => groupBundlesByPhase(bundles), [bundles]);
  const deltaCats = useMemo(() => categorizeDeltas(deltas), [deltas]);
  const activeBundles = grouped.now.length + grouped.next.length;

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
        <PrefetchEmptyState
          icon="&#128203;"
          heading="Waiting for NeedSet computation"
          description="The NeedSet will appear after the first computation round. It groups unresolved fields into search bundles by priority, content type, and source affinity to shape discovery."
        />
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* Hero Band */}
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

        {summary && (
          <HeroStatGrid>
            <HeroStat value={formatNumber(summary.core_unresolved)} label="core unresolved" colorClass="text-[var(--sf-state-error-fg)]" />
            <HeroStat value={formatNumber(summary.conflicts)} label="conflict" colorClass={summary.conflicts > 0 ? 'text-[var(--sf-state-error-fg)]' : 'text-[var(--sf-state-success-fg)]'} />
            <HeroStat value={`${activeBundles}/${bundles.length}`} label="bundles active / tracked" />
            <HeroStat value={profileInfluence?.total_unresolved_keys ?? 0} label="unresolved keys" />
          </HeroStatGrid>
        )}

        {summary && profileInfluence && (
          <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
            {profileInfluence.budget != null && (
              <strong className="sf-text-primary not-italic">Budget: {profileInfluence.budget} queries &mdash; </strong>
            )}
            <strong className="sf-text-primary not-italic">{profileInfluence.targeted_brand}/1 brand, </strong>
            <strong className="sf-text-primary not-italic">{profileInfluence.targeted_specification}/1 spec seed, </strong>
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

      {/* Why We're Stuck */}
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
                className={`px-4 py-3.5 rounded-sm border sf-border-soft ${resolveBlockerBadge(key)} ${(count ?? 0) === 0 ? 'opacity-60' : ''} transition-opacity`}
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

      {/* Search Focus Bundles */}
      {isLlmPending && (
        <div>
          <SectionHeader>search focus bundles</SectionHeader>
          <div className="flex items-center gap-2.5 py-3 px-4 rounded-sm sf-surface-elevated border sf-border-soft">
            <div className="w-20 h-1 rounded-sm overflow-hidden sf-bg-surface-soft-strong">
              <div className="h-full w-full rounded-sm bg-[var(--sf-token-accent)] animate-pulse" />
            </div>
            <span className="text-[10px] font-mono font-semibold tracking-[0.02em] sf-text-muted">
              search planner LLM in progress&hellip;
            </span>
          </div>
        </div>
      )}
      {bundles.length > 0 && (
        <div>
          <SectionHeader>search focus bundles</SectionHeader>
          {grouped.now.length > 0 && (
            <div className="flex flex-col gap-2">
              {grouped.now.map((b) => (
                <NeedSetBundleCard key={b.key} bundle={b} expanded={!!expandedBundles[b.key]} onToggle={() => toggleBundle(b.key)} />
              ))}
            </div>
          )}
          {grouped.next.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {grouped.next.map((b) => (
                <NeedSetBundleCard key={b.key} bundle={b} expanded={!!expandedBundles[b.key]} onToggle={() => toggleBundle(b.key)} />
              ))}
            </div>
          )}
          {grouped.hold.length > 0 && (
            <>
              <div className="mt-5 mb-2 text-[10px] font-bold uppercase tracking-[0.06em] sf-text-subtle">
                observed &middot; not queued this round
              </div>
              <div className="flex flex-col gap-2">
                {grouped.hold.map((b) => (
                  <NeedSetBundleCard key={b.key} bundle={b} expanded={!!expandedBundles[b.key]} onToggle={() => toggleBundle(b.key)} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Profile Influence */}
      {profileInfluence && (
        <NeedSetProfileInfluence profileInfluence={profileInfluence} isLlmPending={isLlmPending} />
      )}

      {/* What Changed This Round */}
      {deltas.length > 0 && <NeedSetDeltasSummary deltaCats={deltaCats} />}

      {/* Field History */}
      <NeedSetFieldHistory
        historyFields={historyFields}
        stuckFieldCount={stuckFieldCount}
        escalationThreshold={ESCALATION_THRESHOLD}
        hasPreLlmData={hasPreLlmData}
        historyOpen={historyOpen}
        toggleHistoryOpen={toggleHistoryOpen}
        expandedHistoryField={expandedHistoryField}
        setExpandedHistoryField={setExpandedHistoryField}
      />

      {/* Field Drilldown */}
      <NeedSetFieldDrilldown
        drilldownRows={drilldownRows}
        isLlmPending={isLlmPending && plannerRows.length === 0}
        drilldownOpen={drilldownOpen}
        toggleDrilldownOpen={toggleDrilldownOpen}
        drilldownFilter={drilldownFilter}
        setDrilldownFilter={setDrilldownFilter}
        fieldFilter={fieldFilter}
        setFieldFilter={setFieldFilter}
        plannerSortKey={plannerSortKey}
        plannerSortDir={plannerSortDir}
        onSort={handlePlannerSort}
      />

      {/* Debug */}
      <DebugJsonDetails label="raw needset json" data={data} />
    </div>
  );
}
