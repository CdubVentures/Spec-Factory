import { useMemo } from 'react';
import { usePersistedScroll } from '../../../../hooks/usePersistedScroll.ts';
import { usePersistedNullableTab } from '../../../../stores/tabStore.ts';
import type { PrefetchSearchProfileData, PrefetchSearchProfileQueryRow, PrefetchLiveSettings } from '../../types.ts';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import {
  shouldShowSearchProfileGateBadges,
  normalizeIdentityAliasEntries,
} from '../../selectors/prefetchSearchProfileDisplayHelpers.js';
import {
  sourceHostFromRow,
  getQueryGateFlags,
  querySourceLabel,
  querySourceChipClass,
  buildGateSummary,
  normalizeFieldRuleGateCounts,
} from '../../selectors/prefetchSearchProfileGateHelpers.js';
import { resolveGateBadge } from '../../badgeRegistries.ts';
import { providerDisplayLabel } from '../../selectors/searchResultsHelpers.js';
import {
  classifyQueryTier,
  tierLabel,
  tierChipClass,
  groupByTier,
  buildTierBudgetSummary,
  enrichmentStrategyLabel,
} from '../../selectors/searchProfileTierHelpers.js';
import { formatTooltip, TooltipBadge } from '../../components/PrefetchTooltip.tsx';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import { PrefetchEmptyState } from './PrefetchEmptyState.tsx';
import type { RuntimeIdxBadge } from '../../types.ts';

interface PrefetchSearchProfilePanelProps {
  data: PrefetchSearchProfileData;
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
}

/* ── Theme-aligned helpers ───────────────────────────────────────────── */

function toChipLabel(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const alias = String(record.alias || '').trim();
  if (alias) {
    const source = String(record.source || '').trim();
    const weight = Number(record.weight);
    const weightLabel = Number.isFinite(weight) ? `w:${weight}` : '';
    const details = [source, weightLabel].filter(Boolean);
    return details.length > 0 ? `${alias} (${details.join(', ')})` : alias;
  }
  return String(value);
}

function formatProviderList(providers: string[] | undefined): string {
  if (!Array.isArray(providers) || providers.length === 0) return '';
  return providers.map((p) => providerDisplayLabel(p)).filter(Boolean).join(', ');
}

function gateZeroRatioReason(gateKey: string): string {
  if (gateKey === 'search_hints.query_terms') return '0/Y means no query terms are configured on enabled fields.';
  if (gateKey === 'search_hints.domain_hints') return '0/Y means domain hints exist but are not usable host patterns.';
  if (gateKey === 'search_hints.preferred_content_types') return '0/Y means no preferred content types are configured on enabled fields.';
  return '0/Y means no effective values are available for this gate on enabled fields.';
}

const TH_CLS = 'py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle';
const TD_CLS = 'py-1.5 px-4';
const ROW_CLS = 'border-b sf-border-soft hover:sf-surface-elevated cursor-pointer';

/* ── Query Detail Drawer (tier-aware) ──────────────────────────────── */

