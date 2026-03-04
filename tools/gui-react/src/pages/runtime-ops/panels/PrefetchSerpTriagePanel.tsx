import { useMemo } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { PrefetchLlmCall, SerpTriageResult, TriageCandidate, PrefetchLiveSettings } from '../types';
import { llmCallStatusBadgeClass, formatMs, triageDecisionBadgeClass, scoreBarSegments } from '../helpers';
import { KanbanLane, KanbanCard } from '../components/KanbanLane';
import { StackedScoreBar } from '../components/StackedScoreBar';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { Tip } from '../../../components/common/Tip';
import { StatCard } from '../components/StatCard';
import { StageCard } from '../components/StageCard';
import { ProgressRing } from '../components/ProgressRing';
import {
  computeTriageDecisionCounts,
  computeTriageTopDomains,
  computeTriageUniqueDomains,
  buildTriageDecisionSegments,
  buildTriageFunnelBullets,
  buildTriageDomainDecisionBreakdown,
} from './serpTriageHelpers.js';

interface PrefetchSerpTriagePanelProps {
  calls: PrefetchLlmCall[];
  serpTriage?: SerpTriageResult[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
}

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
        <Tip text="The full URL that was evaluated during SERP triage." />
        <a href={candidate.url} target="_blank" rel="noreferrer" className="sf-link-accent sf-text-caption hover:underline break-all">{candidate.url}</a>
      </DrawerSection>
      {candidate.snippet && (
        <DrawerSection title="Snippet">
          <div className="sf-pre-block sf-text-caption rounded p-2 italic">
            &ldquo;{candidate.snippet}&rdquo;
          </div>
        </DrawerSection>
      )}
      <DrawerSection title="Score Decomposition">
        <Tip text="The triage score is composed of base relevance, evidence tier boost, product identity match, and any penalties. The stacked bar shows each component's contribution." />
        <StackedScoreBar segments={segments} showLegend />
        <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
          <span className="sf-text-subtle">Total Score</span>
          <span className="font-mono font-semibold">{candidate.score.toFixed(3)}</span>
          <span className="sf-text-subtle">Decision</span>
          <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium w-fit ${triageDecisionBadgeClass(candidate.decision)}`}>{candidate.decision}</span>
        </div>
      </DrawerSection>
      {candidate.rationale && (
        <DrawerSection title="Rationale">
          <Tip text="The LLM's explanation for why this URL was kept, maybe'd, or dropped." />
          <div className="sf-text-caption sf-text-muted">{candidate.rationale}</div>
        </DrawerSection>
      )}
      {call && (
        <DrawerSection title="LLM Context">
          <Tip text="Details about the LLM call that scored this candidate." />
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

export function PrefetchSerpTriagePanel({ calls, serpTriage, persistScope, liveSettings }: PrefetchSerpTriagePanelProps) {
  const triageEnabledLive = liveSettings?.phase3LlmTriageEnabled;
  const [showScoreDecomposition, toggleScoreDecomposition, setShowScoreDecomposition] = usePersistedToggle('runtimeOps:serp:scoreDecomposition', false);
  const [kanbanView, toggleKanbanView, setKanbanView] = usePersistedToggle(`runtimeOps:serp:kanbanView:${persistScope}`, true);

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
  const [expandedQuery, setExpandedQuery] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:serpTriage:expandedQuery:${persistScope}`,
    null,
    { validValues: triageQueryKeys },
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

