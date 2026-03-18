import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../../stores/tabStore';
import type { PrefetchSearchProfileData, PrefetchSearchProfileQueryRow, SearchPlanPass, PrefetchLiveSettings } from '../../types';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { deriveLlmPlannerStatus } from '../../selectors/searchProfileHelpers.js';
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
import { formatTooltip, TooltipBadge } from '../../components/PrefetchTooltip';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import type { RuntimeIdxBadge } from '../../types';

interface PrefetchSearchProfilePanelProps {
  data: PrefetchSearchProfileData;
  searchPlans?: SearchPlanPass[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
}

/* ── Theme-aligned helpers ───────────────────────────────────────────── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 pt-2 pb-1.5 mb-3 border-b-[1.5px] border-[var(--sf-token-text-primary)]">
      <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary">{children}</span>
    </div>
  );
}

function Chip({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.04em] ${className || 'sf-chip-accent'} border-[1.5px] border-current`}>
      {label}
    </span>
  );
}

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

function confidenceStatColor(confidence: number): string {
  if (confidence >= 0.7) return 'text-[var(--sf-state-success-fg)]';
  if (confidence >= 0.4) return 'text-[var(--sf-state-warning-fg)]';
  return 'text-[var(--sf-state-error-fg)]';
}

/* ── Query Detail Drawer ─────────────────────────────────────────────── */

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

