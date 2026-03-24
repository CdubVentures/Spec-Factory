import { useMemo } from 'react';
import { usePersistedToggle } from '../../../../stores/collapseStore';
import { usePersistedNullableTab, usePersistedExpandMap } from '../../../../stores/tabStore';
import type { PrefetchLlmCall, SerpTriageResult, TriageCandidate, PrefetchLiveSettings } from '../../types';
import { formatMs, triageDecisionBadgeClass, domainRoleBadgeClass, scoreBarSegments } from '../../helpers';
import { resolveIdentityBadge, resolveApprovalBadge } from '../../badgeRegistries';
import { KanbanLane, KanbanCard } from '../../components/KanbanLane';
import { StackedScoreBar } from '../../components/StackedScoreBar';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader';
import { Chip } from '../../../../shared/ui/feedback/Chip';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand';
import { ProgressRing } from '../../components/ProgressRing';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import { LlmCallCard } from '../../components/LlmCallCard';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat';
import {
  computeTriageDecisionCounts,
  computeTriageUniqueDomains,
  buildTriageDecisionSegments,
  buildTriageFunnelBullets,
} from '../../selectors/serpTriageHelpers.js';
import { PrefetchEmptyState } from './PrefetchEmptyState';
import type { RuntimeIdxBadge } from '../../types';