function QueryDetailDrawer({
  row,
  onClose,
  hintSourceCounts,
  showGateBadges,
}: {
  row: PrefetchSearchProfileQueryRow;
  onClose: () => void;
  hintSourceCounts: Record<string, number> | undefined;
  showGateBadges: boolean;
}) {
  const sourceHost = sourceHostFromRow(row);
  const queryGateFlags = getQueryGateFlags(row, hintSourceCounts);
  const source = querySourceLabel(row);
  const tier = classifyQueryTier(row);
  const enrichment = enrichmentStrategyLabel(row);

  return (
    <DrawerShell title="Query Detail" subtitle={row.query} maxHeight="none" className="max-h-none" scrollContent={false} onClose={onClose}>
      <DrawerSection title="Query">
        <div className="font-mono sf-text-caption sf-text-primary sf-pre-block rounded p-2">{row.query}</div>
      </DrawerSection>

      <DrawerSection title="Tier">
        <div className="flex items-center gap-2">
          <Chip label={tierLabel(tier)} className={tierChipClass(tier)} />
          {row.group_key && <span className="sf-text-caption sf-text-muted font-mono">{row.group_key}</span>}
          {row.normalized_key && <Chip label={row.normalized_key} className="sf-chip-info" />}
          {enrichment && <span className="sf-text-caption sf-text-muted italic">{enrichment}</span>}
        </div>
      </DrawerSection>

      {tier === 'key' && (
        <>
          {(row.all_aliases?.length ?? 0) > 0 && (
            <DrawerSection title="Aliases Available">
              <div className="flex flex-wrap gap-1">
                {row.all_aliases?.map((a) => <Chip key={a} label={a} className="sf-chip-accent" />)}
              </div>
            </DrawerSection>
          )}
          {((row.domain_hints?.length ?? 0) > 0 || (row.domains_tried_for_key?.length ?? 0) > 0) && (
            <DrawerSection title="Domain Coverage">
              <div className="space-y-1 text-xs sf-text-muted">
                {(row.domain_hints?.length ?? 0) > 0 && (
                  <div>Available: {row.domain_hints?.map((d) => <Chip key={d} label={d} className="sf-chip-neutral" />)}</div>
                )}
                {(row.domains_tried_for_key?.length ?? 0) > 0 && (
                  <div>Tried: {row.domains_tried_for_key?.map((d) => <Chip key={d} label={d} className="sf-chip-danger" />)}</div>
                )}
              </div>
            </DrawerSection>
          )}
          {((row.preferred_content_types?.length ?? 0) > 0 || (row.content_types_tried_for_key?.length ?? 0) > 0) && (
            <DrawerSection title="Content Type Coverage">
              <div className="space-y-1 text-xs sf-text-muted">
                {(row.preferred_content_types?.length ?? 0) > 0 && (
                  <div>Available: {row.preferred_content_types?.map((c) => <Chip key={c} label={c} className="sf-chip-neutral" />)}</div>
                )}
                {(row.content_types_tried_for_key?.length ?? 0) > 0 && (
                  <div>Tried: {row.content_types_tried_for_key?.map((c) => <Chip key={c} label={c} className="sf-chip-danger" />)}</div>
                )}
              </div>
            </DrawerSection>
          )}
        </>
      )}

      {showGateBadges && (
        <DrawerSection title="Applied Gates">
          <div className="flex flex-wrap gap-1.5">
            <Chip label="Query Terms" className={resolveGateBadge(queryGateFlags.queryTerms)} />
            <Chip label="Domain Hint" className={resolveGateBadge(queryGateFlags.domainHints)} />
            <Chip label="Content Type" className={resolveGateBadge(queryGateFlags.contentTypes)} />
            <Chip label="Source Host" className={resolveGateBadge(Boolean(sourceHost))} />
          </div>
        </DrawerSection>
      )}
      <DrawerSection title="Applied Source">
        {showGateBadges
          ? <Chip label={source} className={querySourceChipClass(source)} />
          : <div className="sf-text-caption font-mono sf-text-muted">{source}</div>
        }
      </DrawerSection>
      {(row.target_fields?.length ?? 0) > 0 && (
        <DrawerSection title="Target Fields">
          <div className="flex flex-wrap gap-1">
            {row.target_fields?.map((f) => <Chip key={f} label={f} className="sf-chip-success" />)}
          </div>
        </DrawerSection>
      )}
      <DrawerSection title="Results">
        <div className="sf-text-caption sf-text-muted">
          {row.result_count !== undefined ? `${row.result_count} results` : 'No result data'}
          {row.providers?.length ? ` from ${formatProviderList(row.providers)}` : ''}
        </div>
      </DrawerSection>
    </DrawerShell>
  );
}

/* ── Tier Section Table ────────────────────────────────────────────── */

