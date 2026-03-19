import { useMemo } from 'react';
import { usePersistedToggle } from '../../../../stores/collapseStore';
import { usePersistedNullableTab, usePersistedExpandMap } from '../../../../stores/tabStore';
import type { PrefetchLlmCall, SerpTriageResult, TriageCandidate, PrefetchLiveSettings } from '../../types';
import { llmCallStatusBadgeClass, formatMs, triageDecisionBadgeClass, scoreBarSegments } from '../../helpers';
import { KanbanLane, KanbanCard } from '../../components/KanbanLane';
import { StackedScoreBar } from '../../components/StackedScoreBar';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { ProgressRing } from '../../components/ProgressRing';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import {
  computeTriageDecisionCounts,
  computeTriageTopDomains,
  computeTriageUniqueDomains,
  buildTriageDecisionSegments,
  buildTriageFunnelBullets,
  buildTriageDomainDecisionBreakdown,
} from '../../selectors/serpTriageHelpers.js';
import type { RuntimeIdxBadge } from '../../types';

interface PrefetchSerpTriagePanelProps {
  calls: PrefetchLlmCall[];
  serpTriage?: SerpTriageResult[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
}

/* ── Theme-aligned helpers ── */

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

function roleBadgeClass(role: string): string {
  if (role === 'manufacturer') return 'sf-chip-success';
  if (role === 'review' || role === 'lab_review') return 'sf-chip-info';
  if (role === 'retail') return 'sf-chip-warning';
  if (role === 'database' || role === 'spec_database') return 'sf-chip-accent';
  if (role === 'community' || role === 'forum') return 'sf-chip-neutral';
  return 'sf-chip-neutral';
}

function identityBadgeClass(identity: string): string {
  if (identity === 'exact') return 'sf-chip-success';
  if (identity === 'family') return 'sf-chip-info';
  if (identity === 'variant') return 'sf-chip-warning';
  if (identity === 'multi_model') return 'sf-chip-danger';
  if (identity === 'off_target') return 'sf-chip-danger';
  return 'sf-chip-neutral';
}

function approvalBadgeClass(bucket: string): string {
  return bucket === 'approved' ? 'sf-chip-success' : 'sf-chip-neutral';
}

/* ── Candidate Detail Drawer ── */

function CandidateDrawer({
  candidate,
  call,
  onClose,
}: {
  candidate: TriageCandidate;
  call?: PrefetchLlmCall;
  onClose: () => void;
}) {
  const segments = scoreBarSegments(candidate.score_components);
  return (
    <DrawerShell title={candidate.title || candidate.url} subtitle={candidate.domain} onClose={onClose}>
      <DrawerSection title="URL">
        <a href={candidate.url} target="_blank" rel="noreferrer" className="sf-link-accent sf-text-caption hover:underline break-all">{candidate.url}</a>
      </DrawerSection>
      {candidate.snippet && (
        <DrawerSection title="Snippet">
          <div className="sf-pre-block sf-text-caption rounded-sm p-2 italic">
            &ldquo;{candidate.snippet}&rdquo;
          </div>
        </DrawerSection>
      )}
      <DrawerSection title="Score Decomposition">
        <StackedScoreBar segments={segments} showLegend />
        <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
          <span className="sf-text-subtle">Total Score</span>
          <span className="font-mono font-semibold">{candidate.score.toFixed(3)}</span>
          <span className="sf-text-subtle">Decision</span>
          <span><Chip label={candidate.decision} className={triageDecisionBadgeClass(candidate.decision)} /></span>
        </div>
      </DrawerSection>
      {(candidate.role || candidate.identity_prelim || candidate.host_trust_class || candidate.doc_kind_guess) && (
        <DrawerSection title="Classification">
          <div className="flex flex-wrap gap-1.5">
            {candidate.role && <Chip label={candidate.role} className={roleBadgeClass(candidate.role)} />}
            {candidate.identity_prelim && <Chip label={candidate.identity_prelim} className={identityBadgeClass(candidate.identity_prelim)} />}
            {candidate.host_trust_class && <Chip label={candidate.host_trust_class.replace(/_/g, ' ')} className="sf-chip-info" />}
            {candidate.doc_kind_guess && <Chip label={candidate.doc_kind_guess.replace(/_/g, ' ')} className="sf-chip-accent" />}
          </div>
        </DrawerSection>
      )}
      {(candidate.primary_lane !== null || candidate.triage_disposition || candidate.approval_bucket) && (
        <DrawerSection title="Routing">
          <div className="flex flex-wrap gap-1.5">
            {candidate.primary_lane !== null && <Chip label={`lane ${candidate.primary_lane}`} className="sf-chip-info" />}
            {candidate.triage_disposition && <Chip label={candidate.triage_disposition.replace(/_/g, ' ')} className="sf-chip-accent" />}
            {candidate.approval_bucket && <Chip label={candidate.approval_bucket} className={approvalBadgeClass(candidate.approval_bucket)} />}
          </div>
        </DrawerSection>
      )}
      {candidate.rationale && (
        <DrawerSection title="Rationale">
          <div className="sf-text-caption sf-text-muted">{candidate.rationale}</div>
        </DrawerSection>
      )}
      {call && (
        <DrawerSection title="LLM Context">
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span className="sf-text-subtle">Model</span>
            <span className="font-mono">{call.model || '-'}</span>
            <span className="sf-text-subtle">Provider</span>
            <span className="font-mono">{call.provider || '-'}</span>
            {call.tokens && (
              <>
                <span className="sf-text-subtle">Tokens</span>
                <span className="font-mono">{call.tokens.input}+{call.tokens.output}</span>
              </>
            )}
            {call.duration_ms > 0 && (
              <>
                <span className="sf-text-subtle">Duration</span>
                <span className="font-mono">{formatMs(call.duration_ms)}</span>
              </>
            )}
          </div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}

/* ── Main Panel ── */

export function PrefetchSerpTriagePanel({ calls, serpTriage, persistScope, liveSettings, idxRuntime }: PrefetchSerpTriagePanelProps) {
  const [showScoreDecomposition, toggleScoreDecomposition, setShowScoreDecomposition] = usePersistedToggle('runtimeOps:serp:scoreDecomposition', false);
  const [kanbanView, toggleKanbanView, setKanbanView] = usePersistedToggle(`runtimeOps:serp:kanbanView:${persistScope}`, true);
  const [llmCallsOpen, toggleLlmCallsOpen] = usePersistedToggle(`runtimeOps:serpTriage:llmCalls:${persistScope}`, false);

  const triage = serpTriage || [];
  const triageQueryKeys = useMemo(
    () => triage.map((row, index) => row.query || `query-${index}`),
    [triage],
  );
  const candidateValues = useMemo(
    () => triage.flatMap((row, index) => {
      const rowKey = triageQueryKeys[index] || `query-${index}`;
      return row.candidates.map((candidate) => `${rowKey}::${candidate.url}`);
    }),
    [triage, triageQueryKeys],
  );
  const [expandedQueries, toggleExpandedQuery, replaceExpandedQueries] = usePersistedExpandMap(
    `runtimeOps:prefetch:serpTriage:expandedQueries:${persistScope}`,
  );
  const [selectedCandidateKey, setSelectedCandidateKey] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:serpTriage:selectedCandidate:${persistScope}`,
    null,
    { validValues: candidateValues },
  );
  const selectedCandidate = useMemo(() => {
    if (!selectedCandidateKey) return null;
    for (let index = 0; index < triage.length; index += 1) {
      const row = triage[index];
      const rowKey = triageQueryKeys[index] || `query-${index}`;
      for (const candidate of row.candidates) {
        if (`${rowKey}::${candidate.url}` === selectedCandidateKey) return candidate;
      }
    }
    return null;
  }, [selectedCandidateKey, triage, triageQueryKeys]);

  const hasStructured = triage.length > 0;
  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);
  const totalCandidates = triage.reduce((sum, t) => sum + t.candidates.length, 0);
  const hasFailed = calls.some((c) => c.status === 'failed');
  const overallStatus = hasFailed ? 'error' : hasStructured ? 'done' : 'pending';

  const counts = useMemo(() => computeTriageDecisionCounts(triage), [triage]);
  const topDomains = useMemo(() => computeTriageTopDomains(triage, 6), [triage]);
  const uniqueDomains = useMemo(() => computeTriageUniqueDomains(triage), [triage]);
  const decisionSegments = useMemo(() => buildTriageDecisionSegments(counts), [counts]);
  const funnelBullets = useMemo(() => buildTriageFunnelBullets(triage, calls), [triage, calls]);
  const domainBreakdown = useMemo(() => buildTriageDomainDecisionBreakdown(triage), [triage]);
  const hasDecisions = counts.keep + counts.maybe + counts.drop > 0;

  const approvedCount = useMemo(() => {
    let count = 0;
    for (const t of triage) {
      for (const c of t.candidates) {
        if (c.approval_bucket === 'approved') count += 1;
      }
    }
    return count;
  }, [triage]);

  const candidateCount = totalCandidates - approvedCount;

  const domainFilterValues = useMemo(
    () => topDomains.map((d) => d.domain),
    [topDomains],
  );
  const [domainFilter, setDomainFilter] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:serpTriage:domainFilter:${persistScope}`,
    null,
    { validValues: domainFilterValues },
  );

  const allDroppedQueries = useMemo(
    () => triage.filter((t) => t.kept_count === 0 && t.candidates.length > 0),
    [triage],
  );

  /* ── Empty State ── */
  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-5 p-5 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">SERP Selector</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#9878;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for SERP selection</div>
          <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">
            Selection results will appear after search result candidates are sent to the LLM selector.
            Each URL is classified as approved (fetch now), candidate (backup), or reject (skip)
            based on product identity match, source authority, and field coverage signals.
          </p>
          <Chip label="LLM Selector" className="sf-chip-warning" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ── Hero Band ── */}
      <div className="sf-surface-elevated rounded-sm border sf-border-soft px-7 py-6 space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
          <div className="flex items-baseline gap-3">
            <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">SERP Selector</span>
            <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; URL Selection</span>
            <Chip label={overallStatus.toUpperCase()} className={overallStatus === 'done' ? 'sf-chip-success' : overallStatus === 'error' ? 'sf-chip-danger' : 'sf-chip-neutral'} />
          </div>
          <div className="flex items-center gap-2">
            <Chip label="LLM Selector" className="sf-chip-warning" />
            {calls.length > 0 && calls[0].model && (
              <Chip label={calls[0].model} className="sf-chip-neutral" />
            )}
            {calls.length > 0 && calls[0].provider && (
              <Chip label={calls[0].provider} className="sf-chip-accent" />
            )}
            <Tip text="LLM-based URL selector that decides which search results are worth fetching. Classifies each URL as approved (fetch now), candidate (backup), or reject (skip)." />
          </div>
        </div>

        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        {/* Big stat numbers */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-6 mb-5">
          <div>
            <div className="text-4xl font-bold text-[var(--sf-token-accent)] leading-none tracking-tight">{totalCandidates}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">candidates</div>
          </div>
          <div>
            <div className={`text-4xl font-bold leading-none tracking-tight ${counts.keep > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'}`}>{counts.keep}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">kept</div>
          </div>
          <div>
            <div className={`text-4xl font-bold leading-none tracking-tight ${counts.maybe > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'}`}>{counts.maybe}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">maybe</div>
          </div>
          <div>
            <div className={`text-4xl font-bold leading-none tracking-tight ${counts.drop > 0 ? 'text-[var(--sf-state-error-fg)]' : 'sf-text-muted'}`}>{counts.drop}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">dropped</div>
          </div>
          <div>
            <div className={`text-4xl font-bold leading-none tracking-tight ${approvedCount > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'}`}>{approvedCount}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">approved</div>
          </div>
          <div>
            <div className={`text-4xl font-bold leading-none tracking-tight ${candidateCount > 0 ? 'text-[var(--sf-token-accent)]' : 'sf-text-muted'}`}>{candidateCount}</div>
            <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] sf-text-muted">candidate</div>
          </div>
        </div>

        {/* Narrative */}
        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          <strong className="sf-text-primary not-italic">{totalCandidates}</strong> candidate{totalCandidates !== 1 ? 's' : ''} across <strong className="sf-text-primary not-italic">{triage.length}</strong> quer{triage.length === 1 ? 'y' : 'ies'}
          {counts.keep > 0 && <> &mdash; <strong className="sf-text-primary not-italic">{counts.keep}</strong> kept</>}
          {counts.maybe > 0 && <>, <strong className="sf-text-primary not-italic">{counts.maybe}</strong> maybe</>}
          {counts.drop > 0 && <>, <strong className="sf-text-primary not-italic">{counts.drop}</strong> dropped</>}
          {approvedCount > 0 && <> &mdash; <strong className="sf-text-primary not-italic">{approvedCount}</strong> approved, <strong className="sf-text-primary not-italic">{candidateCount}</strong> candidate</>}
          {totalTokens > 0 && (
            <>. Used <strong className="sf-text-primary not-italic">{totalTokens.toLocaleString()}</strong> tokens in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>
          )}
          .
        </div>

        {/* Inline stats row */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted pt-3.5 mt-3.5 border-t sf-border-soft">
          {uniqueDomains > 0 && <span>domains <strong className="sf-text-primary">{uniqueDomains}</strong></span>}
          <span>llm calls <strong className="sf-text-primary">{calls.length}</strong></span>
          <span>queries triaged <strong className="sf-text-primary">{triage.length}</strong></span>
          {allDroppedQueries.length > 0 && <span>all-dropped queries <strong className="text-[var(--sf-state-error-fg)]">{allDroppedQueries.length}</strong></span>}
        </div>
      </div>

      {/* ── All-Dropped Warnings ── */}
      {allDroppedQueries.length > 0 && (
        <div className="space-y-1.5">
          {allDroppedQueries.map((t, i) => (
            <div key={i} className="px-4 py-3.5 rounded-sm border border-[var(--sf-state-warning-border)] bg-[var(--sf-state-warning-bg)]">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl leading-none">{'\u26a0'}</span>
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--sf-state-warning-fg)]">
                    All candidates dropped for query
                  </div>
                  <div className="mt-1 text-xs sf-text-muted">
                    &ldquo;{t.query}&rdquo; had {t.candidates.length} candidate{t.candidates.length !== 1 ? 's' : ''} but none survived triage.
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Decision Distribution ── */}
      {hasDecisions && (
        <div>
          <SectionHeader>decision distribution</SectionHeader>
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 space-y-3">
            <StackedScoreBar segments={decisionSegments} showLegend />
            {counts.keep > 0 && (
              <div className="flex items-center gap-4 pt-3 border-t sf-border-soft">
                <ProgressRing
                  numerator={counts.keep}
                  denominator={totalCandidates}
                  label="Keep Rate"
                  strokeWidth={6}
                />
                <div className="flex-1">
                  {funnelBullets.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">why these decisions?</div>
                      <ul className="space-y-1">
                        {funnelBullets.map((b, i) => (
                          <li key={i} className="text-xs sf-text-muted flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0 text-[var(--sf-state-success-fg)]">{'\u2022'}</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Top Domains ── */}
      {topDomains.length > 0 && (
        <div>
          <SectionHeader>top domains</SectionHeader>
          <div className="flex flex-wrap gap-1.5">
            {topDomains.map((d) => (
              <button
                key={d.domain}
                type="button"
                onClick={() => setDomainFilter(domainFilter === d.domain ? null : d.domain)}
                className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-[0.04em] border-[1.5px] border-current transition-colors ${
                  domainFilter === d.domain ? 'sf-chip-info sf-icon-badge' : 'sf-chip-info'
                }`}
              >
                {d.domain} ({d.count})
              </button>
            ))}
            {domainFilter && (
              <button
                type="button"
                onClick={() => setDomainFilter(null)}
                className="sf-text-caption sf-status-text-danger hover:underline ml-1"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Per-Query Triage ── */}
      {hasStructured && (
        <div>
          <div className="flex items-baseline gap-2 pt-2 pb-1.5 mb-3 border-b-[1.5px] border-[var(--sf-token-text-primary)]">
            <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary">
              per-query triage &middot; {triage.length} quer{triage.length === 1 ? 'y' : 'ies'}
            </span>
            {triage.length > 1 && (() => {
              const allExpanded = triage.every((_, ti) => expandedQueries[triageQueryKeys[ti]]);
              return (
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    for (const key of triageQueryKeys) {
                      next[key] = !allExpanded;
                    }
                    replaceExpandedQueries(next);
                  }}
                  className="px-2 py-0.5 rounded sf-text-caption font-medium sf-icon-button hover:sf-primary-button transition-colors"
                >
                  {allExpanded ? 'Close All' : 'Open All'}
                </button>
              );
            })()}
            <span className="flex-1" />
            {hasStructured && (
              <div className="inline-flex items-center gap-1 rounded p-0.5 sf-surface-panel">
                <button
                  type="button"
                  onClick={() => setKanbanView(false)}
                  className={`px-2 py-1 rounded sf-text-caption font-medium transition-colors ${
                    !kanbanView ? 'sf-primary-button' : 'sf-icon-button'
                  }`}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setKanbanView(true)}
                  className={`px-2 py-1 rounded sf-text-caption font-medium transition-colors ${
                    kanbanView ? 'sf-primary-button' : 'sf-icon-button'
                  }`}
                >
                  Kanban
                </button>
              </div>
            )}
            <div className="inline-flex items-center gap-1 rounded p-0.5 sf-surface-panel">
              <button
                type="button"
                onClick={() => setShowScoreDecomposition(false)}
                className={`px-2 py-1 rounded sf-text-caption font-medium transition-colors ${
                  !showScoreDecomposition ? 'sf-primary-button' : 'sf-icon-button'
                }`}
              >
                Scores Off
              </button>
              <button
                type="button"
                onClick={() => setShowScoreDecomposition(true)}
                className={`px-2 py-1 rounded sf-text-caption font-medium transition-colors ${
                  showScoreDecomposition ? 'sf-primary-button' : 'sf-icon-button'
                }`}
              >
                Scores On
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {triage.map((t, ti) => {
              const queryKey = triageQueryKeys[ti] || `query-${ti}`;
              const isExpanded = triage.length === 1 || Boolean(expandedQueries[queryKey]);
              const allCandidates = domainFilter
                ? t.candidates.filter((c) => c.domain === domainFilter)
                : t.candidates;
              const kept = allCandidates.filter((c) => c.decision === 'keep');
              const maybe = allCandidates.filter((c) => c.decision === 'maybe');
              const dropped = allCandidates.filter((c) => c.decision === 'drop' || c.decision === 'skip');
              const queryAllDropped = t.kept_count === 0 && t.candidates.length > 0;

              return (
                <div key={ti} className="sf-surface-elevated rounded-sm overflow-hidden border sf-border-soft">
                  {triage.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleExpandedQuery(queryKey)}
                      className="w-full flex items-center gap-2 px-5 py-2.5 hover:sf-surface-elevated text-left cursor-pointer"
                    >
                      <span className="sf-text-caption sf-text-subtle">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                      <span className="text-xs font-mono sf-text-primary flex-1 truncate">{t.query || 'All Results'}</span>
                      <span className="sf-text-caption font-mono sf-text-subtle">{t.candidates.length} candidates</span>
                      <span className="sf-text-caption sf-status-text-success">Keep: {t.kept_count}</span>
                      <span className="sf-text-caption sf-status-text-danger">Drop: {t.dropped_count}</span>
                      {queryAllDropped && <Chip label="all dropped" className="sf-chip-warning" />}
                    </button>
                  )}
                  {isExpanded && kanbanView ? (
                    <div className="p-3 flex gap-3 overflow-x-auto border-t sf-border-soft">
                      <KanbanLane title="Keep" count={kept.length} badgeClass="sf-chip-success">
                        {kept.map((c, ci) => (
                          <KanbanCard
                            key={ci}
                            title={c.title}
                            domain={c.domain}
                            snippet={c.snippet}
                            score={c.score}
                            rationale={c.rationale}
                            onClick={() => setSelectedCandidateKey(
                              selectedCandidateKey === `${queryKey}::${c.url}` ? null : `${queryKey}::${c.url}`,
                            )}
                          >
                            {showScoreDecomposition && (
                              <StackedScoreBar segments={scoreBarSegments(c.score_components)} className="mt-1" />
                            )}
                          </KanbanCard>
                        ))}
                        {kept.length === 0 && <div className="sf-text-caption sf-text-subtle py-2 text-center">None</div>}
                      </KanbanLane>
                      <KanbanLane title="Maybe" count={maybe.length} badgeClass="sf-chip-warning">
                        {maybe.map((c, ci) => (
                          <KanbanCard
                            key={ci}
                            title={c.title}
                            domain={c.domain}
                            snippet={c.snippet}
                            score={c.score}
                            rationale={c.rationale}
                            onClick={() => setSelectedCandidateKey(
                              selectedCandidateKey === `${queryKey}::${c.url}` ? null : `${queryKey}::${c.url}`,
                            )}
                          >
                            {showScoreDecomposition && (
                              <StackedScoreBar segments={scoreBarSegments(c.score_components)} className="mt-1" />
                            )}
                          </KanbanCard>
                        ))}
                        {maybe.length === 0 && <div className="sf-text-caption sf-text-subtle py-2 text-center">None</div>}
                      </KanbanLane>
                      <KanbanLane title="Drop" count={dropped.length} badgeClass="sf-chip-danger">
                        {dropped.map((c, ci) => (
                          <KanbanCard
                            key={ci}
                            title={c.title}
                            domain={c.domain}
                            snippet={c.snippet}
                            score={c.score}
                            rationale={c.rationale}
                            onClick={() => setSelectedCandidateKey(
                              selectedCandidateKey === `${queryKey}::${c.url}` ? null : `${queryKey}::${c.url}`,
                            )}
                          >
                            {showScoreDecomposition && (
                              <StackedScoreBar segments={scoreBarSegments(c.score_components)} className="mt-1" />
                            )}
                          </KanbanCard>
                        ))}
                        {dropped.length === 0 && <div className="sf-text-caption sf-text-subtle py-2 text-center">None</div>}
                      </KanbanLane>
                    </div>
                  ) : isExpanded ? (
                    <div className={`overflow-x-auto border-t sf-border-soft ${selectedCandidate ? 'max-h-[50vh] overflow-y-auto' : ''}`}>
                      <table className="min-w-full text-xs">
                        <thead className="sf-surface-elevated sticky top-0">
                          <tr>
                            {['title', 'domain', 'role', 'identity', 'score', 'decision'].map((h) => (
                              <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {allCandidates.map((c, ci) => (
                            <tr
                              key={ci}
                              className={`border-b sf-border-soft hover:sf-surface-elevated cursor-pointer ${selectedCandidateKey === `${queryKey}::${c.url}` ? 'sf-callout sf-callout-info' : ''}`}
                              onClick={() => setSelectedCandidateKey(
                                selectedCandidateKey === `${queryKey}::${c.url}` ? null : `${queryKey}::${c.url}`,
                              )}
                            >
                              <td className="py-1.5 px-4 sf-text-primary truncate max-w-[16rem]">{c.title || '-'}</td>
                              <td className="py-1.5 px-4 sf-text-subtle">{c.domain}</td>
                              <td className="py-1.5 px-4">{c.role ? <Chip label={c.role} className={roleBadgeClass(c.role)} /> : <span className="sf-text-subtle">-</span>}</td>
                              <td className="py-1.5 px-4">{c.identity_prelim ? <Chip label={c.identity_prelim} className={identityBadgeClass(c.identity_prelim)} /> : <span className="sf-text-subtle">-</span>}</td>
                              <td className="py-1.5 px-4 font-mono">{c.score.toFixed(3)}</td>
                              <td className="py-1.5 px-4">
                                <Chip label={c.decision} className={triageDecisionBadgeClass(c.decision)} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Candidate Detail Drawer ── */}
      {selectedCandidate && (
        <CandidateDrawer
          candidate={selectedCandidate}
          call={calls[0]}
          onClose={() => setSelectedCandidateKey(null)}
        />
      )}

      {/* ── LLM Call Details (collapsible) ── */}
      {calls.length > 0 && (
        <div>
          <div
            onClick={toggleLlmCallsOpen}
            className="flex items-baseline gap-2 pt-2 pb-1.5 border-b-[1.5px] border-[var(--sf-token-text-primary)] cursor-pointer select-none"
          >
            <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary flex-1">llm call details</span>
            <span className="text-[11px] font-mono sf-text-subtle">
              {calls.length} call{calls.length !== 1 ? 's' : ''}
              {totalTokens > 0 && <> &middot; {totalTokens.toLocaleString()} tok</>}
              {totalDuration > 0 && <> &middot; {formatMs(totalDuration)}</>}
              {' '}&middot; {llmCallsOpen ? 'collapse \u25B4' : 'expand \u25BE'}
            </span>
          </div>

          {llmCallsOpen && (
            <div className="mt-3 space-y-2">
              {calls.map((call, i) => (
                <div key={i} className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-3.5 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Chip label={call.status} className={llmCallStatusBadgeClass(call.status)} />
                    {call.model && <span className="text-[11px] font-mono sf-text-muted">{call.model}</span>}
                    {call.provider && <span className="text-[11px] font-mono sf-text-subtle">{call.provider}</span>}
                    <span className="ml-auto flex items-baseline gap-3 text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted">
                      {call.tokens && <span>tok <strong className="sf-text-primary">{call.tokens.input}+{call.tokens.output}</strong></span>}
                      {call.duration_ms !== undefined && <span>dur <strong className="sf-text-primary">{formatMs(call.duration_ms)}</strong></span>}
                    </span>
                  </div>
                  {call.error && (
                    <div className="px-3 py-2 rounded-sm border border-[var(--sf-state-error-border)] bg-[var(--sf-state-error-bg)] text-xs text-[var(--sf-state-error-fg)]">
                      {call.error}
                    </div>
                  )}
                  {call.prompt_preview && (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">prompt</div>
                      <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded-sm p-3 font-mono text-[11px] sf-pre-block">{call.prompt_preview}</pre>
                    </div>
                  )}
                  {call.response_preview && (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">response</div>
                      <pre className="max-h-32 overflow-x-auto overflow-y-auto whitespace-pre-wrap rounded-sm p-3 font-mono text-[11px] sf-pre-block">{call.response_preview}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Debug ── */}
      {hasStructured && (
        <details className="text-xs">
          <summary className="cursor-pointer sf-summary-toggle flex items-baseline gap-2 pb-1.5 border-b border-dashed sf-border-soft select-none">
            <span className="text-[10px] font-semibold font-mono sf-text-subtle tracking-[0.04em] uppercase">debug &middot; raw serp selector json</span>
          </summary>
          <pre className="mt-3 sf-pre-block text-xs font-mono rounded-sm p-4 overflow-x-auto overflow-y-auto max-h-[25rem] whitespace-pre-wrap break-all">
            {JSON.stringify(triage, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
