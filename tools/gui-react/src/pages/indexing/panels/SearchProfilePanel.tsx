import { useMemo } from 'react';
import { Tip } from '../../../components/common/Tip';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { ScoreBar } from '../../runtime-ops/components/ScoreBar';
import { usePersistedToggle } from '../../../stores/collapseStore';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import { formatNumber, formatDateTime, normalizeToken } from '../helpers';
import {
  computeCoverageStats,
  deriveQueryStatus,
  deriveStrategy,
  deriveLlmPlannerStatus,
  buildQueryDetailPayload,
} from './searchProfileHelpers.js';
import type { QueryDetailPayload } from './searchProfileHelpers.js';
import type {
  IndexLabSearchProfileResponse,
  IndexLabSearchProfileQueryRow,
  IndexLabNeedSetRow,
} from '../types';

interface QueryRejectRow {
  query?: string;
  source?: string;
  reason: string;
  stage?: string;
  detail?: string;
}

interface AliasRejectRow {
  alias?: string;
  source?: string;
  reason?: string;
  stage?: string;
}

interface QueryRejectBreakdown {
  ordered: QueryRejectRow[];
  safety: QueryRejectRow[];
  pruned: QueryRejectRow[];
}

interface SearchProfilePanelProps {
  collapsed: boolean;
  onToggle: () => void;
  persistScope: string;
  indexlabSearchProfile: IndexLabSearchProfileResponse | null;
  indexlabSearchProfileRows: IndexLabSearchProfileQueryRow[];
  indexlabSearchProfileVariantGuardTerms: string[];
  indexlabSearchProfileQueryRejectBreakdown: QueryRejectBreakdown;
  indexlabSearchProfileAliasRejectRows: AliasRejectRow[];
  needsetRows: IndexLabNeedSetRow[];
}

function StatCard({ label, value, tip }: { label: string; value: string | number; tip?: string }) {
  return (
    <div className="sf-surface-elevated px-3 py-2 min-w-[8rem]">
      <div className="sf-text-caption font-medium sf-text-muted uppercase tracking-wider flex items-center">
        {label}
        {tip && <Tip text={tip} />}
      </div>
      <div className="text-lg font-semibold sf-text-primary mt-0.5">{value}</div>
    </div>
  );
}

function queryStatusBadgeClass(status: string) {
  switch (status) {
    case 'received':
      return 'sf-chip-success';
    case 'sent':
      return 'sf-chip-info';
    case 'planned':
      return 'sf-chip-neutral';
    default:
      return 'sf-chip-neutral';
  }
}

function strategyBadgeClass(strategy: string) {
  return strategy === 'llm-planned'
    ? 'sf-chip-warning'
    : 'sf-chip-info';
}

function aliasSourceBadgeClass(source: string) {
  const s = (source || '').toLowerCase();
  if (s === 'deterministic' || s === 'identity_lock' || s === 'seed') return 'sf-chip-info';
  if (s.startsWith('llm') || s === 'learned') return 'sf-chip-warning';
  return 'sf-chip-neutral';
}

function hintSourceBadgeClass(source: string) {
  const s = (source || '').toLowerCase();
  if (s === 'field_target') return 'sf-chip-success';
  if (s === 'alias_expansion') return 'sf-chip-info';
  if (s === 'doc_hint') return 'sf-chip-accent';
  if (s.startsWith('llm')) return 'sf-chip-warning';
  if (s === 'base_template') return 'sf-chip-info';
  return 'sf-chip-neutral';
}

