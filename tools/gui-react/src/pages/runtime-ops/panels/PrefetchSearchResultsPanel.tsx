import { useMemo } from 'react';
import { usePersistedToggle } from '../../../stores/collapseStore';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import type { PrefetchSearchResult, SearchResultDetail, SerpResultRow, SearchPlanPass, PrefetchLiveSettings } from '../types';
import { formatMs, triageDecisionBadgeClass } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';
import { StackedScoreBar } from '../components/StackedScoreBar';
import { KanbanLane, KanbanCard } from '../components/KanbanLane';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { Tip } from '../../../components/common/Tip';
import { StatCard } from '../components/StatCard';
import { ProgressRing } from '../components/ProgressRing';
import {
  computeDecisionCounts,
  computeTopDomains,
  computeUniqueUrls,
  computeFilteredCount,
  buildDecisionSegments,
  buildQueryTargetMap,
  queryPassName,
  buildEnrichedFunnelBullets,
  computeDomainDecisionBreakdown,
  extractSiteScope,
  providerDisplayLabel,
  enrichResultDomains,
  resolveDomainCapSummary,
} from './searchResultsHelpers.js';

interface PrefetchSearchResultsPanelProps {
  results: PrefetchSearchResult[];
  searchResultDetails?: SearchResultDetail[];
  searchPlans?: SearchPlanPass[];
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
}



interface ResultDetailDrawerProps {
  result: SerpResultRow;
  query?: string;
  provider?: string;
  targetFields?: string[];
  passName?: string;
  domainBreakdown?: Map<string, { keep: number; maybe: number; drop: number }>;
  onClose: () => void;
}

