import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../../stores/tabStore';
import type { PrefetchSearchProfileData, PrefetchSearchProfileQueryRow, PrefetchLiveSettings } from '../../types';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader';
import { Chip } from '../../../../shared/ui/feedback/Chip';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand';
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
  resolveFieldRuleHintCountForRowGate,
} from '../../selectors/prefetchSearchProfileGateHelpers.js';
import { providerDisplayLabel } from '../../selectors/searchResultsHelpers.js';
import {
  classifyQueryTier,
  tierLabel,
  tierChipClass,
  groupByTier,
  buildTierBudgetSummary,
  enrichmentStrategyLabel,
} from '../../selectors/searchProfileTierHelpers.js';
import { formatTooltip, TooltipBadge } from '../../components/PrefetchTooltip';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat';
import type { RuntimeIdxBadge } from '../../types';

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

function gateBadgeClass(active: boolean): string {
  return active ? 'sf-chip-success' : 'sf-chip-neutral';
}

function gateBadgePillClass(active: boolean): string {
  return `px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.04em] ${gateBadgeClass(active)} border-[1.5px] border-current`;
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
            <Chip label="Query Terms" className={gateBadgeClass(queryGateFlags.queryTerms)} />
            <Chip label="Domain Hint" className={gateBadgeClass(queryGateFlags.domainHints)} />
            <Chip label="Content Type" className={gateBadgeClass(queryGateFlags.contentTypes)} />
            <Chip label="Source Host" className={gateBadgeClass(Boolean(sourceHost))} />
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
        : ['query', 'tier', 'target fields', 'source', 'results'];

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
              {tier === 'legacy' && (
                <>
                  <td className={`${TD_CLS} sf-text-muted`}>{r.target_fields?.join(', ') || '-'}</td>
                  <td className={`${TD_CLS} sf-text-muted font-mono`}>{r.hint_source || '-'}</td>
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
  if (budget.legacy.count > 0) {
    segments.push({ key: 'legacy', label: 'Legacy', count: budget.legacy.count, pct: budget.legacy.pct, cls: 'sf-chip-neutral' });
  }
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
  const showGateBadges = shouldShowSearchProfileGateBadges();
  const queryValues = useMemo(() => data.query_rows.map((row) => row.query).filter(Boolean), [data.query_rows]);
  const [selectedQueryText, setSelectedQueryText] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:searchProfile:selectedQuery:${persistScope}`,
    null,
    { validValues: queryValues },
  );
  const selectedQuery = useMemo(
    () => (selectedQueryText ? data.query_rows.find((row) => row.query === selectedQueryText) ?? null : null),
    [data.query_rows, selectedQueryText],
  );
  const hintSourceCounts = data.hint_source_counts || {};
  const liveProvider = liveSettings?.searchEngines || '';
  const allTargetFields = [...new Set(data.query_rows.flatMap((r) => r.target_fields || []))];
  const uncoveredFields = allTargetFields.length > 0
    ? allTargetFields.filter((f) => !data.query_rows.some((r) => r.target_fields?.includes(f) && (r.result_count ?? 0) > 0))
    : [];
  const identityAliasEntries = useMemo(
    () => normalizeIdentityAliasEntries(data.identity_aliases),
    [data.identity_aliases],
  );
  const gateSummary = useMemo(
    () => buildGateSummary(data.query_rows, hintSourceCounts),
    [data.query_rows, hintSourceCounts],
  );
  const fieldRuleGateCounts = useMemo(
    () => normalizeFieldRuleGateCounts(data.field_rule_gate_counts),
    [data.field_rule_gate_counts],
  );
  const providerLabel = providerDisplayLabel(liveProvider || data.provider) || toChipLabel(liveProvider || data.provider);
  const totalResults = data.query_rows.reduce((s, r) => s + (r.result_count ?? 0), 0);
  const topLevelFieldRulesOn = gateSummary.fieldRulesOn || gateSummary.fieldRuleKeyCounts.length > 0;

  const guardTotal = typeof data.query_guard?.total === 'number' ? data.query_guard.total : null;
  const guardGuarded = typeof data.query_guard?.guarded === 'number' ? data.query_guard.guarded : null;
  const guardAccepted = typeof data.query_guard?.accepted_query_count === 'number' ? data.query_guard.accepted_query_count : null;
  const guardRejected = typeof data.query_guard?.rejected_query_count === 'number' ? data.query_guard.rejected_query_count : null;

  const tiers = useMemo(() => groupByTier(data.query_rows), [data.query_rows]);
  const hasTierData = tiers.seed.length > 0 || tiers.group.length > 0 || tiers.key.length > 0;
  const budget = useMemo(() => buildTierBudgetSummary(data.query_rows, 24), [data.query_rows]);

  /* ── Empty state ── */
  if (data.query_rows.length === 0 && !data.brand_resolution) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Search Profile</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128270;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for search profile</div>
          <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">
            Profile will appear after query planning completes. Queries are assembled deterministically from field rules, search templates, and identity aliases.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

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
          <Chip label={hasTierData ? 'Tier-Aware' : 'Deterministic'} className={hasTierData ? 'sf-chip-info' : 'sf-chip-neutral'} />
          <Tip text="The Search Profile assembles queries from NeedSet tier analysis. Tier 1: broad seed searches. Tier 2: group-level searches for productive field clusters. Tier 3: individual key searches with progressive enrichment." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid>
          <HeroStat value={data.selected_query_count ?? data.query_count} label="queries" />
          {hasTierData
            ? <HeroStat value={`T1:${budget.seed.count} T2:${budget.group.count} T3:${budget.key.count}`} label="tier split" />
            : <HeroStat value={data.selected_count ?? data.discovered_count ?? totalResults} label={(data.selected_count ?? data.discovered_count ?? 0) > 0 ? 'urls selected' : 'serp results'} colorClass={(data.selected_count ?? data.discovered_count ?? 0) > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          }
          <HeroStat value={data.selected_count ?? data.discovered_count ?? totalResults} label={hasTierData ? 'urls selected' : 'serp results'} colorClass={(data.selected_count ?? data.discovered_count ?? 0) > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={guardRejected ?? guardGuarded ?? 0} label="guard rejected" colorClass={(guardRejected ?? 0) > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'} />
        </HeroStatGrid>

        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          {hasTierData ? (
            <>
              Tier-aware planner allocated <strong className="sf-text-primary not-italic">{budget.total}</strong> queries
              {budget.seed.count > 0 && <> &mdash; <strong className="sf-text-primary not-italic">{budget.seed.count}</strong> seeds</>}
              {budget.group.count > 0 && <>, <strong className="sf-text-primary not-italic">{budget.group.count}</strong> group searches</>}
              {budget.key.count > 0 && <>, <strong className="sf-text-primary not-italic">{budget.key.count}</strong> key searches</>}
              {' '}from a cap of <strong className="sf-text-primary not-italic">{budget.cap}</strong>
              {(data.selected_count ?? data.discovered_count ?? 0) > 0 && (
                <> &mdash; selected <strong className="sf-text-primary not-italic">{data.selected_count ?? data.discovered_count}</strong> URLs for extraction</>
              )}
              .
            </>
          ) : (
            <>
              Deterministic planner assembled <strong className="sf-text-primary not-italic">{data.selected_query_count ?? data.query_count}</strong> queries
              {' '}from field rules, search templates, and identity aliases
              {(data.selected_count ?? data.discovered_count ?? 0) > 0 && (
                <> &mdash; selected <strong className="sf-text-primary not-italic">{data.selected_count ?? data.discovered_count}</strong> URLs for extraction</>
              )}
              .
            </>
          )}
        </div>
      </HeroBand>

      {/* ══════════════════════════════════════════════════════════════════
          BUDGET BAR (tier-aware only)
          ══════════════════════════════════════════════════════════════════ */}
      {hasTierData && <TierBudgetBar budget={budget} />}

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

      {/* ══════════════════════════════════════════════════════════════════
          LEGACY (backward compat — no tier data)
          ══════════════════════════════════════════════════════════════════ */}
      {tiers.legacy.length > 0 && (
        <div>
          <SectionHeader>{hasTierData ? 'legacy queries' : 'query plan'} &middot; {tiers.legacy.length} queries &middot; {totalResults} results</SectionHeader>
          <TierQueryTable rows={tiers.legacy} tier="legacy" selectedQueryText={selectedQueryText} onSelect={setSelectedQueryText} />

          {(guardTotal !== null || guardAccepted !== null) && (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted pt-2 mt-2">
              {guardAccepted !== null && <span>accepted <strong className="sf-text-primary">{guardAccepted}</strong></span>}
              {guardRejected !== null && <span>rejected <strong className="sf-text-primary">{guardRejected}</strong></span>}
              {guardTotal !== null && <span>guard total <strong className="sf-text-primary">{guardGuarded ?? 0}/{guardTotal}</strong></span>}
            </div>
          )}
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
            className={gateBadgePillClass(topLevelFieldRulesOn)}
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
              <TooltipBadge key={gate.key} className={gateBadgePillClass(gate.status === 'active')} tooltip={tooltip}>
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