  const counts = useMemo(() => computeTriageDecisionCounts(triage), [triage]);
  const topDomains = useMemo(() => computeTriageTopDomains(triage, 6), [triage]);
  const uniqueDomains = useMemo(() => computeTriageUniqueDomains(triage), [triage]);
  const decisionSegments = useMemo(() => buildTriageDecisionSegments(counts), [counts]);
  const funnelBullets = useMemo(() => buildTriageFunnelBullets(triage, calls), [triage, calls]);
  const domainBreakdown = useMemo(() => buildTriageDomainDecisionBreakdown(triage), [triage]);
  const hasDecisions = counts.keep + counts.maybe + counts.drop > 0;

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

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Empty state ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">
          SERP Triage
          <Tip text="SERP Triage uses an LLM to score and rank search result candidates. Each URL is evaluated for relevance, expected field coverage, and source tier quality before deciding keep, maybe, or drop." />
        </h3>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#9878;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for SERP triage</div>
          <p className="text-xs sf-text-subtle max-w-md leading-relaxed">
            Triage results will appear after the LLM scores and ranks search result candidates.
            Each URL is evaluated for relevance, expected field coverage, and source tier quality before deciding keep or drop.
          </p>
          {liveSettings?.phase3LlmTriageEnabled !== undefined && (
            <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${liveSettings.phase3LlmTriageEnabled ? 'sf-chip-neutral' : 'sf-chip-danger'}`}>
              LLM Triage: {liveSettings.phase3LlmTriageEnabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      {/* A) Header Row with model/provider badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold sf-text-primary">
          SERP Triage
          <Tip text="SERP Triage uses an LLM to score and rank search result candidates. Each URL is evaluated for relevance, expected field coverage, and source tier quality before deciding keep, maybe, or drop." />
        </h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${
            calls.some((c) => c.status === 'failed')
              ? 'sf-chip-danger'
              : 'sf-chip-success'
          }`}>
            {calls.some((c) => c.status === 'failed') ? 'Error' : 'Done'}
          </span>
        )}
        {calls.length > 0 && calls[0].model && (
          <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-neutral font-mono">
            {calls[0].model}
          </span>
        )}
        {calls.length > 0 && calls[0].provider && (
          <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-accent">
            {calls[0].provider}
          </span>
        )}
        {triageEnabledLive !== undefined && (
          <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${
            triageEnabledLive
              ? 'sf-chip-warning'
              : 'sf-chip-danger'
          }`}>
            LLM Triage: {triageEnabledLive ? 'ON' : 'OFF'}
          </span>
        )}
        <div className="flex items-center gap-2 ml-auto">
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
      </div>

      {/* B) "All Dropped" warning banners */}
      {allDroppedQueries.length > 0 && (
        <div className="space-y-1.5">
          {allDroppedQueries.map((t, i) => (
            <div key={i} className="px-4 py-2.5 sf-callout sf-callout-warning">
              <div className="text-xs font-medium">
                All candidates dropped for query
              </div>
              <div className="sf-text-caption mt-0.5">
                Query &ldquo;{t.query}&rdquo; had {t.candidates.length} candidate{t.candidates.length !== 1 ? 's' : ''} but none survived triage.
                This may indicate overly restrictive scoring or low-quality search results for this query.
              </div>
            </div>
          ))}
        </div>
      )}

      {/* C) Decision Pipeline (StageCard) */}
      {hasStructured && (
        <div className="sf-surface-card p-3">
          <div className="sf-text-caption uppercase tracking-wider sf-text-subtle font-medium mb-2">
            Decision Pipeline
            <Tip text="Shows the triage funnel: how many total candidates entered, how many were kept, maybe'd, or dropped after LLM scoring." />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <StageCard
              label="Candidates"
              value={totalCandidates}
              className="sf-callout sf-callout-neutral"
            />
            <span className="sf-text-subtle sf-text-caption shrink-0">&rarr;</span>
            <StageCard
              label="Keep"
              value={counts.keep}
              className="sf-callout-success"
            />
            <span className="sf-text-subtle sf-text-caption shrink-0">&rarr;</span>
            <StageCard
              label="Maybe"
              value={counts.maybe}
              className="sf-callout-warning"
            />
            <span className="sf-text-subtle sf-text-caption shrink-0">&rarr;</span>
            <StageCard
              label="Drop"
              value={counts.drop}
              className="sf-callout-danger"
            />
          </div>
        </div>
      )}

      {/* D) Hero Card with ProgressRing + funnel narrative + Top Domains */}
      {hasStructured && totalCandidates > 0 && (() => {
        return (
          <div className="sf-surface-card p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-sm sf-text-muted">
                  {totalCandidates} candidate{totalCandidates !== 1 ? 's' : ''} across {triage.length} quer{triage.length === 1 ? 'y' : 'ies'}.
                  {counts.keep > 0 && <> <strong>{counts.keep}</strong> kept,</>}
                  {counts.maybe > 0 && <> <strong>{counts.maybe}</strong> maybe,</>}
                  {counts.drop > 0 && <> <strong>{counts.drop}</strong> dropped.</>}
                </div>
                {funnelBullets.length > 0 && (
                  <div className="mt-3 pt-3 border-t sf-border-soft">
                    <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider mb-1.5">
                      Why these decisions?
                      <Tip text="A narrative explaining the triage funnel: how many candidates were scored, how many survived, and which model performed the scoring." />
                    </div>
                    <ul className="space-y-1">
                      {funnelBullets.map((b, i) => (
                        <li key={i} className="text-xs sf-text-muted flex items-start gap-1.5">
                          <span className="sf-status-text-success mt-0.5 shrink-0">&#8226;</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {topDomains.length > 0 && (
                  <div className="mt-3 pt-3 border-t sf-border-soft">
                    <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider mb-1.5">
                      Top Domains
                      <Tip text="The most frequently appearing domains across all triage candidates. Click a domain to filter the Kanban/table view to only show candidates from that domain." />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {topDomains.map((d) => (
                        <button
                          key={d.domain}
                          type="button"
                          onClick={() => setDomainFilter(domainFilter === d.domain ? null : d.domain)}
                          className={`px-2 py-0.5 rounded-full sf-text-caption font-medium transition-colors ${
                            domainFilter === d.domain
                              ? 'sf-chip-info sf-icon-badge'
                              : 'sf-chip-info'
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
              </div>
              {counts.keep > 0 && (
                <ProgressRing
                  numerator={counts.keep}
                  denominator={totalCandidates}
                  label="Keep Rate"
                  strokeWidth={6}
                />
              )}
            </div>
          </div>
        );
      })()}

      {/* E) StatCards Row */}
      <div className="flex items-center gap-3 flex-wrap">
        {hasStructured && (
          <>
            <StatCard label="Kept" value={counts.keep} tip="Candidates that passed triage and will proceed to fetching. These URLs are expected to contain relevant spec information." />
            <StatCard label="Maybe" value={counts.maybe} tip="Borderline candidates that may be fetched if budget allows or in later rounds." />
            <StatCard label="Dropped" value={counts.drop} tip="Candidates removed during triage because they scored below the relevance threshold." />
            {uniqueDomains > 0 && <StatCard label="Domains" value={uniqueDomains} tip="How many different websites contributed candidates to the triage pool." />}
          </>
        )}
        <StatCard label="LLM Calls" value={calls.length} tip="Number of LLM calls made to score and rank candidates." />
        {totalTokens > 0 && <StatCard label="Tokens" value={totalTokens.toLocaleString()} tip="LLM tokens consumed (input + output) for triage scoring." />}
        {totalDuration > 0 && <StatCard label="Duration" value={formatMs(totalDuration)} tip="Wall-clock time for the triage scoring step." />}
      </div>

      {/* F) Decision Distribution Bar */}
      {hasDecisions && (
        <div>
          <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider mb-1.5">
            Decision Distribution
            <Tip text="Visual breakdown of how triage candidates were classified. Keep = will be fetched. Maybe = borderline, may be fetched if budget allows. Drop = filtered out." />
          </div>
          <StackedScoreBar segments={decisionSegments} showLegend />
        </div>
      )}

      {/* G) Per-query triage accordion with Kanban lanes or Table */}
      {hasStructured && (
        <div className="space-y-2">
          <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider">
            Per-Query Triage
            <Tip text="Each query sent to the LLM for triage is shown as an expandable section. Click to see individual candidates, their scores, and triage decisions. Use the Table/Kanban toggle in the header to switch between views." />
          </div>
          {triage.map((t, ti) => {
            const queryKey = triageQueryKeys[ti] || `query-${ti}`;
            const isExpanded = triage.length === 1 || expandedQuery === queryKey;
            const allCandidates = domainFilter
              ? t.candidates.filter((c) => c.domain === domainFilter)
              : t.candidates;
            const kept = allCandidates.filter((c) => c.decision === 'keep');
            const maybe = allCandidates.filter((c) => c.decision === 'maybe');
            const dropped = allCandidates.filter((c) => c.decision === 'drop' || c.decision === 'skip');
            const queryDomainBreakdown = domainBreakdown;
            const queryAllDropped = t.kept_count === 0 && t.candidates.length > 0;

            return (
              <div key={ti} className="sf-surface-elevated rounded overflow-hidden">
                {triage.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExpandedQuery(isExpanded ? null : queryKey)}
                    className="w-full flex items-center gap-2 px-3 py-2 sf-table-head sf-row-hoverable text-left"
                  >
                    <span className="sf-text-caption sf-text-subtle">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                    <span className="text-xs font-mono sf-text-primary flex-1 truncate">{t.query || 'All Results'}</span>
                    <span className="sf-text-caption font-mono sf-text-subtle">{t.candidates.length} candidates</span>
                    <span className="sf-text-caption sf-status-text-success">Keep: {t.kept_count}</span>
                    <span className="sf-text-caption sf-status-text-danger">Drop: {t.dropped_count}</span>
                    {queryAllDropped && (
                      <span className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-warning">
                        All Dropped
                      </span>
                    )}
                  </button>
                )}
                {isExpanded && kanbanView ? (
                  <div className="p-3 flex gap-3 overflow-x-auto">
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
                            selectedCandidateKey === `${queryKey}::${c.url}`
                              ? null
                              : `${queryKey}::${c.url}`,
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
                            selectedCandidateKey === `${queryKey}::${c.url}`
                              ? null
                              : `${queryKey}::${c.url}`,
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
                            selectedCandidateKey === `${queryKey}::${c.url}`
                              ? null
                              : `${queryKey}::${c.url}`,
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
                  <div className={`overflow-x-auto ${selectedCandidate ? 'max-h-[50vh] overflow-y-auto' : ''}`}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="sf-table-head">
                          <th className="sf-table-head-cell text-left px-2 py-1">Title</th>
                          <th className="sf-table-head-cell text-left px-2 py-1">Domain</th>
                          <th className="sf-table-head-cell text-left px-2 py-1 w-20">Score</th>
                          <th className="sf-table-head-cell text-left px-2 py-1">Decision</th>
                          <th className="sf-table-head-cell text-left px-2 py-1">Rationale</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allCandidates.map((c, ci) => (
                          <tr
                            key={ci}
                            className={`border-t sf-border-soft sf-table-row cursor-pointer ${selectedCandidateKey === `${queryKey}::${c.url}` ? 'sf-table-row-active' : ''}`}
                            onClick={() => setSelectedCandidateKey(
                              selectedCandidateKey === `${queryKey}::${c.url}`
                                ? null
                                : `${queryKey}::${c.url}`,
                            )}
                          >
                            <td className="px-2 py-1 sf-text-primary truncate max-w-[16rem]">{c.title || '-'}</td>
                            <td className="px-2 py-1 sf-text-subtle">{c.domain}</td>
                            <td className="px-2 py-1 font-mono">{c.score.toFixed(3)}</td>
                            <td className="px-2 py-1">
                              <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${triageDecisionBadgeClass(c.decision)}`}>{c.decision}</span>
                            </td>
                            <td className="px-2 py-1 sf-text-subtle truncate max-w-[14rem]">{c.rationale || '-'}</td>
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
      )}

      {/* H) Candidate Detail Drawer */}
      {selectedCandidate && (
        <CandidateDrawer
          candidate={selectedCandidate}
          call={calls[0]}
          onClose={() => setSelectedCandidateKey(null)}
        />
      )}

      {/* I) LLM Call Details (structured, collapsible) */}
      {calls.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer sf-summary-toggle font-medium">
            LLM Call Details ({calls.length} call{calls.length > 1 ? 's' : ''})
            <Tip text="Detailed breakdown of each LLM call made during triage scoring. Expand to see prompts, responses, token usage, and timing." />
          </summary>
          <div className="mt-2 space-y-2">
            {calls.map((call, i) => (
              <div key={i} className="sf-surface-elevated rounded p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full sf-text-caption font-medium ${llmCallStatusBadgeClass(call.status)}`}>
                    {call.status}
                  </span>
                  {call.model && (
                    <span className="sf-text-caption font-mono sf-text-muted">{call.model}</span>
                  )}
                  {call.provider && (
                    <span className="sf-text-caption sf-text-subtle">{call.provider}</span>
                  )}
                  <span className="ml-auto sf-text-caption sf-text-subtle">
                    {call.tokens ? `${call.tokens.input}+${call.tokens.output} tok` : ''}
                    {call.duration_ms ? ` | ${formatMs(call.duration_ms)}` : ''}
                  </span>
                </div>
                {call.error && (
                  <div className="sf-text-caption sf-status-text-danger mt-1">{call.error}</div>
                )}
                {call.prompt_preview && (
                  <details className="mt-2">
                    <summary className="sf-text-caption font-medium sf-summary-toggle uppercase cursor-pointer">Prompt</summary>
                    <pre className="sf-pre-block sf-text-caption font-mono rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap mt-1">{call.prompt_preview}</pre>
                  </details>
                )}
                {call.response_preview && (
                  <details className="mt-1">
                    <summary className="sf-text-caption font-medium sf-summary-toggle uppercase cursor-pointer">Response</summary>
                    <pre className="sf-pre-block sf-text-caption font-mono rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap mt-1">{call.response_preview}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* J) Debug: Raw JSON */}
      {hasStructured && (
        <details className="text-xs">
          <summary className="cursor-pointer sf-summary-toggle">
            Debug: Raw Triage JSON
          </summary>
          <pre className="mt-2 sf-pre-block sf-text-caption font-mono rounded p-3 overflow-x-auto overflow-y-auto max-h-60 whitespace-pre-wrap">
            {JSON.stringify(triage, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
