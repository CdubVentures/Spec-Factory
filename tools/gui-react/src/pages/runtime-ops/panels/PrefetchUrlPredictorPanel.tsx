import { useMemo } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { PrefetchLlmCall, UrlPredictionsData, UrlPrediction, PrefetchLiveSettings } from '../types';
import { llmCallStatusBadgeClass, formatMs, triageDecisionBadgeClass, riskFlagBadgeClass } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';
import { StackedScoreBar } from '../components/StackedScoreBar';
import { KanbanLane, KanbanCard } from '../components/KanbanLane';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { Tip } from '../../../components/common/Tip';
import { StatCard } from '../components/StatCard';
import { StageCard } from '../components/StageCard';
import { ProgressRing } from '../components/ProgressRing';
import {
  computePredictionDecisionCounts,
  computeTopPredictionDomains,
  computeUniquePredictionDomains,
  buildPredictionDecisionSegments,
  computeFieldCoverageMatrix,
  computeAveragePayoff,
  computeRiskFlagDistribution,
  buildPredictorFunnelBullets,
} from './urlPredictorHelpers.js';

interface PrefetchUrlPredictorPanelProps {
  calls: PrefetchLlmCall[];
  urlPredictions?: UrlPredictionsData | null;
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
}

// ── Shared sub-components ──




// ── Detail Drawer ──

function PredictionDetailDrawer({
  prediction,
  call,
  onClose,
}: {
  prediction: UrlPrediction;
  call?: PrefetchLlmCall;
  onClose: () => void;
}) {
  return (
    <DrawerShell title="URL Prediction Detail" subtitle={prediction.domain} onClose={onClose}>
      <DrawerSection title="Predicted Payoff">
        <ScoreBar value={prediction.predicted_payoff} max={100} label={String(Math.round(prediction.predicted_payoff))} />
      </DrawerSection>

      <DrawerSection title="Decision">
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${triageDecisionBadgeClass(prediction.decision)}`}>
          {prediction.decision}
        </span>
      </DrawerSection>

      <DrawerSection title="Target Fields">
        <div className="flex flex-wrap gap-1">
          {prediction.target_fields.length > 0 ? prediction.target_fields.map((field) => (
            <span key={field} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              {field}
            </span>
          )) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">No target fields</span>
          )}
        </div>
      </DrawerSection>

      <DrawerSection title="Risk Flags">
        {prediction.risk_flags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {prediction.risk_flags.map((flag) => (
              <span key={flag} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${riskFlagBadgeClass(flag)}`}>
                {flag}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-gray-500 dark:text-gray-400">No risk flags detected</span>
        )}
      </DrawerSection>

      <DrawerSection title="URL">
        <a href={prediction.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all">
          {prediction.url}
        </a>
      </DrawerSection>

      {call && (
        <DrawerSection title="LLM Context">
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span className="text-gray-500">Model</span>
            <span className="font-mono">{call.model || '-'}</span>
            <span className="text-gray-500">Provider</span>
            <span className="font-mono">{call.provider || '-'}</span>
            {call.tokens && (
              <>
                <span className="text-gray-500">Tokens</span>
                <span className="font-mono">{call.tokens.input}+{call.tokens.output}</span>
              </>
            )}
            {call.duration_ms > 0 && (
              <>
                <span className="text-gray-500">Duration</span>
                <span className="font-mono">{formatMs(call.duration_ms)}</span>
              </>
            )}
          </div>
        </DrawerSection>
      )}
    </DrawerShell>
  );
}

// ── Main Panel ──

