import { useMemo } from 'react';
import { usePersistedToggle } from '../../../../stores/collapseStore';
import { usePersistedNullableTab } from '../../../../stores/tabStore';
import type { PrefetchSearchResult, SearchResultDetail, SerpResultRow, SearchPlanPass, PrefetchLiveSettings } from '../../types';
import { formatMs, triageDecisionBadgeClass } from '../../helpers';
import { ScoreBar } from '../../components/ScoreBar';
import { StackedScoreBar } from '../../components/StackedScoreBar';
import { KanbanLane, KanbanCard } from '../../components/KanbanLane';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { StatCard } from '../../components/StatCard';
import { ProgressRing } from '../../components/ProgressRing';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
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
  resolveRuntimeDomainCapSummary,
} from '../../selectors/searchResultsHelpers.js';
import type { RuntimeIdxBadge } from '../../types';

interface PrefetchSearchResultsPanelProps {
  results: PrefetchSearchResult[];
  searchResultDetails?: SearchResultDetail[];
  searchPlans?: SearchPlanPass[];
  crossQueryUrlCounts?: Record<string, number>;
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
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
          <span className={`px-2.5 py-1 rounded sf-text-caption font-semibold ${triageDecisionBadgeClass(result.decision)}`}>
            {result.decision || '-'}
          </span>
        </div>
      </DrawerSection>
      {result.reason && (
        <DrawerSection title="Why kept/dropped">
          <div className="sf-text-caption sf-text-muted">{result.reason}</div>
        </DrawerSection>
      )}
      {query && (
        <DrawerSection title="Query Context">
          <pre className="sf-pre-block sf-text-caption font-mono rounded p-2 whitespace-pre-wrap mb-2">
            {query}
          </pre>
          <div className="flex items-center gap-2 flex-wrap">
            {passName && (
              <span className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-warning">
                {passName}
              </span>
            )}
            {provider && (
              <span className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-accent">
                {providerDisplayLabel(provider)}
              </span>
            )}
          </div>
          {targetFields && targetFields.length > 0 && (
            <div className="mt-2">
              <div className="sf-text-caption sf-text-subtle mb-1">Target fields:</div>
              <div className="flex flex-wrap gap-1">
                {targetFields.map((f) => (
                  <span key={f} className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-success">
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
            <span className="sf-text-subtle">Keep</span>
            <span className="font-mono sf-status-text-success">{domainEntry.keep}</span>
            <span className="sf-text-subtle">Maybe</span>
            <span className="font-mono sf-status-text-warning">{domainEntry.maybe}</span>
            <span className="sf-text-subtle">Drop</span>
            <span className="font-mono sf-status-text-danger">{domainEntry.drop}</span>
          </div>
        </DrawerSection>
      )}
      {result.snippet && (
        <DrawerSection title="Snippet">
          <div className="sf-pre-block sf-text-caption rounded p-2 italic">
            &ldquo;{result.snippet}&rdquo;
          </div>
        </DrawerSection>
      )}
      <DrawerSection title="Details">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="sf-text-subtle">Rank</div>
          <div className="font-mono">{result.rank}</div>
          <div className="sf-text-subtle">Domain</div>
          <div className="font-mono">{result.domain}</div>
        </div>
      </DrawerSection>
      <DrawerSection title="URL">
        <a href={result.url} target="_blank" rel="noreferrer" className="sf-link-accent sf-text-caption hover:underline break-all">
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

function UrlUniqueDot({ url, counts }: { url: string; counts: Record<string, number> }) {
  const n = counts[url] || 1;
  if (n <= 1) return <span className="inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0" style={{ background: 'rgb(34 197 94)' }} title="Unique — appears in 1 query" />;
  return <span className="inline-block w-2 h-2 rounded-full mr-1.5 flex-shrink-0" style={{ background: 'rgb(234 179 8)' }} title={`Duplicate — appears in ${n} queries`} />;
}

export function PrefetchSearchResultsPanel({ results, searchResultDetails, searchPlans, crossQueryUrlCounts, persistScope, liveSettings, idxRuntime }: PrefetchSearchResultsPanelProps) {
  const [showSnippets, toggleSnippets, setShowSnippets] = usePersistedToggle('runtimeOps:searchResults:snippets', false);
  const [kanbanView, toggleKanbanView, setKanbanView] = usePersistedToggle('runtimeOps:searchResults:kanbanView', false);

  const rawDetails = searchResultDetails || [];
  const details = useMemo(() => enrichResultDomains(rawDetails), [rawDetails]);
  const hasDetails = details.length > 0;
  const urlCounts: Record<string, number> = useMemo(() => {
    if (crossQueryUrlCounts && Object.keys(crossQueryUrlCounts).length > 0) return crossQueryUrlCounts;
    const counts: Record<string, number> = {};
    for (const d of details) {
      for (const r of d.results) {
        if (r.url) counts[r.url] = (counts[r.url] || 0) + 1;
      }
    }
    return counts;
  }, [crossQueryUrlCounts, details]);
  const duplicateUrlCount = useMemo(() => Object.values(urlCounts).filter((c) => c > 1).length, [urlCounts]);
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
  const totalThrottleWaitMs = results.reduce((sum, r) => sum + Math.max(0, r.throttle_wait_ms || 0), 0);
  const totalThrottleEvents = results.reduce((sum, r) => sum + Math.max(0, r.throttle_events || 0), 0);
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
  const domainCapSummary = useMemo(() => resolveRuntimeDomainCapSummary(liveSettings), [liveSettings]);

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

  // Merge: build unified per-query list (details + zero-result queries not in details)
  const allQueryDetails: SearchResultDetail[] = useMemo(() => {
    const detailQuerySet = new Set(details.map((d) => d.query));
    const zeroResultEntries: SearchResultDetail[] = results
      .filter((r) => r.result_count === 0 && r.duration_ms > 0 && !detailQuerySet.has(r.query))
      .map((r) => ({
        query: r.query,
        provider: r.provider,
        dedupe_count: 0,
        results: [],
      }));
    return [...details, ...zeroResultEntries];
  }, [details, results]);

  // ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ A) Empty State ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬
  if (results.length === 0 && !hasDetails) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">
          Search Results
          <Tip text="Search Results shows what came back from configured providers (Google, Bing, SearXNG, or Dual). Raw results are deduped and triaged into Keep/Maybe/Drop decisions based on relevance scoring." />
        </h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-3xl sf-text-subtle mb-3">&#128270;</div>
          <div className="text-sm font-medium sf-text-subtle">
            Waiting for search results
          </div>
          <div className="text-xs sf-text-subtle mt-1 max-w-sm">
            Results will appear after the Search Planner generates queries and
            they are executed against configured providers. Each query returns
            ranked URLs that are then deduped and triaged.
          </div>
          <div className="sf-text-caption sf-text-subtle mt-3">
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
        <h3 className="text-sm font-semibold sf-text-primary">
          Search Results
          <Tip text="Search Results shows what came back from configured providers (Google, Bing, SearXNG, or Dual). Raw results are deduped and triaged into Keep/Maybe/Drop decisions based on relevance scoring." />
        </h3>
        {isComplete && (
          <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-success">
            Done
          </span>
        )}
        {hasProviderFailures && (
          <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-warning">
            Partial Errors
          </span>
        )}
        {isProgressing && (
          <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-info animate-pulse">
            {details.length} of {results.length} queries detailed&hellip;
          </span>
        )}
        {engineCounts.size > 0 ? (
          [...engineCounts.entries()].map(([eng, cnt]) => (
            <span key={eng} className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-accent">
              {providerDisplayLabel(eng)} <span className="font-mono opacity-70">({cnt})</span>
            </span>
          ))
        ) : liveSettings?.searchProvider ? (
          <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-accent">
            {providerDisplayLabel(liveSettings.searchProvider)}
          </span>
        ) : null}
        {hasDetails && (
          <div className="flex items-center gap-2 ml-auto">
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
            <div className="inline-flex items-center gap-1 rounded p-0.5 sf-surface-panel">
              <button
                type="button"
                onClick={() => setShowSnippets(false)}
                className={`px-2 py-1 rounded sf-text-caption font-medium transition-colors ${
                  !showSnippets ? 'sf-primary-button' : 'sf-icon-button'
                }`}
              >
                Snippets Off
              </button>
              <button
                type="button"
                onClick={() => setShowSnippets(true)}
                className={`px-2 py-1 rounded sf-text-caption font-medium transition-colors ${
                  showSnippets ? 'sf-primary-button' : 'sf-icon-button'
                }`}
              >
                Snippets On
              </button>
            </div>
          </div>
        )}
      </div>

      <RuntimeIdxBadgeStrip badges={idxRuntime} />

      {/* C) Provider Failure Summary (collapsed — individual queries now in Per-Query section) */}
      {failedQueries.length > 0 && (
        <div className="px-4 py-2 sf-callout sf-callout-warning">
          <div className="text-xs font-medium">
            {failedQueries.length} quer{failedQueries.length === 1 ? 'y' : 'ies'} returned zero results
          </div>
          <div className="sf-text-caption mt-0.5 sf-text-muted">
            These appear below in Per-Query Results as non-expandable rows.
          </div>
        </div>
      )}

      {/* D) Hero Card ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Results at a Glance */}
      {hasDetails && totalDetailResults > 0 && (() => {
        return (
          <div className="sf-surface-card p-4">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="text-sm sf-text-muted">
                  {results.length} quer{results.length === 1 ? 'y' : 'ies'} returned {totalResults} raw results.
                  {uniqueUrlCount > 0 && <> After dedupe, <strong>{uniqueUrlCount}</strong> unique URLs.</>}
                  {decisions.keep > 0 && <> <strong>{decisions.keep}</strong> kept, <strong>{filteredCount}</strong> dropped.</>}
                </div>
                {funnelBullets.length > 0 && (
                  <div className="mt-3 pt-3 border-t sf-border-soft">
                    <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider mb-1.5">
                      Why these results?
                      <Tip text="A narrative explaining the search results funnel: how many queries ran, what they targeted, how many URLs survived dedupe and triage, and which domains contributed the most kept results." />
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
                      <Tip text="The most frequently appearing domains across all search results. Click a domain to filter the results table or Kanban view to only show results from that domain." />
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
          {totalThrottleEvents > 0 && <StatCard label="Throttle Events" value={totalThrottleEvents} tip="How many times search requests were delayed by host/global throttling. Higher values indicate anti-bot pacing is active." />}
          {totalThrottleWaitMs > 0 && <StatCard label="Throttle Wait" value={formatMs(totalThrottleWaitMs)} tip="Total delay added by search throttling across all queries before provider requests were sent." />}
          <StatCard label="Duration" value={totalDuration > 0 ? formatMs(totalDuration) : '-'} tip="Total wall-clock time spent waiting for search provider responses across all queries." />
        </div>
      )}

      {/* F) Decision Distribution Bar */}
      {hasDecisions && (
        <div>
          <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider mb-1.5">
            Decision Distribution
            <Tip text="Visual breakdown of how search results were classified. Keep = will be fetched and parsed. Maybe = borderline, may be fetched if budget allows. Drop = filtered out." />
          </div>
          <StackedScoreBar segments={decisionSegments} showLegend />
        </div>
      )}

      {/* G) Per-query accordion with result details (enhanced) */}
      {allQueryDetails.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="sf-text-caption font-medium sf-text-subtle uppercase tracking-wider">
              Per-Query Results
              <Tip text="Each query sent to the search provider is shown as an expandable section. Click to see individual results, their relevance scores, and triage decisions. Zero-result queries appear as non-expandable rows. Use the Table/Kanban toggle above to switch between views." />
            </div>
            {duplicateUrlCount > 0 && (
              <div className="flex items-center gap-3 sf-text-caption sf-text-subtle">
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: 'rgb(34 197 94)' }} /> Unique</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full" style={{ background: 'rgb(234 179 8)' }} /> Duplicate</span>
                <span className="sf-text-caption">({duplicateUrlCount} URLs in multiple queries)</span>
              </div>
            )}
          </div>
          {allQueryDetails.map((detail, di) => {
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
            const isZeroResult = detail.results.length === 0;

            // Zero-result queries: non-expandable row
            if (isZeroResult) {
              return (
                <div key={di} className="sf-surface-elevated rounded overflow-hidden opacity-60">
                  <div className="w-full flex items-center gap-2 px-3 py-2 sf-table-head text-left">
                    <span className="sf-text-caption sf-text-subtle">&mdash;</span>
                    <span className="text-xs font-mono sf-text-muted flex-1 truncate">{detail.query}</span>
                    {siteScope && (
                      <span className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-info shrink-0">
                        {siteScope}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-danger shrink-0">0 results</span>
                    {matchingBasic && matchingBasic.duration_ms > 0 && (
                      <span className="sf-text-caption font-mono sf-text-subtle">{formatMs(matchingBasic.duration_ms)}</span>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={di} className="sf-surface-elevated rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedQuery(isExpanded ? null : detail.query)}
                  className="w-full flex items-center gap-2 px-3 py-2 sf-table-head sf-row-hoverable text-left"
                >
                  <span className="sf-text-caption sf-text-subtle">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                  <span className="text-xs font-mono sf-text-primary flex-1 truncate">{detail.query}</span>
                  {passName && (
                    <span className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-warning shrink-0">
                      {passName}
                    </span>
                  )}
                  {siteScope && (
                    <span className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-info shrink-0">
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
                      <span key={eng} className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-accent shrink-0">
                        {providerDisplayLabel(eng)} <span className="font-mono opacity-70">({cnt})</span>
                      </span>
                    ));
                  })()}
                  <span className="sf-text-caption font-mono sf-text-subtle">{detail.results.length} results</span>
                  {targets.length > 0 && (
                    <span className="sf-text-caption sf-status-text-success shrink-0">
                      {targets.length} field{targets.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {decSummary && (
                    <span className="sf-text-caption sf-text-subtle">{decSummary}</span>
                  )}
                  {matchingBasic && matchingBasic.duration_ms > 0 && (
                    <span className="sf-text-caption font-mono sf-text-subtle">{formatMs(matchingBasic.duration_ms)}</span>
                  )}
                  {matchingBasic && (matchingBasic.throttle_events || 0) > 0 && (
                    <span className="sf-text-caption font-mono sf-text-subtle">
                      throttle {formatMs(matchingBasic.throttle_wait_ms || 0)} ({matchingBasic.throttle_events})
                    </span>
                  )}
                </button>
                {isExpanded && kanbanView ? (
                  <div className="p-3 flex gap-3 overflow-x-auto">
                    <KanbanLane title="Keep" count={kept.length} badgeClass="sf-chip-success">
                      {kept.map((r, ri) => (
                        <KanbanCard
                          key={ri}
                          title={r.title || r.url}
                          domain={r.domain}
                          snippet={showSnippets ? r.snippet : undefined}
                          score={r.relevance_score}
                          rationale={r.reason}
                          titlePrefix={<UrlUniqueDot url={r.url} counts={urlCounts} />}
                          onClick={() => setSelectedResultKey(
                            selectedResultKey === `${detail.query}::${r.url}`
                              ? null
                              : `${detail.query}::${r.url}`,
                          )}
                        >
                          {targets.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-1">
                              {targets.slice(0, 3).map((f) => (
                                <span key={f} className="px-1 py-0 rounded sf-text-micro font-medium sf-chip-success">
                                  {f}
                                </span>
                              ))}
                              {targets.length > 3 && (
                                <span className="sf-text-micro sf-text-subtle">+{targets.length - 3}</span>
                              )}
                            </div>
                          )}
                        </KanbanCard>
                      ))}
                      {kept.length === 0 && <div className="sf-text-caption sf-text-subtle py-2 text-center">None</div>}
                    </KanbanLane>
                    <KanbanLane title="Maybe" count={maybe.length} badgeClass="sf-chip-warning">
                      {maybe.map((r, ri) => (
                        <KanbanCard
                          key={ri}
                          title={r.title || r.url}
                          domain={r.domain}
                          snippet={showSnippets ? r.snippet : undefined}
                          score={r.relevance_score}
                          rationale={r.reason}
                          titlePrefix={<UrlUniqueDot url={r.url} counts={urlCounts} />}
                          onClick={() => setSelectedResultKey(
                            selectedResultKey === `${detail.query}::${r.url}`
                              ? null
                              : `${detail.query}::${r.url}`,
                          )}
                        />
                      ))}
                      {maybe.length === 0 && <div className="sf-text-caption sf-text-subtle py-2 text-center">None</div>}
                    </KanbanLane>
                    <KanbanLane title="Drop" count={dropped.length} badgeClass="sf-chip-danger">
                      {dropped.map((r, ri) => (
                        <KanbanCard
                          key={ri}
                          title={r.title || r.url}
                          domain={r.domain}
                          snippet={showSnippets ? r.snippet : undefined}
                          score={r.relevance_score}
                          rationale={r.reason}
                          titlePrefix={<UrlUniqueDot url={r.url} counts={urlCounts} />}
                          onClick={() => setSelectedResultKey(
                            selectedResultKey === `${detail.query}::${r.url}`
                              ? null
                              : `${detail.query}::${r.url}`,
                          )}
                        />
                      ))}
                      {dropped.length === 0 && <div className="sf-text-caption sf-text-subtle py-2 text-center">None</div>}
                    </KanbanLane>
                  </div>
                ) : isExpanded ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="sf-table-head">
                        <th className="sf-table-head-cell text-center px-1 py-1 w-5" title="Unique/Duplicate"></th>
                        <th className="sf-table-head-cell text-right px-2 py-1 w-8">#</th>
                        <th className="sf-table-head-cell text-left px-2 py-1">Title</th>
                        <th className="sf-table-head-cell text-left px-2 py-1">URL</th>
                        <th className="sf-table-head-cell text-left px-2 py-1">Domain</th>
                        {showSnippets && <th className="sf-table-head-cell text-left px-2 py-1">Snippet</th>}
                        <th className="sf-table-head-cell text-left px-2 py-1 w-24">Relevance</th>
                        <th className="sf-table-head-cell text-left px-2 py-1">Decision</th>
                        {showSnippets && <th className="sf-table-head-cell text-left px-2 py-1">Reason</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredResults.map((r, ri) => (
                        <tr
                          key={ri}
                          className="border-t sf-border-soft sf-table-row cursor-pointer"
                          onClick={() => setSelectedResultKey(
                            selectedResultKey === `${detail.query}::${r.url}`
                              ? null
                              : `${detail.query}::${r.url}`,
                          )}
                        >
                          <td className="text-center px-1 py-1"><UrlUniqueDot url={r.url} counts={urlCounts} /></td>
                          <td className="text-right px-2 py-1 font-mono sf-text-subtle">{r.rank || ri + 1}</td>
                          <td className="px-2 py-1 sf-text-primary truncate max-w-[16rem]">{r.title || '-'}</td>
                          <td className="px-2 py-1 truncate max-w-[14rem]">
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noreferrer"
                              className="sf-link-accent sf-text-caption hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {r.url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 50)}
                            </a>
                          </td>
                          <td className="px-2 py-1 sf-text-subtle">{r.domain}</td>
                          {showSnippets && (
                            <td className="px-2 py-1 sf-text-subtle truncate max-w-[14rem]">{r.snippet || '-'}</td>
                          )}
                          <td className="px-2 py-1">
                            {r.relevance_score > 0 ? (
                              <ScoreBar value={r.relevance_score} max={1} label={r.relevance_score.toFixed(2)} />
                            ) : (
                              <span className="sf-text-subtle">-</span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {r.decision ? (
                              <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${triageDecisionBadgeClass(r.decision)}`}>{r.decision}</span>
                            ) : (
                              <span className="sf-text-subtle">-</span>
                            )}
                          </td>
                          {showSnippets && (
                            <td className="px-2 py-1 sf-text-subtle truncate max-w-[10rem]">{r.reason || '-'}</td>
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
        <div className="sf-table-shell rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="sf-table-head">
                <th className="sf-table-head-cell text-left px-3 py-2">Query</th>
                <th className="sf-table-head-cell text-left px-3 py-2">Site</th>
                <th className="sf-table-head-cell text-left px-3 py-2">Engine</th>
                <th className="sf-table-head-cell text-right px-3 py-2">Results</th>
                <th className="sf-table-head-cell text-right px-3 py-2">Throttle Wait</th>
                <th className="sf-table-head-cell text-right px-3 py-2">Throttle Events</th>
                <th className="sf-table-head-cell text-right px-3 py-2">Duration</th>
                <th className="sf-table-head-cell text-left px-3 py-2">Worker</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t sf-border-soft sf-table-row">
                  <td className="px-3 py-1.5 font-mono sf-text-primary max-w-[20rem] truncate">{r.query}</td>
                  <td className="px-3 py-1.5">
                    {(() => {
                      const site = extractSiteScope(r.query);
                      return site ? (
                        <span className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-info">{site}</span>
                      ) : (
                        <span className="sf-text-subtle">-</span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="px-1.5 py-0.5 rounded sf-text-caption sf-chip-accent">
                      {providerDisplayLabel(r.provider) || '-'} <span className="font-mono opacity-70">({r.result_count})</span>
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.result_count}</td>
                  <td className="px-3 py-1.5 text-right font-mono sf-text-muted">{(r.throttle_wait_ms || 0) > 0 ? formatMs(r.throttle_wait_ms || 0) : '-'}</td>
                  <td className="px-3 py-1.5 text-right font-mono sf-text-muted">{(r.throttle_events || 0) > 0 ? r.throttle_events : '-'}</td>
                  <td className="px-3 py-1.5 text-right font-mono sf-text-muted">{r.duration_ms > 0 ? formatMs(r.duration_ms) : '-'}</td>
                  <td className="px-3 py-1.5 font-mono sf-text-subtle">{r.worker_id || '-'}</td>
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
          <summary className="cursor-pointer sf-summary-toggle">
            Debug: Raw Search Results
          </summary>
          <pre className="mt-2 sf-pre-block sf-text-caption font-mono rounded p-3 overflow-x-auto overflow-y-auto max-h-60 whitespace-pre-wrap">
            {JSON.stringify(details, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