interface PrefetchSerpTriagePanelProps {
  calls: PrefetchLlmCall[];
  serpTriage?: SerpTriageResult[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
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
            {candidate.role && <Chip label={candidate.role} className={domainRoleBadgeClass(candidate.role)} />}
            {candidate.identity_prelim && <Chip label={candidate.identity_prelim} className={resolveIdentityBadge(candidate.identity_prelim)} />}
            {candidate.host_trust_class && <Chip label={candidate.host_trust_class.replace(/_/g, ' ')} className="sf-chip-info" />}
            {candidate.doc_kind_guess && <Chip label={candidate.doc_kind_guess.replace(/_/g, ' ')} className="sf-chip-accent" />}
          </div>
        </DrawerSection>
      )}
      {(candidate.triage_disposition || candidate.approval_bucket) && (
        <DrawerSection title="Routing">
          <div className="flex flex-wrap gap-1.5">
            {candidate.triage_disposition && <Chip label={candidate.triage_disposition.replace(/_/g, ' ')} className="sf-chip-accent" />}
            {candidate.approval_bucket && <Chip label={candidate.approval_bucket} className={resolveApprovalBadge(candidate.approval_bucket)} />}
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

export function PrefetchSerpTriagePanel({ calls, serpTriage, persistScope, idxRuntime }: PrefetchSerpTriagePanelProps) {
  const [showScoreDecomposition, , setShowScoreDecomposition] = usePersistedToggle('runtimeOps:serp:scoreDecomposition', false);
  const [kanbanView, , setKanbanView] = usePersistedToggle(`runtimeOps:serp:kanbanView:${persistScope}`, true);
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

  const funnel = useMemo(() => {
    for (const t of triage) {
      if (t.funnel) return t.funnel;
    }
    return null;
  }, [triage]);

  const counts = useMemo(() => computeTriageDecisionCounts(triage), [triage]);
  const uniqueDomains = useMemo(() => computeTriageUniqueDomains(triage), [triage]);
  const decisionSegments = useMemo(() => buildTriageDecisionSegments(counts), [counts]);
  const funnelBullets = useMemo(() => buildTriageFunnelBullets(triage, calls), [triage, calls]);
  const hasDecisions = counts.keep + counts.dropped_by_llm + counts.overflow_capped + counts.hard_drop > 0;

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
        <PrefetchEmptyState
          icon="&#9878;"
          heading="Waiting for SERP selection"
          description="Selection results will appear after search result candidates are sent to the LLM selector. Each URL is classified as approved (fetch now), candidate (backup), or reject (skip) based on product identity match, source authority, and field coverage signals."
        >
          <Chip label="LLM Selector" className="sf-chip-warning" />
        </PrefetchEmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ── Hero Band ── */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">SERP Selector</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; URL Selection</span>
          <Chip label={overallStatus.toUpperCase()} className={overallStatus === 'done' ? 'sf-chip-success' : overallStatus === 'error' ? 'sf-chip-danger' : 'sf-chip-neutral'} />
        </>}
        trailing={<>
          <Chip label="LLM Selector" className="sf-chip-warning" />
          {calls.length > 0 && calls[0].model && (
            <Chip label={calls[0].model} className="sf-chip-neutral" />
          )}
          {calls.length > 0 && calls[0].provider && (
            <Chip label={calls[0].provider} className="sf-chip-accent" />
          )}
          <Tip text="SERP Selector receives raw search results, dedupes across providers, hard-drops invalid/denied/utility URLs, classifies and caps candidates, then uses LLM to select the most relevant URLs for fetching." />
        </>}
        footer={<>
          {uniqueDomains > 0 && <span>domains <strong className="sf-text-primary">{uniqueDomains}</strong></span>}
          <span>llm calls <strong className="sf-text-primary">{calls.length}</strong></span>
          <span>queries triaged <strong className="sf-text-primary">{triage.length}</strong></span>
          {allDroppedQueries.length > 0 && <span>all-dropped queries <strong className="text-[var(--sf-state-error-fg)]">{allDroppedQueries.length}</strong></span>}
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        {/* Big stat numbers */}
        <HeroStatGrid columns={6}>
          <HeroStat value={funnel ? funnel.raw_input : totalCandidates} label="raw input" />
          <HeroStat value={counts.hard_drop || '-'} label="hard dropped" colorClass={counts.hard_drop > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'} />
          <HeroStat value={funnel ? funnel.candidates_sent_to_llm : counts.keep + counts.dropped_by_llm} label="sent to LLM" />
          <HeroStat value={counts.keep} label="kept" colorClass={counts.keep > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={counts.dropped_by_llm} label="dropped by LLM" colorClass={counts.dropped_by_llm > 0 ? 'text-[var(--sf-state-error-fg)]' : 'sf-text-muted'} />
          <HeroStat value={counts.overflow_capped || '-'} label="overflow capped" colorClass={counts.overflow_capped > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'} />
        </HeroStatGrid>

        {/* Narrative */}
        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          {funnel ? (<>
            <strong className="sf-text-primary not-italic">{funnel.raw_input}</strong> raw results
            {funnel.hard_drop_count > 0 && <>, <strong className="sf-text-primary not-italic">{funnel.hard_drop_count}</strong> hard-dropped</>}
            , <strong className="sf-text-primary not-italic">{funnel.candidates_sent_to_llm}</strong> sent to LLM
            {funnel.overflow_capped > 0 && <> (<strong className="sf-text-primary not-italic">{funnel.overflow_capped}</strong> overflow capped)</>}
            {counts.keep > 0 && <> &mdash; <strong className="sf-text-primary not-italic">{counts.keep}</strong> kept</>}
            {counts.dropped_by_llm > 0 && <>, <strong className="sf-text-primary not-italic">{counts.dropped_by_llm}</strong> dropped by LLM</>}
            {totalTokens > 0 && (
              <>. Used <strong className="sf-text-primary not-italic">{totalTokens.toLocaleString()}</strong> tokens in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>
            )}
            .
          </>) : (<>
            <strong className="sf-text-primary not-italic">{totalCandidates}</strong> URL{totalCandidates !== 1 ? 's' : ''} across <strong className="sf-text-primary not-italic">{triage.length}</strong> quer{triage.length === 1 ? 'y' : 'ies'}
            {counts.hard_drop > 0 && <> &mdash; <strong className="sf-text-primary not-italic">{counts.hard_drop}</strong> hard-dropped</>}
            {counts.keep > 0 && <>{counts.hard_drop > 0 ? ', ' : ' \u2014 '}<strong className="sf-text-primary not-italic">{counts.keep}</strong> kept</>}
            {counts.dropped_by_llm > 0 && <>, <strong className="sf-text-primary not-italic">{counts.dropped_by_llm}</strong> dropped by LLM</>}
            {counts.overflow_capped > 0 && <>, <strong className="sf-text-primary not-italic">{counts.overflow_capped}</strong> overflow capped</>}
            {totalTokens > 0 && (
              <>. Used <strong className="sf-text-primary not-italic">{totalTokens.toLocaleString()}</strong> tokens in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>
            )}
            .
          </>)}
        </div>
      </HeroBand>

      {/* ── Input Funnel ── */}
      {funnel && (
        <div>
          <SectionHeader>input funnel</SectionHeader>
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4">
            <div className="flex flex-col gap-1.5">
              {[
                { label: 'Raw results from search', count: funnel.raw_input, delta: null, tip: null },
                { label: 'After hard drop filter', count: funnel.candidates_after_hard_drop, delta: funnel.hard_drop_count > 0 ? `-${funnel.hard_drop_count} dropped` : null, tip: 'Removes malformed URLs, denied/blocked hosts, URLs in cooldown, and utility pages (login, cart, checkout, search results)' },
                { label: 'After URL normalization', count: funnel.candidates_classified, delta: funnel.canon_merge_count > 0 ? `-${funnel.canon_merge_count} merged` : null, tip: 'Frontier database merges URL variants that resolve to the same page (trailing slashes, redirects, param differences)' },
                { label: 'Sent to LLM', count: funnel.candidates_sent_to_llm, delta: funnel.overflow_capped > 0 ? `${funnel.overflow_capped} overflow capped` : null, tip: 'Priority-ranked candidates capped at 80 max. Official/support domains and multi-provider hits go first' },
                { label: 'Kept by LLM', count: counts.keep, delta: funnel.llm_model ? `by ${funnel.llm_model}` : null, tip: null },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 text-xs">
                  <span className="font-mono font-bold sf-text-primary w-8 text-right">{step.count}</span>
                  <span className="sf-text-muted">{step.label}</span>
                  {step.delta && <span className="sf-text-subtle italic">({step.delta})</span>}
                  {step.tip && <Tip text={step.tip} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
              const allCandidates = t.candidates;
              const kept = allCandidates.filter((c) => c.decision === 'keep');
              const droppedByLlm = allCandidates.filter((c) => c.decision !== 'keep' && c.decision !== 'hard_drop' && c.triage_disposition !== 'selector_input_capped');
              const hardDropped = allCandidates.filter((c) => c.decision === 'hard_drop');
              const overflowCapped = allCandidates.filter((c) => c.triage_disposition === 'selector_input_capped');
              const queryAllDropped = kept.length === 0 && allCandidates.length > 0;

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
                      <span className="sf-text-caption font-mono sf-text-subtle">{allCandidates.length} URLs</span>
                      <span className="sf-text-caption sf-status-text-success">Keep: {kept.length}</span>
                      <span className="sf-text-caption sf-status-text-danger">LLM drop: {droppedByLlm.length}</span>
                      {hardDropped.length > 0 && <span className="sf-text-caption sf-status-text-warning">Hard drop: {hardDropped.length}</span>}
                      {overflowCapped.length > 0 && <span className="sf-text-caption sf-text-subtle">Overflow: {overflowCapped.length}</span>}
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
                      <KanbanLane title="Dropped by LLM" count={droppedByLlm.length} badgeClass="sf-chip-danger">
                        {droppedByLlm.map((c, ci) => (
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
                        {droppedByLlm.length === 0 && <div className="sf-text-caption sf-text-subtle py-2 text-center">None</div>}
                      </KanbanLane>
                      {hardDropped.length > 0 && (
                        <KanbanLane title="Hard Dropped" count={hardDropped.length} badgeClass="sf-chip-warning">
                          {hardDropped.map((c, ci) => (
                            <KanbanCard
                              key={ci}
                              title={c.title || c.url}
                              domain={c.domain}
                              snippet={c.snippet}
                              score={0}
                              rationale={c.rationale}
                              onClick={() => setSelectedCandidateKey(
                                selectedCandidateKey === `${queryKey}::${c.url}` ? null : `${queryKey}::${c.url}`,
                              )}
                            />
                          ))}
                        </KanbanLane>
                      )}
                      {overflowCapped.length > 0 && (
                        <KanbanLane title="Overflow Capped" count={overflowCapped.length} badgeClass="sf-chip-neutral">
                          {overflowCapped.map((c, ci) => (
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
                            />
                          ))}
                        </KanbanLane>
                      )}
                    </div>
                  ) : isExpanded ? (
                    <div className={`overflow-x-auto border-t sf-border-soft ${selectedCandidate ? 'max-h-[50vh] overflow-y-auto' : ''}`}>
                      <table className="min-w-full text-xs">
                        <thead className="sf-surface-elevated sticky top-0">
                          <tr>
                            {['title', 'domain', 'role', 'identity', 'score', 'decision', 'drop reason'].map((h) => (
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
                              <td className="py-1.5 px-4">{c.role ? <Chip label={c.role} className={domainRoleBadgeClass(c.role)} /> : <span className="sf-text-subtle">-</span>}</td>
                              <td className="py-1.5 px-4">{c.identity_prelim ? <Chip label={c.identity_prelim} className={resolveIdentityBadge(c.identity_prelim)} /> : <span className="sf-text-subtle">-</span>}</td>
                              <td className="py-1.5 px-4 font-mono">{c.score.toFixed(3)}</td>
                              <td className="py-1.5 px-4">
                                <Chip label={c.decision} className={triageDecisionBadgeClass(c.decision)} />
                              </td>
                              <td className="py-1.5 px-4">
                                {c.decision === 'hard_drop' ? (
                                  <Chip label={(c.triage_disposition || 'hard drop').replace(/_/g, ' ')} className="sf-chip-warning" />
                                ) : c.triage_disposition === 'selector_input_capped' ? (
                                  <Chip label="overflow capped" className="sf-chip-neutral" />
                                ) : c.decision !== 'keep' ? (
                                  <Chip label="LLM rejected" className="sf-chip-danger" />
                                ) : (
                                  <span className="sf-text-subtle">-</span>
                                )}
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
          <CollapsibleSectionHeader isOpen={llmCallsOpen} onToggle={toggleLlmCallsOpen} summary={<>{calls.length} call{calls.length !== 1 ? 's' : ''}{totalTokens > 0 && <> &middot; {totalTokens.toLocaleString()} tok</>}{totalDuration > 0 && <> &middot; {formatMs(totalDuration)}</>}</>}>llm call details</CollapsibleSectionHeader>

          {llmCallsOpen && (
            <div className="mt-3 space-y-2">
              {calls.map((call, i) => (
                <LlmCallCard key={i} call={call} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Debug ── */}
      {hasStructured && (
        <DebugJsonDetails label="raw serp selector json" data={triage} />
      )}
    </div>
  );
}
