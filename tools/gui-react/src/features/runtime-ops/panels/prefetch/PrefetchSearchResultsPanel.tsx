import { useMemo, useState } from 'react';
import { SerpScreenshotOverlay } from './SerpScreenshotOverlay.tsx';
import { usePersistedToggle } from '../../../../stores/collapseStore.ts';
import { usePersistedNullableTab, usePersistedExpandMap } from '../../../../stores/tabStore.ts';
import type { PrefetchSearchResult, SearchResultDetail, SerpResultRow, SearchPlanPass, PrefetchLiveSettings } from '../../types.ts';
import { formatMs } from '../../helpers.ts';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell.tsx';
import { Tip } from '../../../../shared/ui/feedback/Tip.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { Chip } from '../../../../shared/ui/feedback/Chip.tsx';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails.tsx';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand.tsx';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip.tsx';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat.tsx';
import {
  computeUniqueUrls,
  queryPassName,
  extractSiteScope,
  providerDisplayLabel,
  enrichResultDomains,
  resolveRuntimeDomainCapSummary,
  isVideoUrl,
} from '../../selectors/searchResultsHelpers.js';
import { PrefetchEmptyState } from './PrefetchEmptyState.tsx';
import type { RuntimeIdxBadge } from '../../types.ts';

interface PrefetchSearchResultsPanelProps {
  results: PrefetchSearchResult[];
  searchResultDetails?: SearchResultDetail[];
  searchPlans?: SearchPlanPass[];
  crossQueryUrlCounts?: Record<string, number>;
  persistScope: string;
  liveSettings?: PrefetchLiveSettings;
  idxRuntime?: RuntimeIdxBadge[];
  runId?: string;
}

/* -- Result Detail Drawer -- */

interface ResultDetailDrawerProps {
  result: SerpResultRow;
  query?: string;
  provider?: string;
  isDuplicate: boolean;
  isCrawled: boolean;
  isVideo: boolean;
  onClose: () => void;
}

function ResultDetailDrawer({ result, query, provider, isDuplicate, isCrawled, isVideo, onClose }: ResultDetailDrawerProps) {
  const status = isVideo ? 'Video' : isDuplicate ? 'Dup' : isCrawled ? 'Crawled' : 'Pass';
  const statusClass = isVideo ? 'sf-chip-danger' : isDuplicate ? 'sf-chip-danger' : isCrawled ? 'sf-chip-purple' : 'sf-chip-success';
  return (
    <DrawerShell title={result.title || result.url} subtitle={result.domain} onClose={onClose}>
      <DrawerSection title="Status">
        <Chip label={status} className={statusClass} />
      </DrawerSection>
      <DrawerSection title="Details">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="sf-text-subtle">Rank</div>
          <div className="font-mono">{result.rank}</div>
          <div className="sf-text-subtle">Domain</div>
          <div className="font-mono">{result.domain}</div>
        </div>
      </DrawerSection>
      {result.snippet && (
        <DrawerSection title="Snippet">
          <div className="sf-pre-block sf-text-caption rounded-sm p-2 italic">
            &ldquo;{result.snippet}&rdquo;
          </div>
        </DrawerSection>
      )}
      {query && (
        <DrawerSection title="Query">
          <pre className="sf-pre-block sf-text-caption font-mono rounded-sm p-2 whitespace-pre-wrap mb-2">
            {query}
          </pre>
          {provider && <Chip label={providerDisplayLabel(provider)} className="sf-chip-accent" />}
        </DrawerSection>
      )}
      <DrawerSection title="URL">
        <a href={result.url} target="_blank" rel="noreferrer" className="sf-link-accent sf-text-caption hover:underline break-all">
          {result.url}
        </a>
      </DrawerSection>
    </DrawerShell>
  );
}

/* -- Main Panel -- */