function QueryDetailDrawer({ payload, onClose }: { payload: QueryDetailPayload; onClose: () => void }) {
  return (
    <DrawerShell title="Query Detail" subtitle={payload.query.slice(0, 60)} onClose={onClose} width={480}>
      <DrawerSection title="Query">
        <pre className="text-xs font-mono sf-pre-block p-2 whitespace-pre-wrap">{payload.query}</pre>
      </DrawerSection>

      {payload.targetFields.length > 0 && (
        <DrawerSection title="Target Fields">
          <div className="flex flex-wrap gap-1">
            {payload.targetFields.map((f) => (
              <span key={f} className="px-1.5 py-0.5 sf-text-caption font-medium sf-chip-success">{f}</span>
            ))}
          </div>
        </DrawerSection>
      )}

      {payload.matchedNeeds.length > 0 && (
        <DrawerSection title="Needs Covered">
          <div className="space-y-1">
            {payload.matchedNeeds.map((n) => (
              <div key={n.field_key} className="flex items-center gap-2 text-xs">
                <span className="font-mono sf-text-primary">{n.field_key}</span>
                <span className="sf-text-caption sf-text-subtle">{n.required_level}</span>
                <span className="ml-auto sf-text-caption font-mono sf-text-muted">score {formatNumber(n.need_score, 1)}</span>
              </div>
            ))}
          </div>
        </DrawerSection>
      )}

      <DrawerSection title="Strategy">
        <span className={`px-2 py-0.5 sf-text-caption font-medium ${strategyBadgeClass(payload.strategy)}`}>
          {payload.strategy === 'llm-planned' ? 'LLM Planned' : 'Deterministic'}
        </span>
      </DrawerSection>

      <DrawerSection title="Constraints">
        <div className="grid grid-cols-2 gap-1 text-xs">
          <span className="sf-text-muted">Doc Hint</span>
          <span className="font-mono">{payload.constraints.doc_hint || '-'}</span>
          <span className="sf-text-muted">Domain Hint</span>
          <span className="font-mono">{payload.constraints.domain_hint || '-'}</span>
          <span className="sf-text-muted">Alias</span>
          <span className="font-mono">{payload.constraints.alias || '-'}</span>
        </div>
      </DrawerSection>

      <DrawerSection title="Results">
        <div className="grid grid-cols-2 gap-1 text-xs">
          <span className="sf-text-muted">Hit Count</span>
          <span className="font-mono font-semibold">{formatNumber(payload.resultCount)}</span>
          <span className="sf-text-muted">Providers</span>
          <span className="font-mono">{payload.providers.length > 0 ? payload.providers.join(', ') : '-'}</span>
        </div>
      </DrawerSection>
    </DrawerShell>
  );
}

