import { useMemo } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { PrefetchLlmCall, SerpTriageResult, TriageCandidate, PrefetchLiveSettings } from '../types';
import { llmCallStatusBadgeClass, formatMs, triageDecisionBadgeClass, scoreBarSegments } from '../helpers';
import { KanbanLane, KanbanCard } from '../components/KanbanLane';
import { StackedScoreBar } from '../components/StackedScoreBar';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';

interface PrefetchSerpTriagePanelProps {
  calls: PrefetchLlmCall[];
  serpTriage?: SerpTriageResult[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 min-w-[8rem]">
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}

function CandidateDrawer({ candidate, onClose }: { candidate: TriageCandidate; onClose: () => void }) {
  const segments = scoreBarSegments(candidate.score_components);
  return (
    <DrawerShell title={candidate.title || candidate.url} subtitle={candidate.domain} onClose={onClose}>
      <DrawerSection title="URL">
        <a href={candidate.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all">{candidate.url}</a>
      </DrawerSection>
      {candidate.snippet && (
        <DrawerSection title="Snippet">
          <div className="text-xs text-gray-600 dark:text-gray-400">{candidate.snippet}</div>
        </DrawerSection>
      )}
      <DrawerSection title="Score Decomposition">
        <StackedScoreBar segments={segments} showLegend />
        <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
          <span className="text-gray-500">Total Score</span>
          <span className="font-mono font-semibold">{candidate.score.toFixed(3)}</span>
          <span className="text-gray-500">Decision</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium w-fit ${triageDecisionBadgeClass(candidate.decision)}`}>{candidate.decision}</span>
        </div>
      </DrawerSection>
      {candidate.rationale && (
        <DrawerSection title="Rationale">
          <div className="text-xs text-gray-600 dark:text-gray-400">{candidate.rationale}</div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}

export function PrefetchSerpTriagePanel({ calls, serpTriage, persistScope, liveSettings }: PrefetchSerpTriagePanelProps) {
  const [showScoreDecomposition, toggleScoreDecomposition] = usePersistedToggle('runtimeOps:serp:scoreDecomposition', false);

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
  const totalKept = triage.reduce((sum, t) => sum + t.kept_count, 0);
  const totalDropped = triage.reduce((sum, t) => sum + t.dropped_count, 0);

  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">SERP Triage</h3>
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No SERP triage calls yet. This LLM step scores and selects the best search result candidates.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">SERP Triage</h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            calls.some((c) => c.status === 'failed')
              ? 'bg-red-100 text-red-800'
              : 'bg-green-100 text-green-800'
          }`}>
            {calls.some((c) => c.status === 'failed') ? 'Error' : 'Done'}
          </span>
        )}
        {liveSettings && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            liveSettings.phase3LlmTriageEnabled
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
          }`}>
            LLM Triage: {liveSettings.phase3LlmTriageEnabled ? 'ON' : 'OFF'}
          </span>
        )}
        <button
          type="button"
          onClick={() => toggleScoreDecomposition()}
          className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline ml-auto"
        >
          {showScoreDecomposition ? 'Hide Scores' : 'Show Scores'}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {hasStructured && (
          <>
            <StatCard label="Kept" value={totalKept} />
            <StatCard label="Dropped" value={totalDropped} />
          </>
        )}
        <StatCard label="LLM Calls" value={calls.length} />
        {totalTokens > 0 && <StatCard label="Tokens" value={totalTokens.toLocaleString()} />}
        {totalDuration > 0 && <StatCard label="Duration" value={formatMs(totalDuration)} />}
      </div>

      {/* Per-query triage accordion with Kanban lanes */}
      {hasStructured && triage.map((t, ti) => {
        const queryKey = triageQueryKeys[ti] || `query-${ti}`;
        const isExpanded = triage.length === 1 || expandedQuery === queryKey;
        const kept = t.candidates.filter((c) => c.decision === 'keep');
        const maybe = t.candidates.filter((c) => c.decision === 'maybe');
        const dropped = t.candidates.filter((c) => c.decision === 'drop' || c.decision === 'skip');

        return (
          <div key={ti} className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
            {triage.length > 1 && (
              <button
                type="button"
                onClick={() => setExpandedQuery(isExpanded ? null : queryKey)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left"
              >
                <span className="text-[10px] text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                <span className="text-xs font-mono text-gray-900 dark:text-gray-100 flex-1 truncate">{t.query || 'All Results'}</span>
                <span className="text-[10px] text-green-600">Keep: {t.kept_count}</span>
                <span className="text-[10px] text-red-600">Drop: {t.dropped_count}</span>
              </button>
            )}
            {isExpanded && (
              <div className="p-3 flex gap-3 overflow-x-auto">
                <KanbanLane title="Keep" count={kept.length} badgeClass="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
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
                  {kept.length === 0 && <div className="text-[10px] text-gray-400 py-2 text-center">None</div>}
                </KanbanLane>
                <KanbanLane title="Maybe" count={maybe.length} badgeClass="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
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
                  {maybe.length === 0 && <div className="text-[10px] text-gray-400 py-2 text-center">None</div>}
                </KanbanLane>
                <KanbanLane title="Drop" count={dropped.length} badgeClass="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
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
                  {dropped.length === 0 && <div className="text-[10px] text-gray-400 py-2 text-center">None</div>}
                </KanbanLane>
              </div>
            )}
          </div>
        );
      })}

      {selectedCandidate && (
        <CandidateDrawer candidate={selectedCandidate} onClose={() => setSelectedCandidateKey(null)} />
      )}

      {/* Debug Section */}
      <details className="text-xs">
        <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          Debug: Raw Reranker Data
        </summary>
        <div className="mt-2 space-y-2">
          {calls.map((call, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${llmCallStatusBadgeClass(call.status)}`}>{call.status}</span>
                <span className="text-[10px] text-gray-400">{call.model}</span>
              </div>
              {call.prompt_preview && (
                <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.prompt_preview}</pre>
              )}
              {call.response_preview && (
                <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{call.response_preview}</pre>
              )}
            </div>
          ))}
          {hasStructured && (
            <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-40 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{JSON.stringify(triage, null, 2)}</pre>
          )}
        </div>
      </details>
    </div>
  );
}