export function PrefetchSearchResultsPanel({ results, searchResultDetails, searchPlans, crossQueryUrlCounts, persistScope, liveSettings, idxRuntime, runId }: PrefetchSearchResultsPanelProps) {
  const [showSnippets, , setShowSnippets] = usePersistedToggle('runtimeOps:searchResults:snippets', false);
  const [serpScreenshot, setSerpScreenshot] = useState<string | null>(null);

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

  const firstSeenUrlKey: Map<string, string> = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of details) {
      for (const r of d.results) {
        if (r.url && !seen.has(r.url)) seen.set(r.url, `${d.query}::${r.url}`);
      }
    }
    return seen;
  }, [details]);

  const resultValues = useMemo(
    () => details.flatMap((detail) => detail.results.map((result) => `${detail.query}::${result.url}`)),
    [details],
  );
  const [expandedQueries, toggleExpandedQuery, replaceExpandedQueries] = usePersistedExpandMap(
    `runtimeOps:prefetch:searchResults:expandedQueries:${persistScope}`,
  );
  const [selectedResultKey, setSelectedResultKey] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:searchResults:selectedResult:${persistScope}`,
    null,
    { validValues: resultValues },
  );

  /* -- Computed -- */

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
  const uniqueUrlCount = computeUniqueUrls(details);

  const crawledCount = useMemo(() => {
    let count = 0;
    for (const d of details) {
      for (const r of d.results) {
        if (r.already_crawled) count++;
      }
    }
    return count;
  }, [details]);

  const dupCount = useMemo(() => {
    let count = 0;
    for (const d of details) {
      for (const r of d.results) {
        const key = `${d.query}::${r.url}`;
        const isDup = (urlCounts[r.url] || 1) > 1 && firstSeenUrlKey.get(r.url) !== key;
        if (isDup) count++;
      }
    }
    return count;
  }, [details, urlCounts, firstSeenUrlKey]);

  const videoCount = useMemo(() => {
    let count = 0;
    for (const d of details) {
      for (const r of d.results) {
        if (isVideoUrl(r.url)) count++;
      }
    }
    return count;
  }, [details]);

  const uniqueUncrawledCount = Math.max(0, uniqueUrlCount - crawledCount - videoCount);

  const hasProviderFailures = results.some((r) => r.result_count === 0 && r.duration_ms > 0);
  const failedQueries = results.filter((r) => r.result_count === 0 && r.duration_ms > 0);
  const isComplete = results.length > 0 && !hasProviderFailures;
  const isProgressing = hasDetails && results.length > 0 && details.length < results.length;

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

  const overallStatus = isComplete ? 'done' : hasProviderFailures ? 'partial errors' : isProgressing ? 'in progress' : 'pending';
  const statusChipClass = isComplete ? 'sf-chip-success' : hasProviderFailures ? 'sf-chip-warning' : isProgressing ? 'sf-chip-info' : 'sf-chip-neutral';

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

  /* -- Empty State -- */
  if (results.length === 0 && !hasDetails) {
    return (
      <div className="flex flex-col gap-5 p-5 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Search Results</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <PrefetchEmptyState
          icon="&#128270;"
          heading="Waiting for search results"
          description="Results will appear after the Search Planner generates queries and they are executed against configured providers. Each query returns ranked URLs that are deduped and filtered for duplicates and already-crawled pages."
        >
          <div className="sf-text-caption sf-text-subtle mt-3">
            Engines: <span className="font-mono">{providerDisplayLabel(liveSettings?.searchEngines) || (liveSettings ? 'Not set' : 'runtime settings hydrating')}</span>
          </div>
        </PrefetchEmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* -- Hero Band -- */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Search Results</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Dup, Crawl &amp; Video Filter</span>
          <Chip label={overallStatus.toUpperCase()} className={statusChipClass} />
          {isProgressing && (
            <Chip label={`${details.length}/${results.length} DETAILED`} className="sf-chip-info" />
          )}
        </>}
        trailing={<>
          {engineCounts.size > 0 ? (
            [...engineCounts.entries()].map(([eng, cnt]) => (
              <Chip key={eng} label={`${providerDisplayLabel(eng)} (${cnt})`} className="sf-chip-accent" />
            ))
          ) : liveSettings?.searchEngines ? (
            <Chip label={providerDisplayLabel(liveSettings.searchEngines)} className="sf-chip-accent" />
          ) : null}
          <Chip label="Deterministic" className="sf-chip-neutral" />
          <Tip text="Search Results identifies duplicate URLs across queries, flags already-crawled pages, and drops video platforms (YouTube, Vimeo, etc.). Unique, uncrawled, non-video URLs pass to SERP Selector for relevance triage." />
        </>}
        footer={<>
          {uniqueDomains > 0 && <span>domains <strong className="sf-text-primary">{uniqueDomains}</strong></span>}
          <span>domain cap <strong className="sf-text-primary">{domainCapSummary.value}</strong></span>
          {totalDeduped > 0 && <span>deduped <strong className="sf-text-primary">{totalDeduped}</strong></span>}
          {totalThrottleEvents > 0 && <span>throttle <strong className="sf-text-primary">{totalThrottleEvents} events / {formatMs(totalThrottleWaitMs)}</strong></span>}
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid>
          <HeroStat value={results.length} label="queries" />
          <HeroStat value={totalResults} label="raw results" />
          <HeroStat value={uniqueUrlCount || '-'} label="unique urls" colorClass={uniqueUrlCount > 0 ? 'text-[var(--sf-token-accent)]' : 'sf-text-muted'} />
          <HeroStat value={dupCount || '-'} label="dups dropped" colorClass={dupCount > 0 ? 'text-[var(--sf-state-danger-fg)]' : 'sf-text-muted'} />
          <HeroStat value={crawledCount || '-'} label="crawled dropped" colorClass={crawledCount > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'} />
          <HeroStat value={videoCount || '-'} label="video dropped" colorClass={videoCount > 0 ? 'text-[var(--sf-state-danger-fg)]' : 'sf-text-muted'} />
          <HeroStat value={uniqueUncrawledCount || '-'} label="unique uncrawled" colorClass={uniqueUncrawledCount > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
        </HeroStatGrid>

        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          <strong className="sf-text-primary not-italic">{results.length}</strong> quer{results.length === 1 ? 'y' : 'ies'} returned <strong className="sf-text-primary not-italic">{totalResults}</strong> raw results
          {uniqueUrlCount > 0 && (
            <> &mdash; after dedupe, <strong className="sf-text-primary not-italic">{uniqueUrlCount}</strong> unique URLs</>
          )}
          {dupCount > 0 && (
            <>. <strong className="sf-text-primary not-italic">{dupCount}</strong> dup{dupCount > 1 ? 's' : ''} dropped</>
          )}
          {crawledCount > 0 && (
            <>, <strong className="sf-text-primary not-italic">{crawledCount}</strong> already crawled</>
          )}
          {videoCount > 0 && (
            <>, <strong className="sf-text-primary not-italic">{videoCount}</strong> video dropped</>
          )}
          {uniqueUncrawledCount > 0 && (
            <>, <strong className="sf-text-primary not-italic">{uniqueUncrawledCount}</strong> unique uncrawled</>
          )}
          {totalDuration > 0 && (
            <> in <strong className="sf-text-primary not-italic">{formatMs(totalDuration)}</strong></>
          )}
          .
        </div>
      </HeroBand>

      {/* -- Provider Failures -- */}
      {failedQueries.length > 0 && (
        <div className="px-4 py-3.5 rounded-sm border border-[var(--sf-state-warning-border)] bg-[var(--sf-state-warning-bg)]">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl leading-none">{'\u26a0'}</span>
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.06em] text-[var(--sf-state-warning-fg)]">
                {failedQueries.length} quer{failedQueries.length === 1 ? 'y' : 'ies'} returned zero results
              </div>
              <div className="mt-1 text-xs sf-text-muted">
                These appear below in Per-Query Results as non-expandable rows.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -- Per-Query Results -- */}
      {allQueryDetails.length > 0 ? (
        <div>
          <div className="flex items-baseline gap-2 pt-2 pb-1.5 mb-3 border-b-[1.5px] border-[var(--sf-token-text-primary)]">
            <span className="text-[12px] font-bold font-mono uppercase tracking-[0.06em] sf-text-primary">
              per-query results &middot; {allQueryDetails.length} quer{allQueryDetails.length === 1 ? 'y' : 'ies'}
            </span>
            {(() => {
              const expandableQueries = allQueryDetails.filter((d) => d.results.length > 0);
              const allExpanded = expandableQueries.length > 0 && expandableQueries.every((d) => expandedQueries[d.query]);
              return (
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    for (const d of expandableQueries) {
                      next[d.query] = !allExpanded;
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
            {hasDetails && (
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
            )}
          </div>
          <div className="space-y-2">
            {allQueryDetails.map((detail, di) => {
              const isExpanded = Boolean(expandedQueries[detail.query]);
              const matchingBasic = results.find((r) => r.query === detail.query);
              const passName = queryPassName(detail.query, searchPlans);
              const siteScope = extractSiteScope(detail.query);
              const isZeroResult = detail.results.length === 0;

              /* per-query video/dup/crawled/pass counts */
              let qVideo = 0, qDup = 0, qCrawled = 0, qPass = 0;
              for (const r of detail.results) {
                if (isVideoUrl(r.url)) { qVideo++; continue; }
                const key = `${detail.query}::${r.url}`;
                const isDup = (urlCounts[r.url] || 1) > 1 && firstSeenUrlKey.get(r.url) !== key;
                if (isDup) qDup++;
                else if (r.already_crawled) qCrawled++;
                else qPass++;
              }

              if (isZeroResult) {
                return (
                  <div key={di} className="sf-surface-elevated rounded-sm overflow-hidden opacity-60 border sf-border-soft">
                    <div className="w-full flex items-center gap-2 px-5 py-2.5 text-left">
                      <span className="sf-text-caption sf-text-subtle">&mdash;</span>
                      <span className="text-xs font-mono sf-text-muted flex-1 truncate">{detail.query}</span>
                      {siteScope && <Chip label={siteScope} className="sf-chip-info" />}
                      <Chip label="0 results" className="sf-chip-danger" />
                      {matchingBasic && matchingBasic.duration_ms > 0 && (
                        <span className="sf-text-caption font-mono sf-text-subtle">{formatMs(matchingBasic.duration_ms)}</span>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={di} className="sf-surface-elevated rounded-sm overflow-hidden border sf-border-soft">
                  <button
                    type="button"
                    onClick={() => toggleExpandedQuery(detail.query)}
                    className="w-full flex items-center gap-2 px-5 py-2.5 hover:sf-surface-elevated text-left cursor-pointer"
                  >
                    <span className="sf-text-caption sf-text-subtle">{isExpanded ? '\u25BC' : '\u25B6'}</span>
                    <span className="text-xs font-mono sf-text-primary flex-1 truncate">{detail.query}</span>
                    {detail.screenshot_filename && (
                      <button
                        type="button"
                        className="shrink-0 p-0.5 rounded hover:opacity-70 cursor-pointer sf-text-info"
                        onClick={(e) => { e.stopPropagation(); setSerpScreenshot(detail.screenshot_filename || null); }}
                        title="View Google SERP screenshot"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm13 3a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-2 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                    {passName && <Chip label={passName} className="sf-chip-warning" />}
                    {siteScope && <Chip label={siteScope} className="sf-chip-info" />}
                    {(() => {
                      const perResultEngineCounts = new Map<string, number>();
                      for (const r of detail.results) {
                        const eng = r.provider || detail.provider || '';
                        if (eng) perResultEngineCounts.set(eng, (perResultEngineCounts.get(eng) || 0) + 1);
                      }
                      return [...perResultEngineCounts.entries()].map(([eng, cnt]) => (
                        <Chip key={eng} label={`${providerDisplayLabel(eng)} (${cnt})`} className="sf-chip-accent" />
                      ));
                    })()}
                    <span className="sf-text-caption font-mono sf-text-subtle">{detail.results.length} results</span>
                    {qDup > 0 && <span className="sf-text-caption sf-status-text-danger">{qDup} dup</span>}
                    {qCrawled > 0 && <span className="sf-text-caption sf-text-purple">{qCrawled} crawled</span>}
                    {qVideo > 0 && <span className="sf-text-caption sf-status-text-danger">{qVideo} video</span>}
                    <span className="sf-text-caption sf-status-text-success">{qPass} pass</span>
                    {matchingBasic && matchingBasic.duration_ms > 0 && (
                      <span className="sf-text-caption font-mono sf-text-subtle">{formatMs(matchingBasic.duration_ms)}</span>
                    )}
                    {matchingBasic && (matchingBasic.throttle_events || 0) > 0 && (
                      <span className="sf-text-caption font-mono sf-text-subtle">
                        throttle {formatMs(matchingBasic.throttle_wait_ms || 0)} ({matchingBasic.throttle_events})
                      </span>
                    )}
                  </button>
                  {isExpanded ? (
                    <table className="w-full table-fixed text-xs border-t sf-border-soft">
                      <colgroup>
                        {showSnippets ? (
                          <>
                            <col className="w-[3%]" />
                            <col className="w-[15%]" />
                            <col className="w-[18%]" />
                            <col className="w-[10%]" />
                            <col className="w-[5%]" />
                            <col className="w-[5%]" />
                            <col className="w-[5%]" />
                            <col className="w-[19%]" />
                            <col className="w-[8%]" />
                          </>
                        ) : (
                          <>
                            <col className="w-[4%]" />
                            <col className="w-[20%]" />
                            <col className="w-[26%]" />
                            <col className="w-[12%]" />
                            <col className="w-[5%]" />
                            <col className="w-[5%]" />
                            <col className="w-[5%]" />
                            <col className="w-[10%]" />
                          </>
                        )}
                      </colgroup>
                      <thead>
                        <tr className="sf-surface-elevated">
                          <th className="text-right px-2 py-1 border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">#</th>
                          <th className="text-left px-2 py-1 border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Title</th>
                          <th className="text-left px-2 py-1 border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">URL</th>
                          <th className="text-left px-2 py-1 border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Domain</th>
                          <th className="text-center px-1 py-1 border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Dup</th>
                          <th className="text-center px-1 py-1 border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Crawled</th>
                          <th className="text-center px-1 py-1 border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Video</th>
                          {showSnippets && <th className="text-left px-2 py-1 border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Snippet</th>}
                          <th className="text-left px-2 py-1 border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Decision</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.results.map((r, ri) => {
                          const rowKey = `${detail.query}::${r.url}`;
                          const isDuplicate = (urlCounts[r.url] || 1) > 1 && firstSeenUrlKey.get(r.url) !== rowKey;
                          const isCrawled = Boolean(r.already_crawled);
                          const isVideo = isVideoUrl(r.url);
                          const rowBg = isVideo ? 'sf-danger-bg-soft' : isDuplicate ? 'sf-danger-bg-soft' : isCrawled ? 'sf-purple-bg-soft' : '';
                          return (
                          <tr
                            key={ri}
                            className={`border-b sf-border-soft hover:sf-surface-elevated cursor-pointer ${rowBg}`}
                            onClick={() => setSelectedResultKey(
                              selectedResultKey === rowKey ? null : rowKey,
                            )}
                          >
                            <td className="text-right px-2 py-1 font-mono sf-text-subtle">{r.rank || ri + 1}</td>
                            <td className="px-2 py-1 sf-text-primary truncate overflow-hidden">{r.title || '-'}</td>
                            <td className="px-2 py-1 truncate overflow-hidden">
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
                            <td className="px-2 py-1 sf-text-subtle truncate overflow-hidden">{r.domain}</td>
                            <td className="text-center px-1 py-1">
                              {isDuplicate ? (
                                <span className="text-[10px] font-semibold sf-chip-danger px-1.5 py-0.5 rounded">Yes</span>
                              ) : (
                                <span className="text-[10px] font-semibold sf-chip-success px-1.5 py-0.5 rounded">No</span>
                              )}
                            </td>
                            <td className="text-center px-1 py-1">
                              {isCrawled ? (
                                <span className="text-[10px] font-semibold sf-chip-purple px-1.5 py-0.5 rounded">Yes</span>
                              ) : (
                                <span className="text-[10px] font-semibold sf-chip-neutral px-1.5 py-0.5 rounded">No</span>
                              )}
                            </td>
                            <td className="text-center px-1 py-1">
                              {isVideo ? (
                                <span className="text-[10px] font-semibold sf-chip-danger px-1.5 py-0.5 rounded">Yes</span>
                              ) : (
                                <span className="text-[10px] font-semibold sf-chip-neutral px-1.5 py-0.5 rounded">No</span>
                              )}
                            </td>
                            {showSnippets && (
                              <td className="px-2 py-1 sf-text-subtle truncate overflow-hidden">{r.snippet || '-'}</td>
                            )}
                            <td className="px-2 py-1">
                              {isVideo ? (
                                <Chip label="Video" className="sf-chip-danger" />
                              ) : isDuplicate ? (
                                <Chip label="Dup" className="sf-chip-danger" />
                              ) : isCrawled ? (
                                <Chip label="Crawled" className="sf-chip-purple" />
                              ) : (
                                <Chip label="Pass" className="sf-chip-success" />
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : results.length > 0 ? (
        /* Fallback: basic query/count table when no details */
        <div>
          <SectionHeader>query results &middot; {results.length} quer{results.length === 1 ? 'y' : 'ies'}</SectionHeader>
          <div className="overflow-x-auto border sf-border-soft rounded-sm">
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  {['query', 'site', 'engine', 'results', 'throttle wait', 'throttle events', 'duration', 'worker'].map((h) => (
                    <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b sf-border-soft">
                    <td className="py-1.5 px-4 font-mono sf-text-primary max-w-[20rem] truncate">{r.query}</td>
                    <td className="py-1.5 px-4">
                      {(() => {
                        const site = extractSiteScope(r.query);
                        return site ? <Chip label={site} className="sf-chip-info" /> : <span className="sf-text-subtle">-</span>;
                      })()}
                    </td>
                    <td className="py-1.5 px-4">
                      <Chip label={`${providerDisplayLabel(r.provider) || '-'} (${r.result_count})`} className="sf-chip-accent" />
                    </td>
                    <td className="py-1.5 px-4 text-right font-mono">{r.result_count}</td>
                    <td className="py-1.5 px-4 text-right font-mono sf-text-muted">{(r.throttle_wait_ms || 0) > 0 ? formatMs(r.throttle_wait_ms || 0) : '-'}</td>
                    <td className="py-1.5 px-4 text-right font-mono sf-text-muted">{(r.throttle_events || 0) > 0 ? r.throttle_events : '-'}</td>
                    <td className="py-1.5 px-4 text-right font-mono sf-text-muted">{r.duration_ms > 0 ? formatMs(r.duration_ms) : '-'}</td>
                    <td className="py-1.5 px-4 font-mono sf-text-subtle">{r.worker_id || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* -- Result Detail Drawer -- */}
      {selectedResultContext && (() => {
        const selKey = `${selectedResultContext.query}::${selectedResultContext.result.url}`;
        const selIsDup = (urlCounts[selectedResultContext.result.url] || 1) > 1 && firstSeenUrlKey.get(selectedResultContext.result.url) !== selKey;
        const selIsCrawled = Boolean(selectedResultContext.result.already_crawled);
        const selIsVideo = isVideoUrl(selectedResultContext.result.url);
        return (
          <ResultDetailDrawer
            result={selectedResultContext.result}
            query={selectedResultContext.query}
            provider={selectedResultContext.provider}
            isDuplicate={selIsDup}
            isCrawled={selIsCrawled}
            isVideo={selIsVideo}
            onClose={() => setSelectedResultKey(null)}
          />
        );
      })()}

      {/* -- Debug -- */}
      {hasDetails && (
        <DebugJsonDetails label="raw search results json" data={details} />
      )}
      {/* SERP Screenshot Overlay */}
      {serpScreenshot && runId && (
        <SerpScreenshotOverlay
          src={`/api/v1/indexlab/run/${runId}/runtime/assets/${encodeURIComponent(serpScreenshot)}`}
          filename={serpScreenshot}
          onClose={() => setSerpScreenshot(null)}
        />
      )}
    </div>
  );
}