export function SearchProfilePanel({
  collapsed,
  onToggle,
  persistScope,
  indexlabSearchProfile,
  indexlabSearchProfileRows,
  indexlabSearchProfileVariantGuardTerms,
  indexlabSearchProfileQueryRejectBreakdown,
  indexlabSearchProfileAliasRejectRows,
  needsetRows,
}: SearchProfilePanelProps) {
  const queryValues = useMemo(
    () => indexlabSearchProfileRows.map((row) => row.query).filter(Boolean),
    [indexlabSearchProfileRows],
  );
  const [selectedQuery, setSelectedQuery] = usePersistedNullableTab<string>(
    `indexing:searchProfile:selectedQuery:${persistScope}`,
    null,
    { validValues: queryValues },
  );
  const [showRejectLogs, toggleRejectLogs] = usePersistedToggle('indexlab:searchProfile:rejectLogs', false);
  const [showDebug, toggleDebug] = usePersistedToggle('indexlab:searchProfile:debug', false);

  const sp = indexlabSearchProfile;
  const rows = indexlabSearchProfileRows;
  const aliases = sp?.identity_aliases || [];
  const focusFields = sp?.focus_fields || [];
  const hintSourceCounts = sp?.hint_source_counts || {};
  const provider = sp?.provider || '';
  const isExecuted = sp?.status === 'executed';
  const llmPlannerActive = useMemo(() => deriveLlmPlannerStatus(sp as Record<string, unknown> | null), [sp]);

  const coverage = useMemo(
    () => computeCoverageStats(needsetRows, rows),
    [needsetRows, rows],
  );

  const selectedPayload = useMemo(() => {
    if (!selectedQuery) return null;
    const row = rows.find((entry) => entry.query === selectedQuery);
    if (!row) return null;
    return buildQueryDetailPayload(row, needsetRows) as QueryDetailPayload;
  }, [selectedQuery, rows, needsetRows]);

  const totalHits = useMemo(
    () => rows.reduce((sum, r) => sum + Number(r.result_count || 0), 0),
    [rows],
  );

  const handleExport = () => {
    if (!sp) return;
    const blob = new Blob([JSON.stringify(sp, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `search-profile-${sp.run_id || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sf-surface-panel p-3 space-y-3" style={{ order: 46 }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            className="inline-flex items-center justify-center w-5 h-5 sf-text-caption sf-icon-button"
            title={collapsed ? 'Open panel' : 'Close panel'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span className="text-sm font-semibold sf-text-primary">Search Profile</span>
          <Tip text="Deterministic aliases and field-targeted query templates with hint provenance." />
        </div>
        <div className="flex items-center gap-2">
          {sp && (
            <button
              onClick={handleExport}
              className="px-2 py-1 sf-text-caption font-medium sf-action-button"
            >
              Export
            </button>
          )}
        </div>
      </div>

      {/* Empty state: no data at all */}
      {!collapsed && !sp && (
        <div className="text-sm sf-text-subtle text-center py-8">
          Search Profile not generated yet. Profile will appear after Phase 02 query planning completes.
        </div>
      )}

      {/* Main content */}
      {!collapsed && sp && (
        <>
          {/* StatCards row */}
          <div className="flex items-center gap-3 flex-wrap">
            <StatCard label="Queries" value={formatNumber(sp.selected_query_count || rows.length)} tip="Total query templates selected for execution." />
            <StatCard
              label="Coverage"
              value={coverage.totalNeeds > 0 ? `${coverage.coveredNeeds}/${coverage.totalNeeds}` : '-'}
              tip="NeedSet fields covered by at least one query target_fields entry."
            />
            <StatCard label="Total Hits" value={formatNumber(totalHits)} tip="Sum of search result counts across all queries." />
            <StatCard label="Aliases" value={formatNumber(aliases.length)} tip="Identity aliases used for query expansion." />
            <StatCard
              label="Guard Rejects"
              value={formatNumber(indexlabSearchProfileQueryRejectBreakdown.ordered.length)}
              tip="Dropped query candidates (pruned + safety guard) before execution."
            />
            {isExecuted && sp.discovered_count !== undefined && (
              <StatCard label="URLs Discovered" value={formatNumber(sp.discovered_count)} tip="Total unique URLs found across all search queries." />
            )}
          </div>

          {/* Discovery Execution Summary (only when executed) */}
          {isExecuted && (sp.discovered_count !== undefined || sp.approved_count !== undefined) && (
            <div className="sf-surface-card p-4">
              <div className="text-xs font-medium sf-text-muted uppercase tracking-wider mb-3">Discovery Results</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold sf-text-primary">{formatNumber(sp.discovered_count || 0)}</div>
                  <div className="sf-text-caption sf-text-muted">URLs Discovered</div>
                </div>
                <div>
                  <div className="text-2xl font-bold sf-status-text-success">{formatNumber(sp.approved_count || 0)}</div>
                  <div className="sf-text-caption sf-text-muted">Approved Domain</div>
                </div>
                <div>
                  <div className="text-2xl font-bold sf-status-text-info">{formatNumber(sp.candidate_count || 0)}</div>
                  <div className="sf-text-caption sf-text-muted">Candidate URLs</div>
                </div>
                <div>
                  <div className="text-2xl font-bold sf-text-primary">{formatNumber(totalHits)}</div>
                  <div className="sf-text-caption sf-text-muted">Total Search Hits</div>
                </div>
              </div>
              {sp.discovered_count !== undefined && sp.approved_count !== undefined && sp.discovered_count > 0 && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 sf-text-caption sf-text-subtle mb-1">
                    Approval Rate
                    <Tip text="Percentage of discovered URLs on approved (official/review) domains." />
                  </div>
                  <ScoreBar value={sp.approved_count} max={sp.discovered_count} label={`${Math.round((sp.approved_count / sp.discovered_count) * 100)}%`} />
                </div>
              )}
            </div>
          )}

          {/* Coverage Section */}
          {coverage.totalNeeds > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium sf-text-primary">Field Coverage</span>
                <span className="sf-text-subtle sf-text-caption">{coverage.coveredNeeds} of {coverage.totalNeeds} needs covered by query targets</span>
              </div>
              <ScoreBar value={coverage.coveredNeeds} max={coverage.totalNeeds} />
              {coverage.gapFields.length > 0 && (
                <div className="px-3 py-2 sf-callout sf-callout-warning">
                  <div className="text-xs font-medium">
                    {coverage.gapFields.length} uncovered field{coverage.gapFields.length > 1 ? 's' : ''} with no query targeting them
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {coverage.gapFields.slice(0, 20).map((f: string) => (
                      <span key={f} className="px-1.5 py-0.5 sf-text-caption font-medium sf-chip-warning">{f}</span>
                    ))}
                    {coverage.gapFields.length > 20 && (
                      <span className="sf-text-caption">+{coverage.gapFields.length - 20} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Warning Banners */}
          {rows.length === 0 && sp.status !== 'pending' && (
            <div className="px-4 py-3 sf-callout sf-callout-warning">
              <div className="text-sm font-medium">No queries were generated</div>
              <div className="text-xs mt-1">
                Check NeedSet configuration or regenerate the search profile.
              </div>
            </div>
          )}
          {rows.length > 50 && (
            <div className="px-3 py-2 sf-callout sf-callout-info">
              <div className="text-xs font-medium">
                Large query set ({formatNumber(rows.length)} queries). Some may be redundant.
              </div>
            </div>
          )}

          {/* Hint Source Breakdown */}
          {Object.keys(hintSourceCounts).length > 0 && (
            <div className="sf-surface-elevated p-3 space-y-2">
              <div className="text-xs font-medium sf-text-muted uppercase tracking-wider flex items-center">
                Query Sources
                <Tip text="Breakdown of how queries were generated ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â deterministic field targeting, alias expansion, doc hints, or LLM planner." />
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(hintSourceCounts)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([source, count]) => (
                    <div key={source} className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 sf-text-caption font-medium ${hintSourceBadgeClass(source)}`}>{source}</span>
                      <span className="text-xs font-semibold sf-text-primary">{formatNumber(count as number)}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {/* Focus Fields */}
          {focusFields.length > 0 && (
            <div className="sf-surface-elevated p-3 space-y-2">
              <div className="text-xs font-medium sf-text-muted uppercase tracking-wider flex items-center">
                Focus Fields ({formatNumber(focusFields.length)})
                <Tip text="Fields identified as needing search attention, derived from the NeedSet missing/low-confidence list." />
              </div>
              <div className="flex flex-wrap gap-1">
                {focusFields.slice(0, 30).map((f) => (
                  <span key={f} className="px-1.5 py-0.5 sf-text-caption font-medium sf-chip-info">{f}</span>
                ))}
                {focusFields.length > 30 && (
                  <span className="sf-text-caption sf-text-subtle">+{focusFields.length - 30} more</span>
                )}
              </div>
            </div>
          )}

          {/* Identity & Aliases Section */}
          <div className="sf-surface-elevated p-3 space-y-2">
            <div className="text-xs font-medium sf-text-muted uppercase tracking-wider">Identity & Aliases</div>
            {sp.product_id && (
              <div className="text-sm font-semibold sf-text-primary">{sp.product_id}</div>
            )}
            <div className="flex flex-wrap gap-1">
              {aliases.length === 0 ? (
                <span className="text-xs sf-text-subtle">no aliases</span>
              ) : (
                aliases.slice(0, 20).map((row) => (
                  <span key={row.alias} className="inline-flex items-center gap-1 px-1.5 py-0.5 sf-text-caption font-medium sf-chip-info">
                    {row.alias}
                    {row.source && (
                      <span className={`px-1 py-0 sf-text-micro ${aliasSourceBadgeClass(row.source)}`}>{row.source}</span>
                    )}
                  </span>
                ))
              )}
            </div>
            {indexlabSearchProfileVariantGuardTerms.length > 0 && (
              <div className="pt-1">
                <div className="sf-text-caption sf-text-muted flex items-center mb-1">
                  Variant Guard Terms
                  <Tip text="Canonical identity/model tokens used to hard-reject off-model discovery queries." />
                </div>
                <div className="flex flex-wrap gap-1">
                  {indexlabSearchProfileVariantGuardTerms.map((term) => (
                    <span key={`variant-guard:${term}`} className="px-1.5 py-0.5 sf-text-caption font-medium sf-chip-success">
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Query Plan Table */}
          {rows.length > 0 && (
            <div className="sf-surface-elevated p-2 overflow-x-auto">
              <div className="text-xs font-semibold sf-text-primary mb-2">
                Query Plan ({formatNumber(rows.length)} rows)
              </div>
              <table className="min-w-full text-xs sf-table-shell">
                <thead>
                  <tr className="sf-table-head border-b sf-border-soft">
                    <th className="sf-table-head-cell">Query</th>
                    <th className="sf-table-head-cell w-20">Strategy</th>
                    <th className="sf-table-head-cell">Target Fields</th>
                    <th className="sf-table-head-cell w-20">Status</th>
                    <th className="sf-table-head-cell w-14 text-right">Hits</th>
                    <th className="sf-table-head-cell">Doc Hint</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 60).map((row, idx) => {
                    const strategy = deriveStrategy(row);
                    const status = deriveQueryStatus(row);
                    const fields = row.target_fields || [];
                    return (
                      <tr
                        key={`${row.query}-${idx}`}
                        className={`sf-table-row border-b sf-border-soft cursor-pointer ${
                          selectedQuery === row.query ? 'sf-table-row-active' : ''
                        }`}
                        onClick={() => setSelectedQuery(selectedQuery === row.query ? null : row.query)}
                      >
                        <td className="py-1.5 pr-3 font-mono truncate max-w-[32rem]" title={row.query}>{row.query}</td>
                        <td className="py-1.5 pr-3">
                          <span className={`px-1.5 py-0.5 sf-text-caption font-medium ${strategyBadgeClass(strategy)}`}>
                            {strategy === 'llm-planned' ? 'LLM' : 'Det.'}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <div className="flex flex-wrap gap-0.5">
                            {fields.slice(0, 3).map((f) => (
                              <span key={f} className="px-1 py-0 sf-text-nano sf-chip-success">{f}</span>
                            ))}
                            {fields.length > 3 && (
                              <span className="sf-text-nano sf-text-subtle">+{fields.length - 3}</span>
                            )}
                            {fields.length === 0 && <span className="sf-text-subtle">-</span>}
                          </div>
                        </td>
                        <td className="py-1.5 pr-3">
                          <span className={`px-1.5 py-0.5 sf-text-caption font-medium ${queryStatusBadgeClass(status)}`}>
                            {status}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-right">{formatNumber(Number(row.result_count || 0))}</td>
                        <td className="py-1.5 pr-3 sf-text-muted truncate max-w-[10rem]" title={row.doc_hint || ''}>{row.doc_hint || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 60 && (
                <div className="sf-text-caption sf-text-subtle mt-1 text-center">Showing first 60 of {formatNumber(rows.length)} rows</div>
              )}
            </div>
          )}

          {/* Query Detail Drawer */}
          {selectedPayload && (
            <QueryDetailDrawer payload={selectedPayload} onClose={() => setSelectedQuery(null)} />
          )}

          {/* Reject Logs (collapsible) */}
          {(indexlabSearchProfileQueryRejectBreakdown.ordered.length > 0 || indexlabSearchProfileAliasRejectRows.length > 0) && (
            <details
              open={showRejectLogs}
              onToggle={(e) => {
                const open = (e.target as HTMLDetailsElement).open;
                if (open !== showRejectLogs) toggleRejectLogs();
              }}
            >
              <summary className="sf-summary-toggle text-xs font-medium">
                Reject Logs
                <span className="ml-1 sf-text-caption sf-text-subtle">
                  ({formatNumber(indexlabSearchProfileQueryRejectBreakdown.ordered.length)} query + {formatNumber(indexlabSearchProfileAliasRejectRows.length)} alias)
                </span>
              </summary>
              <div className="mt-2 grid grid-cols-1 xl:grid-cols-2 gap-2">
                {/* Query Drop Log */}
                <div className="sf-surface-elevated p-2 overflow-x-auto">
                  <div className="text-xs font-semibold sf-text-primary flex items-center">
                    Query Drop Log ({formatNumber(indexlabSearchProfileQueryRejectBreakdown.ordered.length)})
                    <Tip text="Dropped query audit split into Safety Rejected (guard) vs Pruned (dedupe/cap)." />
                  </div>
                  <div className="mt-1 sf-text-label sf-text-muted flex flex-wrap gap-2">
                    <span className="px-1.5 py-0.5 sf-chip-danger">
                      safety {formatNumber(indexlabSearchProfileQueryRejectBreakdown.safety.length)}
                    </span>
                    <span className="px-1.5 py-0.5 sf-chip-warning">
                      pruned {formatNumber(indexlabSearchProfileQueryRejectBreakdown.pruned.length)}
                    </span>
                  </div>
                  <table className="mt-2 min-w-full text-xs sf-table-shell">
                    <thead>
                      <tr className="sf-table-head border-b sf-border-soft">
                        <th className="sf-table-head-cell">query</th>
                        <th className="sf-table-head-cell">source</th>
                        <th className="sf-table-head-cell">reason</th>
                        <th className="sf-table-head-cell">stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indexlabSearchProfileQueryRejectBreakdown.ordered.length === 0 && (
                        <tr>
                          <td className="py-2 sf-table-empty-state" colSpan={4}>no query rejects</td>
                        </tr>
                      )}
                      {indexlabSearchProfileQueryRejectBreakdown.ordered.slice(0, 40).map((row, idx) => {
                        const reason = normalizeToken(row.reason);
                        const stage = normalizeToken(row.stage);
                        const isSafety = (
                          stage === 'pre_execution_guard'
                          || reason.startsWith('missing_brand_token')
                          || reason.startsWith('missing_required_digit_group')
                          || reason.startsWith('foreign_model_token')
                        );
                        return (
                          <tr key={`query-reject:${row.query || row.reason || idx}`} className="sf-table-row border-b sf-border-soft">
                            <td className="py-1 pr-3 font-mono truncate max-w-[34rem]" title={row.query || row.detail || '-'}>
                              {row.query || '-'}
                            </td>
                            <td className="py-1 pr-3">{row.source || '-'}</td>
                            <td className="py-1 pr-3">
                              <span className={`px-1.5 py-0.5 ${
                                isSafety
                                  ? 'sf-chip-danger'
                                  : 'sf-chip-warning'
                              }`}>
                                {row.reason || '-'}
                              </span>
                            </td>
                            <td className="py-1 pr-3">{row.stage || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Alias Reject Log */}
                <div className="sf-surface-elevated p-2 overflow-x-auto">
                  <div className="text-xs font-semibold sf-text-primary flex items-center">
                    Alias Reject Log ({formatNumber(indexlabSearchProfileAliasRejectRows.length)})
                    <Tip text="Dropped deterministic alias audit (duplicate/empty/cap)." />
                  </div>
                  <table className="mt-2 min-w-full text-xs sf-table-shell">
                    <thead>
                      <tr className="sf-table-head border-b sf-border-soft">
                        <th className="sf-table-head-cell">alias</th>
                        <th className="sf-table-head-cell">source</th>
                        <th className="sf-table-head-cell">reason</th>
                        <th className="sf-table-head-cell">stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indexlabSearchProfileAliasRejectRows.length === 0 && (
                        <tr>
                          <td className="py-2 sf-table-empty-state" colSpan={4}>no alias rejects</td>
                        </tr>
                      )}
                      {indexlabSearchProfileAliasRejectRows.slice(0, 40).map((row, idx) => (
                        <tr key={`alias-reject:${row.alias || row.reason || idx}`} className="sf-table-row border-b sf-border-soft">
                          <td className="py-1 pr-3 font-mono">{row.alias || '-'}</td>
                          <td className="py-1 pr-3">{row.source || '-'}</td>
                          <td className="py-1 pr-3">{row.reason || '-'}</td>
                          <td className="py-1 pr-3">{row.stage || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          )}

          {/* Debug Section */}
          <details
            open={showDebug}
            onToggle={(e) => {
              const open = (e.target as HTMLDetailsElement).open;
              if (open !== showDebug) toggleDebug();
            }}
          >
            <summary className="sf-summary-toggle text-xs">
              Debug
            </summary>
            <div className="mt-2 space-y-3">
              {/* LLM Planner Debug */}
              {llmPlannerActive && (
                <div className="space-y-1">
                  <div className="sf-text-caption font-medium sf-text-muted uppercase">LLM Planner</div>
                  {sp.llm_query_model && (
                    <div className="sf-text-caption sf-text-muted">Model: <span className="font-mono">{sp.llm_query_model}</span></div>
                  )}
                  {Array.isArray(sp.llm_queries) && sp.llm_queries.length > 0 && (
                    <div>
                      <div className="sf-text-caption sf-text-subtle mb-1">LLM-Generated Queries ({sp.llm_queries.length})</div>
                      <div className="space-y-0.5">
                        {sp.llm_queries.slice(0, 20).map((q, i) => (
                          <div key={i} className="sf-text-caption font-mono sf-pre-block px-2 py-0.5">
                            {q?.query || JSON.stringify(q)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {sp.field_target_queries && Object.keys(sp.field_target_queries).length > 0 && (
                    <div>
                      <div className="sf-text-caption sf-text-subtle mb-1">Field Target Queries</div>
                      <pre className="sf-text-caption font-mono sf-pre-block p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
                        {JSON.stringify(sp.field_target_queries, null, 2)}
                      </pre>
                    </div>
                  )}
                  {sp.doc_hint_queries && sp.doc_hint_queries.length > 0 && (
                    <div>
                      <div className="sf-text-caption sf-text-subtle mb-1">Doc Hint Queries</div>
                      <pre className="sf-text-caption font-mono sf-pre-block p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
                        {JSON.stringify(sp.doc_hint_queries, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Runtime Knobs */}
              <div className="space-y-1">
                <div className="sf-text-caption font-medium sf-text-muted uppercase">Runtime Knobs</div>
                <div className="grid grid-cols-2 gap-1 sf-text-caption max-w-sm">
                  <span className="sf-text-muted">Search Provider</span>
                  <span className="font-mono sf-text-primary">{provider || '-'}</span>
                  <span className="sf-text-muted">LLM Query Planning</span>
                  <span className="font-mono sf-text-primary">{sp.llm_query_planning ? 'true' : 'false'} {llmPlannerActive && !sp.llm_query_planning ? '(derived: ON)' : ''}</span>
                  <span className="sf-text-muted">LLM Query Model</span>
                  <span className="font-mono sf-text-primary">{sp.llm_query_model || '-'}</span>
                  <span className="sf-text-muted">LLM SERP Triage</span>
                  <span className="font-mono sf-text-primary">{sp.llm_serp_triage ? 'enabled' : 'off'}</span>
                  <span className="sf-text-muted">SERP Triage Model</span>
                  <span className="font-mono sf-text-primary">{sp.llm_serp_triage_model || '-'}</span>
                  <span className="sf-text-muted">Profile Source</span>
                  <span className="font-mono sf-text-primary">{sp.source || sp.status || '-'}</span>
                </div>
              </div>

              {/* Query Guard Summary */}
              {sp.query_guard && (
                <div className="space-y-1">
                  <div className="sf-text-caption font-medium sf-text-muted uppercase">Query Guard</div>
                  <div className="grid grid-cols-2 gap-1 sf-text-caption max-w-sm">
                    <span className="sf-text-muted">Accepted</span>
                    <span className="font-mono sf-text-primary">{formatNumber(Number(sp.query_guard.accepted_query_count || sp.selected_query_count || 0))}</span>
                    <span className="sf-text-muted">Rejected</span>
                    <span className="font-mono sf-text-primary">{formatNumber(indexlabSearchProfileQueryRejectBreakdown.ordered.length)}</span>
                    <span className="sf-text-muted">Required Digit Groups</span>
                    <span className="font-mono sf-text-primary">{(sp.query_guard.required_digit_groups || []).length > 0 ? (sp.query_guard.required_digit_groups || []).join(', ') : '-'}</span>
                  </div>
                </div>
              )}

              {/* Raw JSON */}
              <div>
                <div className="sf-text-caption font-medium sf-text-muted uppercase mb-1">Raw SearchProfile JSON</div>
                <pre className="sf-text-caption font-mono sf-pre-block p-2 overflow-x-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(sp, null, 2)}
                </pre>
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