export function PrefetchUrlPredictorPanel({ calls, urlPredictions, persistScope, liveSettings }: PrefetchUrlPredictorPanelProps) {
  const predictions = urlPredictions?.predictions || [];
  const hasStructured = urlPredictions !== null && urlPredictions !== undefined;
  const totalTokens = calls.reduce((sum, c) => sum + (c.tokens?.input ?? 0) + (c.tokens?.output ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + (c.duration_ms ?? 0), 0);

  const counts = useMemo(() => computePredictionDecisionCounts(predictions), [predictions]);
  const topDomains = useMemo(() => computeTopPredictionDomains(predictions, 6), [predictions]);
  const uniqueDomains = useMemo(() => computeUniquePredictionDomains(predictions), [predictions]);
  const segments = useMemo(() => buildPredictionDecisionSegments(counts), [counts]);
  const avgPayoff = useMemo(() => computeAveragePayoff(predictions), [predictions]);
  const riskDistribution = useMemo(() => computeRiskFlagDistribution(predictions), [predictions]);
  const funnelBullets = useMemo(
    () => buildPredictorFunnelBullets(predictions, urlPredictions?.remaining_budget ?? 0),
    [predictions, urlPredictions?.remaining_budget],
  );
  const coverageMatrix = useMemo(() => computeFieldCoverageMatrix(predictions), [predictions]);

  const totalRiskFlags = Object.values(riskDistribution).reduce((sum: number, v) => sum + (v as number), 0);
  const urlsWithRisk = predictions.filter((p) => p.risk_flags.length > 0).length;

  const [viewMode, toggleViewMode] = usePersistedToggle(`runtimeOps:prefetch:urlPredictor:kanban:${persistScope}`, false);
  const [showHeatmap, toggleHeatmap] = usePersistedToggle(`runtimeOps:prefetch:urlPredictor:heatmap:${persistScope}`, false);

  const urlValues = useMemo(() => predictions.map((p) => p.url), [predictions]);
  const [selectedUrl, setSelectedUrl] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:urlPredictor:selectedUrl:${persistScope}`,
    null,
    { validValues: urlValues },
  );
  const selectedPrediction = useMemo(
    () => (selectedUrl ? predictions.find((p) => p.url === selectedUrl) ?? null : null),
    [predictions, selectedUrl],
  );

  const [activeDomain, setActiveDomain] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:urlPredictor:domainFilter:${persistScope}`,
    null,
    { validValues: topDomains.map((d) => d.domain) },
  );

  const filteredPredictions = useMemo(
    () => (activeDomain ? predictions.filter((p) => p.domain === activeDomain) : predictions),
    [predictions, activeDomain],
  );

  // ── Empty state ──
  if (!hasStructured && calls.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">URL Predictor</h3>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#127919;</div>
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">Waiting for URL predictions</div>
          <p className="text-xs text-gray-400 dark:text-gray-500 max-w-md leading-relaxed">
            Predictions will appear after the URL Predictor LLM evaluates candidate URLs from search results.
            It scores which URLs will yield the most missing spec fields under the current fetch budget and risk constraints.
          </p>
          {liveSettings?.phase2LlmEnabled !== undefined && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${liveSettings.phase2LlmEnabled ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'}`}>
              LLM: {liveSettings.phase2LlmEnabled ? 'Enabled' : 'Disabled'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      {/* A) Header Row */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          URL Predictor
          <Tip text="The URL Predictor LLM evaluates candidate URLs from search results and predicts which ones will yield the most missing spec fields under the current fetch budget." />
        </h3>
        {calls.length > 0 && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${llmCallStatusBadgeClass(calls[0].status)}`}>
            {calls[0].status}
          </span>
        )}
        {calls.length > 0 && calls[0].model && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 font-mono">
            {calls[0].model}
          </span>
        )}
        {liveSettings?.phase2LlmEnabled !== undefined && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
            liveSettings.phase2LlmEnabled
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            LLM: {liveSettings.phase2LlmEnabled ? 'ON' : 'OFF'}
          </span>
        )}
        {predictions.length > 0 && (
          <button
            onClick={() => toggleViewMode()}
            className="ml-auto px-2 py-0.5 rounded text-[10px] font-medium border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {viewMode ? 'Table' : 'Kanban'}
          </button>
        )}
      </div>

      {/* B) Storyline Pipeline Card */}
      {hasStructured && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-2">
            Decision Pipeline
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <StageCard
              label="Budget"
              value={(urlPredictions?.remaining_budget ?? 0) + counts.fetch}
              className="border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-100"
            />
            <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
            <StageCard
              label="Predicted"
              value={predictions.length}
              className="border-blue-200 text-blue-800 bg-blue-50 dark:border-blue-800 dark:text-blue-200 dark:bg-blue-900/20"
            />
            <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
            <StageCard
              label="Fetch"
              value={counts.fetch}
              className="border-emerald-200 text-emerald-800 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:bg-emerald-900/20"
            />
            <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
            <StageCard
              label="Later"
              value={counts.later}
              className="border-amber-200 text-amber-800 bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:bg-amber-900/20"
            />
            <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
            <StageCard
              label="Skip"
              value={counts.skip}
              className="border-red-200 text-red-800 bg-red-50 dark:border-red-800 dark:text-red-200 dark:bg-red-900/20"
            />
          </div>
          {funnelBullets.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Why these URLs?
                <Tip text="Narrative summary of the URL prediction step. The predictor evaluates candidate URLs by predicted field coverage payoff vs. risk." />
              </div>
              <ul className="space-y-1">
                {funnelBullets.map((b, i) => (
                  <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                    <span className="text-emerald-500 mt-0.5 shrink-0">&#8226;</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* C) Hero Card with ProgressRing + Top Domains */}
      {predictions.length > 0 && (() => {
        return (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Prediction Summary
                </div>
                <ul className="space-y-1">
                  {funnelBullets.slice(0, 3).map((b, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1.5">
                      <span className="text-blue-500 mt-0.5 shrink-0">&#8226;</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {counts.fetch > 0 && (
                <ProgressRing
                  numerator={counts.fetch}
                  denominator={predictions.length}
                  label="Fetch Rate"
                />
              )}
            </div>
            {topDomains.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Top Domains
                </div>
                <div className="flex flex-wrap gap-1">
                  {topDomains.map((d) => (
                    <button
                      key={d.domain}
                      onClick={() => setActiveDomain(activeDomain === d.domain ? null : d.domain)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                        activeDomain === d.domain
                          ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700'
                          : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {d.domain} ({d.count})
                    </button>
                  ))}
                  {activeDomain && (
                    <button
                      onClick={() => setActiveDomain(null)}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium text-red-600 dark:text-red-400 hover:underline"
                    >
                      clear
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* D) StatCards Row */}
      {hasStructured && (
        <div className="flex items-center gap-3 flex-wrap">
          <StatCard label="Predictions" value={predictions.length} tip="Total candidate URLs evaluated by the URL Predictor LLM." />
          <StatCard label="Fetch" value={counts.fetch} tip="URLs selected for immediate fetching." />
          <StatCard label="Later" value={counts.later} tip="URLs deferred for possible fetch in future rounds." />
          <StatCard label="Skip" value={counts.skip} tip="URLs rejected due to risk flags, low payoff, or redundant coverage." />
          <StatCard label="Budget Left" value={urlPredictions!.remaining_budget} tip="Fetch slots still available under budget and pacing constraints." />
          <StatCard label="Avg Payoff" value={avgPayoff} tip="Mean predicted payoff (0-100) across all candidates." />
          {uniqueDomains > 0 && <StatCard label="Domains" value={uniqueDomains} tip="How many different domains are represented." />}
          {totalTokens > 0 && <StatCard label="Tokens" value={totalTokens.toLocaleString()} tip="LLM tokens consumed (input + output)." />}
          {totalDuration > 0 && <StatCard label="Duration" value={formatMs(totalDuration)} tip="Wall-clock time for the prediction step." />}
        </div>
      )}

      {/* E) Decision Distribution */}
      {predictions.length > 0 && (
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
            Decision Distribution
            <Tip text="Breakdown of how the URL Predictor classified each candidate URL. Fetch = immediate download, Later = deferred, Skip = rejected." />
          </div>
          <StackedScoreBar segments={segments} showLegend />
        </div>
      )}

      {/* F) Risk Flag Summary */}
      {totalRiskFlags > 0 && (
        <div className="px-3 py-2 rounded bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800">
          <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
            {totalRiskFlags} risk flag{totalRiskFlags !== 1 ? 's' : ''} detected across {urlsWithRisk} URL{urlsWithRisk !== 1 ? 's' : ''}
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(riskDistribution).map(([flag, count]) => (
              <span key={flag} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${riskFlagBadgeClass(flag)}`}>
                {flag} ({count})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* G) Candidates Table or Kanban */}
      {filteredPredictions.length > 0 && !viewMode && (
        <div className={`border border-gray-200 dark:border-gray-700 rounded overflow-hidden overflow-x-auto ${selectedPrediction ? 'max-h-[50vh] overflow-y-auto' : ''}`}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2 font-medium">URL</th>
                <th className="text-left px-3 py-2 font-medium">Domain</th>
                <th className="text-left px-3 py-2 font-medium w-24">Payoff</th>
                <th className="text-left px-3 py-2 font-medium">Target Fields</th>
                <th className="text-left px-3 py-2 font-medium">Risk</th>
                <th className="text-left px-3 py-2 font-medium">Decision</th>
              </tr>
            </thead>
            <tbody>
              {filteredPredictions.map((p, i) => (
                <tr
                  key={i}
                  onClick={() => setSelectedUrl(selectedUrl === p.url ? null : p.url)}
                  className={`border-t border-gray-100 dark:border-gray-700/50 cursor-pointer ${
                    selectedUrl === p.url
                      ? 'bg-sky-50 dark:bg-sky-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'
                  }`}
                >
                  <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100 truncate max-w-[16rem]" title={p.url}>{p.url}</td>
                  <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{p.domain}</td>
                  <td className="px-3 py-1.5">
                    <ScoreBar value={p.predicted_payoff} max={100} label={String(Math.round(p.predicted_payoff))} />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-0.5">
                      {p.target_fields.slice(0, 4).map((f) => (
                        <span key={f} className="px-1 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">{f}</span>
                      ))}
                      {p.target_fields.length > 4 && (
                        <span className="text-[9px] text-gray-400">+{p.target_fields.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap gap-0.5">
                      {p.risk_flags.map((f) => (
                        <span key={f} className={`px-1 py-0.5 rounded text-[9px] font-medium ${riskFlagBadgeClass(f)}`}>{f}</span>
                      ))}
                      {p.risk_flags.length === 0 && <span className="text-gray-400 text-[10px]">-</span>}
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${triageDecisionBadgeClass(p.decision)}`}>{p.decision}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredPredictions.length > 0 && viewMode && (() => {
        const fetchPreds = filteredPredictions.filter((p) => p.decision === 'fetch');
        const laterPreds = filteredPredictions.filter((p) => p.decision === 'later');
        const skipPreds = filteredPredictions.filter((p) => p.decision !== 'fetch' && p.decision !== 'later');
        return (
          <div className="flex gap-3 overflow-x-auto">
            <KanbanLane title="Fetch" count={fetchPreds.length} badgeClass="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              {fetchPreds.map((p, i) => (
                <KanbanCard
                  key={i}
                  title={p.url.replace(/^https?:\/\//, '').slice(0, 50)}
                  domain={p.domain}
                  score={p.predicted_payoff / 100}
                  onClick={() => setSelectedUrl(selectedUrl === p.url ? null : p.url)}
                >
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {p.target_fields.slice(0, 3).map((f) => (
                      <span key={f} className="px-1 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">{f}</span>
                    ))}
                    {p.target_fields.length > 3 && (
                      <span className="text-[9px] text-gray-400">+{p.target_fields.length - 3}</span>
                    )}
                  </div>
                  {p.risk_flags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {p.risk_flags.map((f) => (
                        <span key={f} className={`px-1 py-0.5 rounded text-[9px] font-medium ${riskFlagBadgeClass(f)}`}>{f}</span>
                      ))}
                    </div>
                  )}
                </KanbanCard>
              ))}
            </KanbanLane>
            <KanbanLane title="Later" count={laterPreds.length} badgeClass="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              {laterPreds.map((p, i) => (
                <KanbanCard
                  key={i}
                  title={p.url.replace(/^https?:\/\//, '').slice(0, 50)}
                  domain={p.domain}
                  score={p.predicted_payoff / 100}
                  onClick={() => setSelectedUrl(selectedUrl === p.url ? null : p.url)}
                >
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {p.target_fields.slice(0, 3).map((f) => (
                      <span key={f} className="px-1 py-0.5 rounded text-[9px] bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">{f}</span>
                    ))}
                    {p.target_fields.length > 3 && (
                      <span className="text-[9px] text-gray-400">+{p.target_fields.length - 3}</span>
                    )}
                  </div>
                </KanbanCard>
              ))}
            </KanbanLane>
            <KanbanLane title="Skip" count={skipPreds.length} badgeClass="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
              {skipPreds.map((p, i) => (
                <KanbanCard
                  key={i}
                  title={p.url.replace(/^https?:\/\//, '').slice(0, 50)}
                  domain={p.domain}
                  score={p.predicted_payoff / 100}
                  onClick={() => setSelectedUrl(selectedUrl === p.url ? null : p.url)}
                >
                  {p.risk_flags.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {p.risk_flags.map((f) => (
                        <span key={f} className={`px-1 py-0.5 rounded text-[9px] font-medium ${riskFlagBadgeClass(f)}`}>{f}</span>
                      ))}
                    </div>
                  )}
                </KanbanCard>
              ))}
            </KanbanLane>
          </div>
        );
      })()}

      {/* H) Detail Drawer */}
      {selectedPrediction && (
        <PredictionDetailDrawer
          prediction={selectedPrediction}
          call={calls[0]}
          onClose={() => setSelectedUrl(null)}
        />
      )}

      {/* I) Coverage Heatmap */}
      {coverageMatrix.fields.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => toggleHeatmap()}
              className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
            >
              <span className="text-[10px]">{showHeatmap ? '&#9660;' : '&#9654;'}</span>
              URL x Field Coverage
              <Tip text="Heatmap showing which fields each URL targets. Brighter cells indicate higher predicted payoff for that field." />
            </button>
          </div>
          {showHeatmap && (
            <div className="overflow-x-auto">
              <table className="text-[9px]">
                <thead>
                  <tr>
                    <th className="px-1 py-1 text-left font-medium text-gray-500">URL</th>
                    {coverageMatrix.fields.map((f) => (
                      <th key={f} className="px-1 py-1 font-medium text-gray-500 text-center" style={{ writingMode: 'vertical-lr' }}>{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coverageMatrix.rows.map((row, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50">
                      <td className="px-1 py-0.5 font-mono text-gray-600 dark:text-gray-400 truncate max-w-[10rem]">{row.domain}</td>
                      {coverageMatrix.fields.map((f) => (
                        <td key={f} className="px-1 py-0.5 text-center">
                          <span
                            className="inline-block w-3 h-3 rounded-sm"
                            style={{
                              backgroundColor: row.cells[f] > 0
                                ? `rgba(52, 211, 153, ${row.cells[f]})`
                                : undefined,
                            }}
                            title={row.cells[f] > 0 ? `Payoff: ${Math.round(row.cells[f] * 100)}` : 'Not targeted'}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* J) LLM Call Details */}
      {calls.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium">
            LLM Call Details ({calls.length} call{calls.length > 1 ? 's' : ''})
          </summary>
          <div className="mt-2 space-y-2">
            {calls.map((call, i) => (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${llmCallStatusBadgeClass(call.status)}`}>
                    {call.status}
                  </span>
                  {call.model && (
                    <span className="text-[10px] font-mono text-gray-600 dark:text-gray-400">{call.model}</span>
                  )}
                  {call.provider && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{call.provider}</span>
                  )}
                  <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
                    {call.tokens ? `${call.tokens.input}+${call.tokens.output} tok` : ''}
                    {call.duration_ms ? ` | ${formatMs(call.duration_ms)}` : ''}
                  </span>
                </div>
                {call.error && (
                  <div className="text-[10px] text-red-500 dark:text-red-400 mt-1">{call.error}</div>
                )}
                {call.prompt_preview && (
                  <details className="mt-2">
                    <summary className="text-[10px] font-medium text-gray-400 uppercase cursor-pointer">Prompt</summary>
                    <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400 mt-1">{call.prompt_preview}</pre>
                  </details>
                )}
                {call.response_preview && (
                  <details className="mt-1">
                    <summary className="text-[10px] font-medium text-gray-400 uppercase cursor-pointer">Response</summary>
                    <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-32 whitespace-pre-wrap text-gray-600 dark:text-gray-400 mt-1">{call.response_preview}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        </details>
      )}

      {/* K) Debug: Raw JSON */}
      {hasStructured && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            Debug: Raw JSON
          </summary>
          <div className="mt-2">
            <pre className="text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 overflow-x-auto overflow-y-auto max-h-40 whitespace-pre-wrap text-gray-600 dark:text-gray-400">{JSON.stringify(urlPredictions, null, 2)}</pre>
          </div>
        </details>
      )}
    </div>
  );
}