function TierQueryTable({
  rows,
  tier,
  selectedQueryText,
  onSelect,
}: {
  rows: PrefetchSearchProfileQueryRow[];
  tier: string;
  selectedQueryText: string | null;
  onSelect: (query: string | null) => void;
}) {
  if (rows.length === 0) return null;

  const columns = tier === 'seed'
    ? ['query', 'tier', 'domain hint', 'results']
    : tier === 'group'
      ? ['query', 'tier', 'group', 'target fields', 'results']
      : tier === 'key'
        ? ['query', 'tier', 'key', 'repeat', 'enrichment', 'results']
        : ['query', 'tier', 'results'];

  return (
    <div className="overflow-x-auto border sf-border-soft rounded-sm">
      <table className="min-w-full text-xs">
        <thead className="sf-surface-elevated sticky top-0">
          <tr>
            {columns.map((h) => <th key={h} className={TH_CLS}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              className={ROW_CLS}
              onClick={() => onSelect(selectedQueryText === r.query ? null : r.query)}
            >
              <td className={`${TD_CLS} font-mono sf-text-primary max-w-[20rem] truncate`}>{r.query}</td>
              <td className={TD_CLS}><Chip label={tierLabel(tier)} className={tierChipClass(tier)} /></td>
              {tier === 'seed' && (
                <td className={`${TD_CLS} sf-text-muted font-mono`}>{r.domain_hint || r.source_host || '-'}</td>
              )}
              {tier === 'group' && (
                <>
                  <td className={`${TD_CLS} sf-text-muted font-mono`}>{r.group_key || '-'}</td>
                  <td className={`${TD_CLS} sf-text-muted`}>{r.target_fields?.join(', ') || '-'}</td>
                </>
              )}
              {tier === 'key' && (
                <>
                  <td className={`${TD_CLS} sf-text-muted font-mono`}>{r.normalized_key || '-'}</td>
                  <td className={`${TD_CLS} text-right font-mono`}>{r.repeat_count ?? 0}</td>
                  <td className={`${TD_CLS} sf-text-muted italic`}>{enrichmentStrategyLabel(r) || '-'}</td>
                </>
              )}
              <td className={`${TD_CLS} text-right font-mono`}>{r.result_count ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Budget Bar ────────────────────────────────────────────────────── */

function TierBudgetBar({ budget }: { budget: ReturnType<typeof buildTierBudgetSummary> }) {
  const segments: Array<{ key: string; label: string; count: number; pct: number; cls: string }> = [
    { key: 'seed', label: 'T1 Seeds', count: budget.seed.count, pct: budget.seed.pct, cls: 'sf-chip-accent' },
    { key: 'group', label: 'T2 Groups', count: budget.group.count, pct: budget.group.pct, cls: 'sf-chip-warning' },
    { key: 'key', label: 'T3 Keys', count: budget.key.count, pct: budget.key.pct, cls: 'sf-chip-info' },
  ];
  const used = budget.total;
  const unusedPct = budget.cap > 0 ? Math.max(0, ((budget.cap - used) / budget.cap) * 100) : 0;

  return (
    <div>
      <SectionHeader>budget allocation &middot; {used}/{budget.cap} slots used</SectionHeader>
      <div className="flex h-3 w-full rounded-sm overflow-hidden border sf-border-soft">
        {segments.filter((s) => s.count > 0).map((s) => (
          <div key={s.key} className={`${s.cls} h-full`} style={{ width: `${(s.count / Math.max(budget.cap, 1)) * 100}%` }} />
        ))}
        {unusedPct > 0 && <div className="sf-surface-elevated h-full" style={{ width: `${unusedPct}%` }} />}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5">
        {segments.filter((s) => s.count > 0).map((s) => (
          <span key={s.key} className="text-[10px] font-semibold uppercase tracking-[0.06em] sf-text-muted">
            {s.label} <strong className="sf-text-primary">{s.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Main Panel ─────────────────────────────────────────────────────── */

export function PrefetchSearchProfilePanel({ data, persistScope, liveSettings, idxRuntime }: PrefetchSearchProfilePanelProps) {
  const scrollRef = usePersistedScroll(`scroll:searchProfile:${persistScope}`);
  const showGateBadges = shouldShowSearchProfileGateBadges();
  // WHY: Show the deterministic Search Profile output, not LLM-enhanced rows from downstream phases.
  const displayRows = data.deterministic_query_rows ?? data.query_rows;
  const queryValues = useMemo(() => displayRows.map((row) => row.query).filter(Boolean), [displayRows]);
  const [selectedQueryText, setSelectedQueryText] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:searchProfile:selectedQuery:${persistScope}`,
    null,
    { validValues: queryValues },
  );
  const selectedQuery = useMemo(
    () => (selectedQueryText ? displayRows.find((row) => row.query === selectedQueryText) ?? null : null),
    [displayRows, selectedQueryText],
  );
  const hintSourceCounts = data.hint_source_counts || {};
  const liveProvider = liveSettings?.searchEngines || '';
  const allTargetFields = [...new Set(displayRows.flatMap((r) => r.target_fields || []))];
  const uncoveredFields = allTargetFields.length > 0
    ? allTargetFields.filter((f) => !displayRows.some((r) => r.target_fields?.includes(f) && (r.result_count ?? 0) > 0))
    : [];
  const identityAliasEntries = useMemo(
    () => normalizeIdentityAliasEntries(data.identity_aliases),
    [data.identity_aliases],
  );
  const gateSummary = useMemo(
    () => buildGateSummary(displayRows, hintSourceCounts),
    [displayRows, hintSourceCounts],
  );
  const fieldRuleGateCounts = useMemo(
    () => normalizeFieldRuleGateCounts(data.field_rule_gate_counts),
    [data.field_rule_gate_counts],
  );
  const providerLabel = providerDisplayLabel(liveProvider || data.provider) || toChipLabel(liveProvider || data.provider);
  const totalResults = displayRows.reduce((s, r) => s + (r.result_count ?? 0), 0);
  const topLevelFieldRulesOn = gateSummary.fieldRulesOn || gateSummary.fieldRuleKeyCounts.length > 0;

  const guardTotal = typeof data.query_guard?.total === 'number' ? data.query_guard.total : null;
  const guardGuarded = typeof data.query_guard?.guarded === 'number' ? data.query_guard.guarded : null;
  const guardAccepted = typeof data.query_guard?.accepted_query_count === 'number' ? data.query_guard.accepted_query_count : null;
  const guardRejected = typeof data.query_guard?.rejected_query_count === 'number' ? data.query_guard.rejected_query_count : null;

  const tiers = useMemo(() => groupByTier(displayRows), [displayRows]);
  const budget = useMemo(() => buildTierBudgetSummary(displayRows, 24), [displayRows]);

  /* ── Empty state ── */
  if (displayRows.length === 0 && !data.brand_resolution) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Search Profile</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <PrefetchEmptyState
          icon="&#128270;"
          heading="Waiting for search profile"
          description="Profile will appear after query planning completes. Queries are assembled deterministically from field rules, search templates, and identity aliases."
        />
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ══════════════════════════════════════════════════════════════════
          HERO BAND
          ══════════════════════════════════════════════════════════════════ */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Search Profile</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Discovery Pipeline</span>
        </>}
        trailing={<>
          {providerLabel && <Chip label={providerLabel} className="sf-chip-accent" />}
          <Chip label="Tier-Aware" className="sf-chip-info" />
          <Tip text="The Search Profile assembles queries from NeedSet tier analysis. Tier 1: broad seed searches. Tier 2: group-level searches for productive field clusters. Tier 3: individual key searches with progressive enrichment." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid>
          <HeroStat value={data.selected_query_count ?? data.query_count} label="queries" />
          <HeroStat value={`T1:${budget.seed.count} T2:${budget.group.count} T3:${budget.key.count}`} label="tier split" />
          <HeroStat value={data.selected_count ?? data.discovered_count ?? totalResults} label="urls selected" colorClass={(data.selected_count ?? data.discovered_count ?? 0) > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={guardRejected ?? guardGuarded ?? 0} label="guard rejected" colorClass={(guardRejected ?? 0) > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'} />
        </HeroStatGrid>

        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          Tier-aware planner allocated <strong className="sf-text-primary not-italic">{budget.total}</strong> queries
          {budget.seed.count > 0 && <> &mdash; <strong className="sf-text-primary not-italic">{budget.seed.count}</strong> seeds</>}
          {budget.group.count > 0 && <>, <strong className="sf-text-primary not-italic">{budget.group.count}</strong> group searches</>}
          {budget.key.count > 0 && <>, <strong className="sf-text-primary not-italic">{budget.key.count}</strong> key searches</>}
          {' '}from a cap of <strong className="sf-text-primary not-italic">{budget.cap}</strong>
          {(data.selected_count ?? data.discovered_count ?? 0) > 0 && (
            <> &mdash; selected <strong className="sf-text-primary not-italic">{data.selected_count ?? data.discovered_count}</strong> URLs for extraction</>
          )}
          .
        </div>
      </HeroBand>

      {/* ══════════════════════════════════════════════════════════════════
          BUDGET BAR
          ══════════════════════════════════════════════════════════════════ */}
      <TierBudgetBar budget={budget} />

      {/* ══════════════════════════════════════════════════════════════════
          TIER 1 — SEEDS
          ══════════════════════════════════════════════════════════════════ */}
      {tiers.seed.length > 0 && (
        <div>
          <SectionHeader>tier 1 &mdash; seeds &middot; {tiers.seed.length} queries</SectionHeader>
          <TierQueryTable rows={tiers.seed} tier="seed" selectedQueryText={selectedQueryText} onSelect={setSelectedQueryText} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TIER 2 — GROUPS
          ══════════════════════════════════════════════════════════════════ */}
      {tiers.group.length > 0 && (
        <div>
          <SectionHeader>tier 2 &mdash; groups &middot; {tiers.group.length} queries</SectionHeader>
          <TierQueryTable rows={tiers.group} tier="group" selectedQueryText={selectedQueryText} onSelect={setSelectedQueryText} />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TIER 3 — KEYS
          ══════════════════════════════════════════════════════════════════ */}
      {tiers.key.length > 0 && (
        <div>
          <SectionHeader>tier 3 &mdash; keys &middot; {tiers.key.length} queries</SectionHeader>
          <TierQueryTable rows={tiers.key} tier="key" selectedQueryText={selectedQueryText} onSelect={setSelectedQueryText} />
        </div>
      )}

      {selectedQuery && (
        <QueryDetailDrawer
          row={selectedQuery}
          onClose={() => setSelectedQueryText(null)}
          hintSourceCounts={hintSourceCounts}
          showGateBadges={showGateBadges}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DISCOVERY SCORECARD
          ══════════════════════════════════════════════════════════════════ */}
      {data.serp_explorer && (
        <div>
          <SectionHeader>discovery scorecard</SectionHeader>
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {[
                { label: 'serp results', value: data.serp_explorer.dedupe_input, color: 'sf-text-muted' },
                { label: 'unique urls', value: data.serp_explorer.dedupe_output, color: 'sf-text-primary' },
                { label: 'hard dropped', value: data.serp_explorer.hard_drop_count, color: 'text-[var(--sf-state-error-fg)]' },
                { label: 'sent to selector', value: data.serp_explorer.candidates_sent ?? data.serp_explorer.urls_triaged, color: 'text-[var(--sf-token-accent)]' },
                { label: 'selected', value: data.serp_explorer.urls_selected, color: 'text-[var(--sf-state-success-fg)]' },
                { label: 'not selected', value: data.serp_explorer.soft_exclude_count, color: 'sf-text-muted' },
              ].map((s) => (
                <div key={s.label}>
                  <div className={`text-2xl font-bold leading-none tracking-tight ${s.color}`}>{s.value}</div>
                  <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.05em] sf-text-muted">{s.label}</div>
                </div>
              ))}
            </div>
            {data.serp_explorer.llm_triage_applied && (
              <div className="mt-3 pt-3 border-t sf-border-soft">
                <Chip label="LLM Triage Applied" className="sf-chip-warning" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          GATE BADGES
          ══════════════════════════════════════════════════════════════════ */}
      {showGateBadges && (
        <div className="flex items-center gap-2 flex-wrap">
          <TooltipBadge
            className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.04em] ${resolveGateBadge(topLevelFieldRulesOn)} border-[1.5px] border-current`}
            tooltip={formatTooltip({
              what: topLevelFieldRulesOn ? 'At least one indexed field_rules.* key is active.' : 'No indexed field_rules.* keys are active.',
              effect: topLevelFieldRulesOn ? 'Field-rules guided query behavior is active.' : 'Field Rules badge stays OFF/gray.',
              setBy: 'Driven by indexed field-rules keys and row-level field-rules hint sources.',
            })}
          >
            Field Rules
          </TooltipBadge>
          {fieldRuleGateCounts.map((gate) => {
            const displayTotal = Math.max(gate.totalValueCount, gate.effectiveValueCount);
            const displayValue = gate.status === 'off' ? 'OFF' : `${gate.effectiveValueCount}/${displayTotal}`;
            const zeroReason = gate.effectiveValueCount === 0 ? gateZeroRatioReason(gate.key) : '';
            const tooltip = gate.status === 'off'
              ? formatTooltip({ what: `${gate.label} is disabled.`, effect: 'No queries from this gate key.', setBy: 'Enable the corresponding IDX gate.' })
              : formatTooltip({
                what: `${gate.label}: ${gate.effectiveValueCount}/${displayTotal} values.`,
                effect: gate.effectiveValueCount > 0 ? 'Values available for query planning.' : zeroReason,
                setBy: 'Populate search_hints values in Field Rules.',
              });
            return (
              <TooltipBadge key={gate.key} className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.04em] ${resolveGateBadge(gate.status === 'active')} border-[1.5px] border-current`} tooltip={tooltip}>
                {gate.label}: {displayValue}
              </TooltipBadge>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          ALIASES & GUARD TERMS
          ══════════════════════════════════════════════════════════════════ */}
      {identityAliasEntries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">aliases:</span>
          {identityAliasEntries.map((entry) => <Chip key={entry.key} label={entry.label} className="sf-chip-accent" />)}
        </div>
      )}
      {data.variant_guard_terms.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">guard terms:</span>
          {data.variant_guard_terms.map((t, i) => {
            const label = toChipLabel(t);
            return label ? <Chip key={`guard:${label}:${i}`} label={label} className="sf-chip-danger" /> : null;
          })}
        </div>
      )}

      {uncoveredFields.length > 0 && (
        <div className="px-4 py-3 rounded-sm border border-[var(--sf-state-warning-border)] bg-[var(--sf-state-warning-bg)]">
          <span className="text-xs font-bold text-[var(--sf-state-warning-fg)]">Uncovered fields: </span>
          {uncoveredFields.map((f) => <Chip key={f} label={f} className="sf-chip-warning" />)}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DEBUG
          ══════════════════════════════════════════════════════════════════ */}
      <DebugJsonDetails label="raw search profile json" data={data} />
    </div>
  );
}
