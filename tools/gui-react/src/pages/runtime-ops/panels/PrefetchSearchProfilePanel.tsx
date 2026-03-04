import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { PrefetchSearchProfileData, PrefetchSearchProfileQueryRow, SearchPlanPass, PrefetchLiveSettings } from '../types';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { StatCard } from '../components/StatCard';
import { Tip } from '../../../components/common/Tip';
import { deriveLlmPlannerStatus } from '../../indexing/panels/searchProfileHelpers';
import {
  shouldShowSearchProfileGateBadges,
  normalizeIdentityAliasEntries,
} from './prefetchSearchProfileDisplayHelpers.js';
import {
  sourceHostFromRow,
  getQueryGateFlags,
  querySourceLabel,
  querySourceChipClass,
  buildGateSummary,
  normalizeFieldRuleGateCounts,
  resolveFieldRuleHintCountForRowGate,
} from './prefetchSearchProfileGateHelpers.js';
import { providerDisplayLabel } from './searchResultsHelpers.js';
import { formatTooltip, TooltipBadge } from '../components/PrefetchTooltip';

interface PrefetchSearchProfilePanelProps {
  data: PrefetchSearchProfileData;
  searchPlans?: SearchPlanPass[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
}

function gateBadgeClass(active: boolean) {
  return active
    ? 'sf-chip-success'
    : 'sf-chip-neutral';
}


function Chip({ label, className }: { label: string; className?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${className || 'sf-chip-accent'}`}>
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
  return providers
    .map((provider) => providerDisplayLabel(provider))
    .filter(Boolean)
    .join(', ');
}

function llmPlannerBadgeClass(active: boolean): string {
  return active
    ? 'sf-chip-warning'
    : 'sf-chip-neutral';
}

function gateBadgePillClass(active: boolean): string {
  return `px-2 py-0.5 rounded-full sf-text-caption font-medium ${gateBadgeClass(active)}`;
}

function gateZeroRatioReason(gateKey: string): string {
  if (gateKey === 'search_hints.query_terms') {
    return '0/Y means no query terms are configured on enabled fields.';
  }
  if (gateKey === 'search_hints.domain_hints') {
    return '0/Y means domain hints exist but are not usable host patterns. Examples of usable host patterns: `example.com`, `support.example.com`.';
  }
  if (gateKey === 'search_hints.preferred_content_types') {
    return '0/Y means no preferred content types are configured on enabled fields.';
  }
  return '0/Y means no effective values are available for this gate on enabled fields.';
}

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
    <DrawerShell
      title="Query Detail"
      subtitle={row.query}
      maxHeight="none"
      className="max-h-none"
      scrollContent={false}
      onClose={onClose}
    >
      <DrawerSection title="Query">
        <div className="font-mono sf-text-caption sf-text-primary sf-pre-block rounded p-2">{row.query}</div>
      </DrawerSection>

      {showGateBadges && (
        <DrawerSection title="Applied Gates">
          <div className="flex flex-wrap gap-1.5">
            <Chip
              label="Query Terms"
              className={gateBadgeClass(queryGateFlags.queryTerms)}
            />
            <Chip
              label="Domain Hint"
              className={gateBadgeClass(queryGateFlags.domainHints)}
            />
            <Chip
              label="Content Type"
              className={gateBadgeClass(queryGateFlags.contentTypes)}
            />
            <Chip
              label="Source Host"
              className={gateBadgeClass(Boolean(sourceHost))}
            />
          </div>
        </DrawerSection>
      )}

      <DrawerSection title="Applied Source">
        {showGateBadges ? (
          <Chip
            label={source}
            className={querySourceChipClass(source)}
          />
        ) : (
          <div className="sf-text-caption font-mono sf-text-muted">{source}</div>
        )}
      </DrawerSection>

      {(row.target_fields?.length ?? 0) > 0 && (
        <DrawerSection title="Target Fields">
          <div className="flex flex-wrap gap-1">
            {row.target_fields?.map((f) => (
              <Chip key={f} label={f} className="sf-chip-success" />
            ))}
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

export function PrefetchSearchProfilePanel({ data, searchPlans, persistScope, liveSettings }: PrefetchSearchProfilePanelProps) {
  const showGateBadges = shouldShowSearchProfileGateBadges();
  const queryValues = useMemo(
    () => data.query_rows.map((row) => row.query).filter(Boolean),
    [data.query_rows],
  );
  const [selectedQueryText, setSelectedQueryText] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:searchProfile:selectedQuery:${persistScope}`,
    null,
    { validValues: queryValues },
  );
  const selectedQuery = useMemo(
    () => (selectedQueryText ? data.query_rows.find((row) => row.query === selectedQueryText) ?? null : null),
    [data.query_rows, selectedQueryText],
  );
  const guardTotal = typeof data.query_guard?.total === 'number' ? data.query_guard.total : null;
  const guardGuarded = typeof data.query_guard?.guarded === 'number' ? data.query_guard.guarded : null;
  const hintSourceCounts = data.hint_source_counts || {};
  const llmPlannerFromArtifact = useMemo(
    () => deriveLlmPlannerStatus(data as unknown as Record<string, unknown>),
    [data],
  );
  const llmPlannerActive = liveSettings?.phase2LlmEnabled ?? llmPlannerFromArtifact;
  const liveProvider = liveSettings?.searchProvider || '';
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
  const effectiveGateCounts = useMemo(() => {
    return new Map(fieldRuleGateCounts.map((row) => [row.key, row]));
  }, [fieldRuleGateCounts]);

  const totalTargetFieldRows = allTargetFields.length;
  const providerLabel = providerDisplayLabel(liveProvider || data.provider) || toChipLabel(liveProvider || data.provider);
  const llmPlannerTooltip = llmPlannerActive
    ? formatTooltip({
      what: 'LLM query planner contributed query planning signals for this run.',
      effect: 'LLM-informed query generation can influence which gates get activated.',
      setBy: 'Runtime knob `phase2LlmEnabled` and planner signals in the run payload.',
    })
    : formatTooltip({
      what: 'LLM query planner is not active for this run.',
      effect: 'Only deterministic query planning contributes to gate activation.',
      setBy: 'Enable `phase2LlmEnabled` or run with planner signals present.',
    });
  const topLevelFieldRulesOn = gateSummary.fieldRulesOn || gateSummary.fieldRuleKeyCounts.length > 0;
  const fieldRulesTooltip = topLevelFieldRulesOn
    ? formatTooltip({
      what: 'At least one indexed field_rules.* key is active for this run.',
      effect: 'Field-rules guided query behavior is active.',
      setBy: 'Driven by indexed field-rules keys and row-level field-rules hint sources.',
    })
    : formatTooltip({
      what: 'No indexed field_rules.* keys are active for this run.',
      effect: 'Field Rules badge stays OFF/gray.',
      setBy: 'Ensure indexed field-rules keys are available for this run when expected.',
    });

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1 min-h-0">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold sf-text-primary">
          Search Profile
          <Tip text="The Search Profile assembles queries, aliases, and variant guards used to discover source URLs. It combines deterministic rules with optional LLM planner queries." />
        </h3>
        {providerLabel && <Chip label={providerLabel} />}
        <TooltipBadge
          className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${llmPlannerBadgeClass(llmPlannerActive)}`}
          tooltip={llmPlannerTooltip}
        >
          LLM Planner
        </TooltipBadge>
      </div>

      {showGateBadges && (
        <div className="flex items-center gap-2 flex-wrap">
          <TooltipBadge className={gateBadgePillClass(topLevelFieldRulesOn)} tooltip={fieldRulesTooltip}>
            Field Rules
          </TooltipBadge>
          {fieldRuleGateCounts.map((gate) => {
            const displayTotal = Math.max(gate.totalValueCount, gate.effectiveValueCount);
            const displayValue = gate.status === 'off' ? 'OFF' : `${gate.effectiveValueCount}/${displayTotal}`;
            const zeroReason = gate.effectiveValueCount === 0
              ? gateZeroRatioReason(gate.key)
              : '';
            const tooltip = gate.status === 'off'
              ? formatTooltip({
                what: `${gate.label} is disabled by consumer gate settings for this run context.`,
                effect: 'No queries from this gate key are considered.',
                setBy: 'Enable the corresponding IDX gate in Field Rules to activate this key.',
              })
              : formatTooltip({
                what: `${gate.label} is using ${gate.effectiveValueCount} of ${displayTotal} configured value${displayTotal === 1 ? '' : 's'}.`,
                effect: gate.effectiveValueCount > 0
                  ? 'Configured values are available for query planning.'
                  : zeroReason,
                setBy: 'Populate search_hints values in Field Rules for this key when needed.',
              });
            return (
              <TooltipBadge
                key={gate.key}
                className={gateBadgePillClass(gate.status === 'active')}
                tooltip={tooltip}
              >
                {gate.label}: {displayValue}
              </TooltipBadge>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <StatCard label="Queries" value={data.query_count} tip="Total search queries assembled from product aliases, category terms, and field-specific templates." />
        {guardTotal !== null && <StatCard label="Query Guard" value={`${guardGuarded ?? 0}/${guardTotal}`} tip="Queries checked against guard rules. Guarded queries had redundant or low-value terms removed before being sent to search." />}
        {totalTargetFieldRows > 0 && <StatCard label="Target Fields" value={totalTargetFieldRows} tip="Distinct spec fields targeted by at least one query. Higher coverage means more fields have dedicated search queries." />}
      </div>

      {identityAliasEntries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="sf-text-caption sf-text-subtle">Aliases:</span>
          {identityAliasEntries.map((entry) => <Chip key={entry.key} label={entry.label} />)}
        </div>
      )}

      {data.variant_guard_terms.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="sf-text-caption sf-text-subtle">Guard terms:</span>
          {data.variant_guard_terms.map((t, index) => {
            const label = toChipLabel(t);
            if (!label) return null;
            return (
              <Chip
                key={`guard:${label}:${index}`}
                label={label}
                className="sf-chip-danger"
              />
            );
          })}
        </div>
      )}

      {uncoveredFields.length > 0 && (
        <div className="px-3 py-2 sf-callout sf-callout-warning text-xs">
          <span className="font-medium sf-status-text-warning">Uncovered fields: </span>
          {uncoveredFields.map((f) => (
            <span key={f} className="inline-block px-1.5 py-0.5 rounded sf-chip-warning sf-text-caption mr-1 mb-0.5">{f}</span>
          ))}
        </div>
      )}

      {data.query_rows.length > 0 && (
        <div className={`sf-table-shell rounded overflow-hidden overflow-x-auto overflow-y-auto ${selectedQuery ? 'max-h-[50vh]' : 'max-h-none'}`}>
          <table className="w-full sf-text-caption">
            <thead className="sf-table-head">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Query</th>
                <th className="text-left px-3 py-2 font-medium">Strategy</th>
                <th className="text-left px-3 py-2 font-medium">Target Fields</th>
                <th className="text-left px-3 py-2 font-medium">{showGateBadges ? 'Gate Badges' : 'Source'}</th>
                <th className="text-right px-3 py-2 font-medium">Results</th>
                <th className="text-left px-3 py-2 font-medium">Providers</th>
              </tr>
            </thead>
            <tbody>
              {data.query_rows.map((r, i) => {
                const isLlm = llmPlannedQueries.has(r.query);
                const queryTermsGate = effectiveGateCounts.get('search_hints.query_terms');
                const domainHintsGate = effectiveGateCounts.get('search_hints.domain_hints');
                const contentTypesGate = effectiveGateCounts.get('search_hints.preferred_content_types');
                const primaryTargetField = String(r.target_fields?.[0] || '').trim();
                const perFieldHintCounts = primaryTargetField
                  ? data.field_rule_hint_counts_by_field?.[primaryTargetField]
                  : undefined;
                const resolveCount = (
                  key: 'query_terms' | 'domain_hints' | 'preferred_content_types',
                  fallback: { status: string; valueCount: number } | undefined,
                ) => resolveFieldRuleHintCountForRowGate({
                  perFieldHintCounts,
                  gateKey: key,
                  fallbackGate: fallback,
                });
                const queryTermsInfo = resolveCount('query_terms', queryTermsGate);
                const domainHintsInfo = resolveCount('domain_hints', domainHintsGate);
                const contentTypesInfo = resolveCount('preferred_content_types', contentTypesGate);
                const toRatioLabel = (info: { status: string; effective: number; total: number }) => {
                  if (info.status === 'off') {
                    return 'OFF';
                  }
                  const total = Math.max(info.total, info.effective);
                  return `${info.effective}/${total}`;
                };
                const queryTermsCountLabel = toRatioLabel(queryTermsInfo);
                const domainHintsCountLabel = toRatioLabel(domainHintsInfo);
                const contentTypesCountLabel = toRatioLabel(contentTypesInfo);
                const queryTermsBadgeOn = queryTermsInfo.status === 'active';
                const domainHintsBadgeOn = domainHintsInfo.status === 'active';
                const contentTypesBadgeOn = contentTypesInfo.status === 'active';
                const source = querySourceLabel(r);
                return (
                  <tr
                    key={i}
                    className="sf-table-row border-t sf-border-soft sf-row-hoverable cursor-pointer"
                    onClick={() => setSelectedQueryText(selectedQueryText === r.query ? null : r.query)}
                  >
                    <td className="px-3 py-1.5 font-mono sf-text-primary max-w-[20rem] truncate">{r.query}</td>
                    <td className="px-3 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${
                        isLlm
                          ? 'sf-chip-warning'
                          : 'sf-chip-neutral'
                      }`}>
                        {isLlm ? 'LLM' : 'Det.'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 sf-text-muted">
                      {r.target_fields?.join(', ') || '-'}
                    </td>
                    {showGateBadges ? (
                      <td className="px-3 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${gateBadgeClass(queryTermsBadgeOn)}`}>
                            Terms{queryTermsCountLabel ? ` ${queryTermsCountLabel}` : ''}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${gateBadgeClass(domainHintsBadgeOn)}`}>
                            Domain{domainHintsCountLabel ? ` ${domainHintsCountLabel}` : ''}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${gateBadgeClass(contentTypesBadgeOn)}`}>
                            Content{contentTypesCountLabel ? ` ${contentTypesCountLabel}` : ''}
                          </span>
                        </div>
                      </td>
                    ) : (
                      <td className="px-3 py-1.5 sf-text-muted font-mono">{source}</td>
                    )}
                    <td className="px-3 py-1.5 text-right font-mono">{r.result_count ?? '-'}</td>
                    <td className="px-3 py-1.5 sf-text-muted">{formatProviderList(r.providers) || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data.query_rows.length === 0 && (
        <div className="text-sm sf-text-subtle text-center py-8">
          No search profile data available. Profile will appear after query planning.
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

      <details className="text-xs">
        <summary className="sf-summary-toggle">
          Debug: Raw SearchProfile JSON
        </summary>
        <pre className="mt-2 sf-text-caption font-mono sf-pre-block rounded p-3 overflow-x-auto overflow-y-auto max-h-60 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