function ResultDetailDrawer({ result, query, provider, targetFields, passName, domainBreakdown, onClose }: ResultDetailDrawerProps) {
  const domainEntry = domainBreakdown?.get(result.domain);
  return (
    <DrawerShell title={result.title || result.url} subtitle={result.domain} onClose={onClose}>
      <DrawerSection title="Relevance Score">
        <ScoreBar value={result.relevance_score} max={1} label={result.relevance_score.toFixed(2)} />
      </DrawerSection>
      <DrawerSection title="Decision">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded text-xs font-semibold ${triageDecisionBadgeClass(result.decision)}`}>
            {result.decision || '-'}
          </span>
        </div>
      </DrawerSection>
      {result.reason && (
        <DrawerSection title="Why kept/dropped">
          <div className="text-xs text-gray-600 dark:text-gray-400">{result.reason}</div>
        </DrawerSection>
      )}
      {query && (
        <DrawerSection title="Query Context">
          <pre className="text-xs font-mono bg-gray-50 dark:bg-gray-900 rounded p-2 whitespace-pre-wrap text-gray-700 dark:text-gray-300 mb-2">
            {query}
          </pre>
          <div className="flex items-center gap-2 flex-wrap">
            {passName && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                {passName}
              </span>
            )}
            {provider && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                {providerDisplayLabel(provider)}
              </span>
            )}
          </div>
          {targetFields && targetFields.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">Target fields:</div>
              <div className="flex flex-wrap gap-1">
                {targetFields.map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </DrawerSection>
      )}
      {domainEntry && (
        <DrawerSection title="Domain Decision Breakdown">
          <div className="grid grid-cols-2 gap-1 text-xs">
            <span className="text-gray-500">Keep</span>
            <span className="font-mono text-green-600">{domainEntry.keep}</span>
            <span className="text-gray-500">Maybe</span>
            <span className="font-mono text-yellow-600">{domainEntry.maybe}</span>
            <span className="text-gray-500">Drop</span>
            <span className="font-mono text-red-600">{domainEntry.drop}</span>
          </div>
        </DrawerSection>
      )}
      {result.snippet && (
        <DrawerSection title="Snippet">
          <div className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded p-2 italic">
            &ldquo;{result.snippet}&rdquo;
          </div>
        </DrawerSection>
      )}
      <DrawerSection title="Details">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-500">Rank</div>
          <div className="font-mono">{result.rank}</div>
          <div className="text-gray-500">Domain</div>
          <div className="font-mono">{result.domain}</div>
        </div>
      </DrawerSection>
      <DrawerSection title="URL">
        <a href={result.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all">
          {result.url}
        </a>
      </DrawerSection>
    </DrawerShell>
  );
}

function queryDecisionSummary(queryResults: SerpResultRow[]): string {
  let keep = 0, maybe = 0, drop = 0;
  for (const r of queryResults) {
    if (r.decision === 'keep') keep++;
    else if (r.decision === 'maybe') maybe++;
    else if (r.decision === 'drop' || r.decision === 'skip') drop++;
  }
  const parts: string[] = [];
  if (keep > 0) parts.push(`${keep} keep`);
  if (maybe > 0) parts.push(`${maybe} maybe`);
  if (drop > 0) parts.push(`${drop} drop`);
  return parts.join(', ') || '';
}

export function PrefetchSearchResultsPanel({ results, searchResultDetails, searchPlans, persistScope, liveSettings }: PrefetchSearchResultsPanelProps) {
  const [showSnippets, toggleSnippets] = usePersistedToggle('runtimeOps:searchResults:snippets', false);
  const [kanbanView, toggleKanbanView] = usePersistedToggle('runtimeOps:searchResults:kanbanView', false);

  const rawDetails = searchResultDetails || [];
  const details = useMemo(() => enrichResultDomains(rawDetails), [rawDetails]);
  const hasDetails = details.length > 0;
  const queryValues = useMemo(
    () => details.map((detail) => detail.query).filter(Boolean),
    [details],
  );
  const resultValues = useMemo(
    () => details.flatMap((detail) => detail.results.map((result) => `${detail.query}::${result.url}`)),
    [details],
  );
  const [expandedQuery, setExpandedQuery] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:searchResults:expandedQuery:${persistScope}`,
    null,
    { validValues: queryValues },
  );
  const [selectedResultKey, setSelectedResultKey] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:searchResults:selectedResult:${persistScope}`,
    null,
    { validValues: resultValues },
  );

  const domainFilterValues = useMemo(
    () => [...new Set(details.flatMap((d) => d.results.map((r) => r.domain)))],
    [details],
  );
  const [domainFilter, setDomainFilter] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:searchResults:domainFilter:${persistScope}`,
    null,
    { validValues: domainFilterValues },
  );

  const selectedResultContext = useMemo(() => {
    if (!selectedResultKey) return null;
    for (const detail of details) {
      for (const result of detail.results) {
        if (`${detail.query}::${result.url}` === selectedResultKey) {
          return { result, query: detail.query, provider: detail.provider };
        }
      }
    }
    return null;
  }, [details, selectedResultKey]);

  const queryTargetMap = useMemo(() => buildQueryTargetMap(searchPlans), [searchPlans]);
  const domainBreakdown = useMemo(() => computeDomainDecisionBreakdown(details), [details]);

  const totalResults = results.reduce((sum, r) => sum + r.result_count, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);
  const engineCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of details) {
      for (const r of d.results) {
        const eng = r.provider || d.provider || '';
        if (eng) counts.set(eng, (counts.get(eng) || 0) + 1);
      }
    }
    if (counts.size === 0) {
      for (const r of results) {
        if (r.provider) counts.set(r.provider, (counts.get(r.provider) || 0) + r.result_count);
      }
    }
    return counts;
  }, [details, results]);
  const uniqueDomains = hasDetails
    ? new Set(details.flatMap((d) => d.results.map((r) => r.domain))).size
    : 0;
  const totalDeduped = details.reduce((sum, d) => sum + d.dedupe_count, 0);
  const domainCapSummary = useMemo(() => {
    if (!liveSettings) {
      return {
        value: 'hydrating',
        tooltip: 'Runtime settings are still hydrating. Domain cap details will appear once settings are available.',
      };
    }
    const hasRuntimeSnapshot = Boolean(
      liveSettings.profile !== undefined
      || liveSettings.maxPagesPerDomain !== undefined
      || liveSettings.discoveryResultsPerQuery !== undefined
      || liveSettings.discoveryMaxDiscovered !== undefined
      || liveSettings.serpTriageMaxUrls !== undefined
      || liveSettings.uberMaxUrlsPerDomain !== undefined,
    );
    if (!hasRuntimeSnapshot) {
      return {
        value: 'hydrating',
        tooltip: 'Runtime settings are still hydrating. Domain cap details will appear once settings are available.',
      };
    }
    return resolveDomainCapSummary(liveSettings);
  }, [liveSettings]);

  const decisions = computeDecisionCounts(details);
  const totalDetailResults = details.reduce((sum, d) => sum + d.results.length, 0);
  const uniqueUrlCount = computeUniqueUrls(details);
  const filteredCount = computeFilteredCount(details);
  const topDomains = computeTopDomains(details, 5);
  const funnelBullets = buildEnrichedFunnelBullets(results, details, decisions, searchPlans);
  const decisionSegments = buildDecisionSegments(decisions);
  const hasDecisions = decisions.keep + decisions.maybe + decisions.drop > 0;

  const hasProviderFailures = results.some((r) => r.result_count === 0 && r.duration_ms > 0);
  const failedQueries = results.filter((r) => r.result_count === 0 && r.duration_ms > 0);
  const isComplete = results.length > 0 && !hasProviderFailures;
  const isProgressing = hasDetails && results.length > 0 && details.length < results.length;

  // ── A) Empty State ──
  if (results.length === 0 && !hasDetails) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Search Results
          <Tip text="Search Results shows what came back from configured providers (Google, Bing, DuckDuckGo, SearXNG, or Dual). Raw results are deduped and triaged into Keep/Maybe/Drop decisions based on relevance scoring." />
        </h3>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-3xl text-gray-300 dark:text-gray-600 mb-3">&#128270;</div>
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Waiting for search results
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
            Results will appear after the Search Planner generates queries and
            they are executed against configured providers. Each query returns
            ranked URLs that are then deduped and triaged.
          </div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-3">
            Provider: <span className="font-mono">{providerDisplayLabel(liveSettings?.searchProvider) || (liveSettings ? 'Not set' : 'runtime settings hydrating')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      {/* A) Header Row */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Search Results
          <Tip text="Search Results shows what came back from configured providers (Google, Bing, DuckDuckGo, SearXNG, or Dual). Raw results are deduped and triaged into Keep/Maybe/Drop decisions based on relevance scoring." />
        </h3>
        {isComplete && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            Done
          </span>
        )}
        {hasProviderFailures && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
            Partial Errors
          </span>
        )}
        {isProgressing && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse">
            {details.length} of {results.length} queries detailed&hellip;
          </span>
        )}
        {engineCounts.size > 0 ? (
          [...engineCounts.entries()].map(([eng, cnt]) => (
            <span key={eng} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              {providerDisplayLabel(eng)} <span className="font-mono opacity-70">({cnt})</span>
            </span>
          ))
        ) : liveSettings?.searchProvider ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
            {providerDisplayLabel(liveSettings.searchProvider)}
          </span>
        ) : null}
        {hasDetails && (
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => toggleKanbanView()}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              {kanbanView ? 'Table' : 'Kanban'}
            </button>
            <button
              type="button"
              onClick={() => toggleSnippets()}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showSnippets ? 'Hide Snippets' : 'Show Snippets'}
            </button>
          </div>
        )}
      </div>

      {/* C) Provider Failure Banners */}
      {failedQueries.length > 0 && (
        <div className="space-y-1.5">
          {failedQueries.map((fq, i) => (
            <div key={i} className="px-4 py-2.5 rounded bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
                Zero results from {providerDisplayLabel(fq.provider) || (engineCounts.size > 0 ? [...engineCounts.keys()].map(providerDisplayLabel).join(', ') : 'search provider')}
              </div>
              <div className="text-[10px] text-orange-600 dark:text-orange-400 mt-0.5">
                Query &ldquo;{fq.query}&rdquo; returned no results after {formatMs(fq.duration_ms)}.
                The provider may be unreachable or the query may be too restrictive.
              </div>
            </div>
          ))}
        </div>
      )}

      {/* D) Hero Card — Results at a Glance */}
      {hasDetails && totalDetailResults > 0 && (() => {
        return (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  {results.length} quer{results.length === 1 ? 'y' : 'ies'} returned {totalResults} raw results.
                  {uniqueUrlCount > 0 && <> After dedupe, <strong>{uniqueUrlCount}</strong> unique URLs.</>}
                  {decisions.keep > 0 && <> <strong>{decisions.keep}</strong> kept, <strong>{filteredCount}</strong> dropped.</>}
                </div>
                {funnelBullets.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      Why these results?
                      <Tip text="A narrative explaining the search results funnel: how many queries ran, what they targeted, how many URLs survived dedupe and triage, and which domains contributed the most kept results." />
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
                {topDomains.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      Top Domains
                      <Tip text="The most frequently appearing domains across all search results. Click a domain to filter the results table or Kanban view to only show results from that domain." />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {topDomains.map((d) => (
                        <button
                          key={d.domain}
                          type="button"
                          onClick={() => setDomainFilter(domainFilter === d.domain ? null : d.domain)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                            domainFilter === d.domain
                              ? 'bg-blue-500 text-white ring-1 ring-blue-400'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800'
                          }`}
                        >
                          {d.domain} ({d.count})
                        </button>
                      ))}
                      {domainFilter && (
                        <button
                          type="button"
                          onClick={() => setDomainFilter(null)}
                          className="text-[10px] text-red-500 hover:underline ml-1"
                        >
                          Clear filter
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {decisions.keep > 0 && (
                <ProgressRing
                  numerator={decisions.keep}
                  denominator={totalDetailResults}
                  label="Keep Rate"
                  strokeWidth={6}
                />
              )}
            </div>
          </div>
        );
      })()}

      {/* E) StatCards Row */}
      {results.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <StatCard label="Queries" value={results.length} tip="Total search queries executed against search providers. Each query comes from the Search Planner and targets specific missing spec fields." />
          <StatCard label="Total Results" value={totalResults} tip="Raw result count before any deduplication or triage. This is the sum of results returned by each provider for each query." />
          {uniqueUrlCount > 0 && <StatCard label="Unique URLs" value={uniqueUrlCount} tip="Distinct URLs remaining after cross-query deduplication. The same URL often appears in results for multiple queries." />}
          {uniqueDomains > 0 && <StatCard label="Unique Domains" value={uniqueDomains} tip="How many different websites contributed results. More domain diversity generally means better evidence coverage." />}
          <StatCard label="Domain Cap" value={domainCapSummary.value} tip={domainCapSummary.tooltip} />
          {totalDeduped > 0 && <StatCard label="Deduped" value={totalDeduped} tip="URLs that appeared in multiple queries and were collapsed into a single entry. Higher dedupe counts suggest overlapping queries." />}
          {decisions.keep > 0 && <StatCard label="Kept" value={decisions.keep} tip="Results that passed triage and will proceed to fetching. These URLs are expected to contain relevant spec information." />}
          {filteredCount > 0 && <StatCard label="Dropped" value={filteredCount} tip="Results removed during triage because they scored below the relevance threshold or matched a skip pattern (e.g. forums, shopping carts)." />}
          <StatCard label="Duration" value={totalDuration > 0 ? formatMs(totalDuration) : '-'} tip="Total wall-clock time spent waiting for search provider responses across all queries." />
        </div>
      )}

      {/* F) Decision Distribution Bar */}
      {hasDecisions && (
        <div>
          <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
            Decision Distribution
            <Tip text="Visual breakdown of how search results were classified. Keep = will be fetched and parsed. Maybe = borderline, may be fetched if budget allows. Drop = filtered out." />
          </div>
          <StackedScoreBar segments={decisionSegments} showLegend />
        </div>
      )}

      {/* G) Per-query accordion with result details (enhanced) */}
      {hasDetails ? (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Per-Query Results
            <Tip text="Each query sent to the search provider is shown as an expandable section. Click to see individual results, their relevance scores, and triage decisions. Use the Table/Kanban toggle above to switch between views." />
          </div>
          {details.map((detail, di) => {
            const isExpanded = expandedQuery === detail.query;
            const matchingBasic = results.find((r) => r.query === detail.query);
            const decSummary = queryDecisionSummary(detail.results);
            const passName = queryPassName(detail.query, searchPlans);
            const targets = queryTargetMap.get(detail.query) || [];
            const siteScope = extractSiteScope(detail.query);
            const filteredResults = domainFilter
              ? detail.results.filter((r) => r.domain === domainFilter)
              : detail.results;

            const kept = filteredResults.filter((r) => r.decision === 'keep');
            const maybe = filteredResults.filter((r) => r.decision === 'maybe');
            const dropped = filteredResults.filter((r) => r.decision === 'drop' || r.decision === 'skip');

            return (
              <div key={di} className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedQuery(isExpanded ? null : detail.query)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left"
                >
                  <span className="text-[10px] text-gray-400">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                  <span className="text-xs font-mono text-gray-900 dark:text-gray-100 flex-1 truncate">{detail.query}</span>
                  {passName && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 shrink-0">
                      {passName}
                    </span>
                  )}
                  {siteScope && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200 shrink-0">
                      {siteScope}
                    </span>
                  )}
                  {(() => {
                    const perResultEngineCounts = new Map<string, number>();
                    for (const r of detail.results) {
                      const eng = r.provider || detail.provider || '';
                      if (eng) perResultEngineCounts.set(eng, (perResultEngineCounts.get(eng) || 0) + 1);
                    }
                    return [...perResultEngineCounts.entries()].map(([eng, cnt]) => (
                      <span key={eng} className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 shrink-0">
                        {providerDisplayLabel(eng)} <span className="font-mono opacity-70">({cnt})</span>
                      </span>
                    ));
                  })()}
                  <span className="text-[10px] font-mono text-gray-500">{detail.results.length} results</span>
                  {targets.length > 0 && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 shrink-0">
                      {targets.length} field{targets.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {decSummary && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">{decSummary}</span>
                  )}
                  {matchingBasic && matchingBasic.duration_ms > 0 && (
                    <span className="text-[10px] font-mono text-gray-400">{formatMs(matchingBasic.duration_ms)}</span>
                  )}
                </button>
                {isExpanded && kanbanView ? (
                  <div className="p-3 flex gap-3 overflow-x-auto">
                    <KanbanLane title="Keep" count={kept.length} badgeClass="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      {kept.map((r, ri) => (
                        <KanbanCard
                          key={ri}
                          title={r.title || r.url}
                          domain={r.domain}
                          snippet={showSnippets ? r.snippet : undefined}
                          score={r.relevance_score}
                          rationale={r.reason}
                          onClick={() => setSelectedResultKey(
                            selectedResultKey === `${detail.query}::${r.url}`
                              ? null
                              : `${detail.query}::${r.url}`,
                          )}
                        >
                          {targets.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-1">
                              {targets.slice(0, 3).map((f) => (
                                <span key={f} className="px-1 py-0 rounded text-[8px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                                  {f}
                                </span>
                              ))}
                              {targets.length > 3 && (
                                <span className="text-[8px] text-gray-400">+{targets.length - 3}</span>
                              )}
                            </div>
                          )}
                        </KanbanCard>
                      ))}
                      {kept.length === 0 && <div className="text-[10px] text-gray-400 py-2 text-center">None</div>}
                    </KanbanLane>
                    <KanbanLane title="Maybe" count={maybe.length} badgeClass="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      {maybe.map((r, ri) => (
                        <KanbanCard
                          key={ri}
                          title={r.title || r.url}
                          domain={r.domain}
                          snippet={showSnippets ? r.snippet : undefined}
                          score={r.relevance_score}
                          rationale={r.reason}
                          onClick={() => setSelectedResultKey(
                            selectedResultKey === `${detail.query}::${r.url}`
                              ? null
                              : `${detail.query}::${r.url}`,
                          )}
                        />
                      ))}
                      {maybe.length === 0 && <div className="text-[10px] text-gray-400 py-2 text-center">None</div>}
                    </KanbanLane>
                    <KanbanLane title="Drop" count={dropped.length} badgeClass="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      {dropped.map((r, ri) => (
                        <KanbanCard
                          key={ri}
                          title={r.title || r.url}
                          domain={r.domain}
                          snippet={showSnippets ? r.snippet : undefined}
                          score={r.relevance_score}
                          rationale={r.reason}
                          onClick={() => setSelectedResultKey(
                            selectedResultKey === `${detail.query}::${r.url}`
                              ? null
                              : `${detail.query}::${r.url}`,
                          )}
                        />
                      ))}
                      {dropped.length === 0 && <div className="text-[10px] text-gray-400 py-2 text-center">None</div>}
                    </KanbanLane>
                  </div>
                ) : isExpanded ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
                        <th className="text-right px-2 py-1 font-medium w-8">#</th>
                        <th className="text-left px-2 py-1 font-medium">Title</th>
                        <th className="text-left px-2 py-1 font-medium">Domain</th>
                        {showSnippets && <th className="text-left px-2 py-1 font-medium">Snippet</th>}
                        <th className="text-left px-2 py-1 font-medium w-24">Relevance</th>
                        <th className="text-left px-2 py-1 font-medium">Decision</th>
                        {showSnippets && <th className="text-left px-2 py-1 font-medium">Reason</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r, ri) => (
                        <tr
                          key={ri}
                          className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
                          onClick={() => setSelectedResultKey(
                            selectedResultKey === `${detail.query}::${r.url}`
                              ? null
                              : `${detail.query}::${r.url}`,
                          )}
                        >
                          <td className="text-right px-2 py-1 font-mono text-gray-400">{r.rank || ri + 1}</td>
                          <td className="px-2 py-1 text-gray-900 dark:text-gray-100 truncate max-w-[16rem]">{r.title || '-'}</td>
                          <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{r.domain}</td>
                          {showSnippets && (
                            <td className="px-2 py-1 text-gray-400 dark:text-gray-500 truncate max-w-[14rem]">{r.snippet || '-'}</td>
                          )}
                          <td className="px-2 py-1">
                            {r.relevance_score > 0 ? (
                              <ScoreBar value={r.relevance_score} max={1} label={r.relevance_score.toFixed(2)} />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {r.decision ? (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${triageDecisionBadgeClass(r.decision)}`}>{r.decision}</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          {showSnippets && (
                            <td className="px-2 py-1 text-gray-400 dark:text-gray-500 truncate max-w-[10rem]">{r.reason || '-'}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : results.length > 0 ? (
        /* H) Fallback: basic query/count table when no details */
        <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2 font-medium">Query</th>
                <th className="text-left px-3 py-2 font-medium">Site</th>
                <th className="text-left px-3 py-2 font-medium">Engine</th>
                <th className="text-right px-3 py-2 font-medium">Results</th>
                <th className="text-right px-3 py-2 font-medium">Duration</th>
                <th className="text-left px-3 py-2 font-medium">Worker</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100 max-w-[20rem] truncate">{r.query}</td>
                  <td className="px-3 py-1.5">
                    {(() => {
                      const site = extractSiteScope(r.query);
                      return site ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200">{site}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      {providerDisplayLabel(r.provider) || '-'} <span className="font-mono opacity-70">({r.result_count})</span>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.result_count}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">{r.duration_ms > 0 ? formatMs(r.duration_ms) : '-'}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">{r.worker_id || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* I) Result Detail Drawer */}
      {selectedResultContext && (
        <ResultDetailDrawer
          result={selectedResultContext.result}
          query={selectedResultContext.query}
          provider={selectedResultContext.provider}
          targetFields={queryTargetMap.get(selectedResultContext.query)}
          passName={queryPassName(selectedResultContext.query, searchPlans)}
          domainBreakdown={domainBreakdown}
          onClose={() => setSelectedResultKey(null)}
        />
      )}

      {/* J) Debug: Raw JSON */}
      {hasDetails && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            Debug: Raw Search Results
          </summary>
          <pre className="mt-2 text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto overflow-y-auto max-h-60 whitespace-pre-wrap text-gray-600 dark:text-gray-400">
            {JSON.stringify(details, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