  return (
    <DrawerShell title="Query Detail" subtitle={row.query} maxHeight="none" className="max-h-none" scrollContent={false} onClose={onClose}>
      <DrawerSection title="Query">
        <div className="font-mono sf-text-caption sf-text-primary sf-pre-block rounded p-2">{row.query}</div>
      </DrawerSection>
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

/* ── Main Panel ─────────────────────────────────────────────────────── */

export function PrefetchSearchProfilePanel({ data, searchPlans, persistScope, liveSettings, idxRuntime }: PrefetchSearchProfilePanelProps) {
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
  const llmPlannerFromArtifact = useMemo(
    () => deriveLlmPlannerStatus(data as unknown as Record<string, unknown>),
    [data],
  );
  const llmPlannerActive = llmPlannerFromArtifact;
  const liveProvider = liveSettings?.searchEngines || '';
  const llmPlannedQueries = useMemo(() => {
    const planned = new Set<string>();
    for (const plan of searchPlans || []) {
      const queries = Array.isArray(plan.queries_generated) ? plan.queries_generated : [];
      for (const query of queries) {
        const token = String(query || '').trim();
        if (token) planned.add(token);
      }
    }
    return planned;
  }, [searchPlans]);
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
  const effectiveGateCounts = useMemo(
    () => new Map(fieldRuleGateCounts.map((row) => [row.key, row])),
    [fieldRuleGateCounts],
  );
  const providerLabel = providerDisplayLabel(liveProvider || data.provider) || toChipLabel(liveProvider || data.provider);
  const totalResults = data.query_rows.reduce((s, r) => s + (r.result_count ?? 0), 0);
  const isSchema4 = data.source === 'schema4_planner';
  const topLevelFieldRulesOn = gateSummary.fieldRulesOn || gateSummary.fieldRuleKeyCounts.length > 0;

  const guardTotal = typeof data.query_guard?.total === 'number' ? data.query_guard.total : null;
  const guardGuarded = typeof data.query_guard?.guarded === 'number' ? data.query_guard.guarded : null;
  const guardAccepted = typeof data.query_guard?.accepted_query_count === 'number' ? data.query_guard.accepted_query_count : null;
  const guardRejected = typeof data.query_guard?.rejected_query_count === 'number' ? data.query_guard.rejected_query_count : null;

  /* ── Empty state ── */
  if (data.query_rows.length === 0 && !data.brand_resolution && !data.schema4_planner) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Search Profile</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128270;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for search profile</div>
          <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">
            Profile will appear after query planning completes. It combines deterministic rules with optional LLM planner queries to discover source URLs.
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
      <div className="sf-surface-elevated rounded-sm border sf-border-soft px-7 py-6 space-y-5">
        {/* Title row */}
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
          <div className="flex items-baseline gap-3">
            <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Search Profile</span>
            <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Discovery Pipeline</span>
            {data.status && (
              <Chip label={data.status === 'executed' ? 'EXECUTED' : data.status.toUpperCase()} className={data.status === 'executed' ? 'sf-chip-success' : 'sf-chip-warning'} />
            )}
            {isSchema4 && <Chip label="Schema 4" className="sf-chip-info" />}
            {!isSchema4 && data.query_rows.length > 0 && <Chip label="Deterministic" className="sf-chip-neutral" />}
          </div>
          <div className="flex items-center gap-2">
            {providerLabel && <Chip label={providerLabel} className="sf-chip-accent" />}
            <Chip label="Deterministic" className="sf-chip-neutral" />
            <Tip text="The Search Profile assembles queries, aliases, and variant guards used to discover source URLs. It combines deterministic rules with LLM planner query output." />
          </div>
        </div>

        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        {/* Big stat numbers */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-5">
          <div>
            <div className="text-4xl font-bold text-[var(--sf-token-accent)] leading-none tracking-tight">
              {data.selected_query_count ?? data.query_count}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">queries</div>
          </div>
          <div>
            <div className={`text-4xl font-bold leading-none tracking-tight ${(data.discovered_count ?? 0) > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'}`}>
              {data.discovered_count ?? totalResults}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">
              {(data.discovered_count ?? 0) > 0 ? 'urls discovered' : 'serp results'}
            </div>
          </div>
          <div>
            <div className={`text-4xl font-bold leading-none tracking-tight ${(data.approved_count ?? 0) > 0 ? 'text-[var(--sf-token-accent)]' : 'sf-text-muted'}`}>
              {data.approved_count ?? 0}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">approved</div>
          </div>
          <div>
            <div className={`text-4xl font-bold leading-none tracking-tight ${(guardRejected ?? 0) > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'}`}>
              {guardRejected ?? guardGuarded ?? 0}
            </div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">guard rejected</div>
          </div>
        </div>

        {/* Narrative */}
        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          {isSchema4 && data.schema4_planner ? (
            <>
              NeedSet planner generated <strong className="sf-text-primary not-italic">{data.selected_query_count ?? data.query_count}</strong> queries
              {data.schema4_planner.planner_confidence > 0 && (
                <> with <strong className="sf-text-primary not-italic">{Math.round(data.schema4_planner.planner_confidence * 100)}%</strong> confidence</>
              )}
              {data.schema4_planner.duplicates_suppressed > 0 && (
                <>, suppressing {data.schema4_planner.duplicates_suppressed} duplicate{data.schema4_planner.duplicates_suppressed !== 1 ? 's' : ''}</>
              )}
              {(data.discovered_count ?? 0) > 0 && (
                <> &mdash; discovered <strong className="sf-text-primary not-italic">{data.discovered_count}</strong> URLs ({data.approved_count ?? 0} approved, {data.candidate_count ?? 0} candidates)</>
              )}
              .
            </>
          ) : (
            <>
              Deterministic planner assembled <strong className="sf-text-primary not-italic">{data.selected_query_count ?? data.query_count}</strong> queries
              {' '}from field rules, search templates, and identity aliases
              {(data.discovered_count ?? 0) > 0 && (
                <> &mdash; discovered <strong className="sf-text-primary not-italic">{data.discovered_count}</strong> URLs ({data.approved_count ?? 0} approved, {data.candidate_count ?? 0} candidates)</>
              )}
              .
            </>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          QUERY TABLE
          ══════════════════════════════════════════════════════════════════ */}
      {data.query_rows.length > 0 && (
        <div>
          <SectionHeader>query plan &middot; {data.query_rows.length} queries &middot; {totalResults} results</SectionHeader>
          <div className={`overflow-x-auto overflow-y-auto border sf-border-soft rounded-sm ${selectedQuery ? 'max-h-[50vh]' : 'max-h-none'}`}>
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  {['query', 'strategy', 'target fields', showGateBadges ? 'gate badges' : 'source', 'results', 'providers'].map((h) => (
                    <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.query_rows.map((r, i) => {
                  const isLlm = llmPlannedQueries.has(r.query);
                  const queryTermsGate = effectiveGateCounts.get('search_hints.query_terms');
                  const domainHintsGate = effectiveGateCounts.get('search_hints.domain_hints');
                  const contentTypesGate = effectiveGateCounts.get('search_hints.preferred_content_types');
                  const primaryTargetField = String(r.target_fields?.[0] || '').trim();
                  const perFieldHintCounts = primaryTargetField ? data.field_rule_hint_counts_by_field?.[primaryTargetField] : undefined;
                  const resolveCount = (
                    key: 'query_terms' | 'domain_hints' | 'preferred_content_types',
                    fallback: { status: string; valueCount: number } | undefined,
                  ) => resolveFieldRuleHintCountForRowGate({ perFieldHintCounts, gateKey: key, fallbackGate: fallback });
                  const queryTermsInfo = resolveCount('query_terms', queryTermsGate);
                  const domainHintsInfo = resolveCount('domain_hints', domainHintsGate);
                  const contentTypesInfo = resolveCount('preferred_content_types', contentTypesGate);
                  const toRatioLabel = (info: { status: string; effective: number; total: number }) => info.status === 'off' ? 'OFF' : `${info.effective}/${Math.max(info.total, info.effective)}`;
                  const source = querySourceLabel(r);
                  return (
                    <tr
                      key={i}
                      className="border-b sf-border-soft hover:sf-surface-elevated cursor-pointer"
                      onClick={() => setSelectedQueryText(selectedQueryText === r.query ? null : r.query)}
                    >
                      <td className="py-1.5 px-4 font-mono sf-text-primary max-w-[20rem] truncate">{r.query}</td>
                      <td className="py-1.5 px-4">
                        <Chip label={isLlm ? 'LLM' : 'Det.'} className={isLlm ? 'sf-chip-warning' : 'sf-chip-neutral'} />
                      </td>
                      <td className="py-1.5 px-4 sf-text-muted">{r.target_fields?.join(', ') || '-'}</td>
                      {showGateBadges ? (
                        <td className="py-1.5 px-4">
                          <div className="flex flex-wrap gap-1">
                            <Chip label={`Terms ${toRatioLabel(queryTermsInfo)}`} className={gateBadgeClass(queryTermsInfo.status === 'active')} />
                            <Chip label={`Domain ${toRatioLabel(domainHintsInfo)}`} className={gateBadgeClass(domainHintsInfo.status === 'active')} />
                            <Chip label={`Content ${toRatioLabel(contentTypesInfo)}`} className={gateBadgeClass(contentTypesInfo.status === 'active')} />
                          </div>
                        </td>
                      ) : (
                        <td className="py-1.5 px-4 sf-text-muted font-mono">{source}</td>
                      )}
                      <td className="py-1.5 px-4 text-right font-mono">{r.result_count ?? '-'}</td>
                      <td className="py-1.5 px-4 sf-text-muted">{formatProviderList(r.providers) || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Guard summary footer */}
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
                { label: 'checked', value: data.serp_explorer.candidates_checked, color: 'sf-text-primary' },
                { label: 'deduped', value: data.serp_explorer.dedupe_output, color: 'sf-text-primary' },
                { label: 'triaged', value: data.serp_explorer.urls_triaged, color: 'text-[var(--sf-token-accent)]' },
                { label: 'selected', value: data.serp_explorer.urls_selected, color: 'text-[var(--sf-state-success-fg)]' },
                { label: 'rejected', value: data.serp_explorer.urls_rejected, color: 'text-[var(--sf-state-error-fg)]' },
                { label: 'dupes removed', value: data.serp_explorer.duplicates_removed, color: 'sf-text-muted' },
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
          SCHEMA 4 PLANNER DECISIONS
          ══════════════════════════════════════════════════════════════════ */}
      {data.schema4_planner && (
        <div>
          <SectionHeader>planner decisions &middot; schema 4</SectionHeader>
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 space-y-4">
            {/* Planner stats */}
            <div className="flex items-center gap-3 flex-wrap">
              <Chip label={`mode: ${data.schema4_planner.mode}`} className={data.schema4_planner.mode === 'llm' ? 'sf-chip-warning' : 'sf-chip-neutral'} />
              <span className={`text-sm font-mono font-semibold ${confidenceStatColor(data.schema4_planner.planner_confidence)}`}>
                {Math.round(data.schema4_planner.planner_confidence * 100)}% conf
              </span>
              {data.schema4_planner.duplicates_suppressed > 0 && (
                <span className="text-[11px] font-mono sf-text-muted">{data.schema4_planner.duplicates_suppressed} dupes suppressed</span>
              )}
              {data.schema4_planner.targeted_exceptions > 0 && (
                <span className="text-[11px] font-mono sf-text-muted">{data.schema4_planner.targeted_exceptions} exceptions</span>
              )}
            </div>

            {/* Learning: families, domains, groups */}
            {data.schema4_learning && (
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {data.schema4_learning.families_used.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">query families</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.schema4_learning.families_used.map((f) => <Chip key={f} label={f.replace(/_/g, ' ')} className="sf-chip-accent" />)}
                    </div>
                  </div>
                )}
                {data.schema4_learning.domains_targeted.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">domains targeted</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.schema4_learning.domains_targeted.map((d) => <Chip key={d} label={d} className="sf-chip-info" />)}
                    </div>
                  </div>
                )}
                {data.schema4_learning.groups_activated.length > 0 && (
                  <div>
                    <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">groups activated</div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.schema4_learning.groups_activated.map((g) => <Chip key={g} label={g} className="sf-chip-success" />)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Bundles */}
            {data.schema4_panel?.bundles && data.schema4_panel.bundles.length > 0 && (
              <div>
                <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">focus group bundles</div>
                <div className="overflow-x-auto border sf-border-soft rounded-sm">
                  <table className="min-w-full text-xs">
                    <thead className="sf-surface-elevated sticky top-0">
                      <tr>
                        {['phase', 'group', 'queries', 'missing fields', 'priority'].map((h) => (
                          <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.schema4_panel.bundles.map((b) => (
                        <tr key={b.key} className="border-b sf-border-soft">
                          <td className="py-1.5 px-4">
                            <Chip label={b.phase} className={b.phase === 'now' ? 'sf-chip-success' : b.phase === 'next' ? 'sf-chip-warning' : 'sf-chip-neutral'} />
                          </td>
                          <td className="py-1.5 px-4 font-mono font-medium sf-text-primary">{b.label || b.key}</td>
                          <td className="py-1.5 px-4 font-mono">{b.queries.length}</td>
                          <td className="py-1.5 px-4 font-mono">{(b.fields || []).filter((f) => f.state === 'missing').length}</td>
                          <td className="py-1.5 px-4"><Chip label={b.priority} className={b.priority === 'core' ? 'sf-chip-danger' : b.priority === 'secondary' ? 'sf-chip-warning' : 'sf-chip-neutral'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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

      {/* Uncovered fields warning */}
      {uncoveredFields.length > 0 && (
        <div className="px-4 py-3 rounded-sm border border-[var(--sf-state-warning-border)] bg-[var(--sf-state-warning-bg)]">
          <span className="text-xs font-bold text-[var(--sf-state-warning-fg)]">Uncovered fields: </span>
          {uncoveredFields.map((f) => <Chip key={f} label={f} className="sf-chip-warning" />)}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DEBUG
          ══════════════════════════════════════════════════════════════════ */}
      <details className="text-xs">
        <summary className="cursor-pointer sf-summary-toggle flex items-baseline gap-2 pb-1.5 border-b border-dashed sf-border-soft select-none">
          <span className="text-[10px] font-semibold font-mono sf-text-subtle tracking-[0.04em] uppercase">debug &middot; raw search profile json</span>
        </summary>
        <pre className="mt-3 sf-pre-block text-xs font-mono rounded-sm p-4 overflow-x-auto overflow-y-auto max-h-[25rem] whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
