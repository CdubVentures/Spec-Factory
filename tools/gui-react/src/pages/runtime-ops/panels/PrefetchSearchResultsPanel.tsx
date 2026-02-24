import { useState } from 'react';
import type { PrefetchSearchResult, SearchResultDetail, SerpResultRow } from '../types';
import { formatMs, triageDecisionBadgeClass } from '../helpers';
import { ScoreBar } from '../components/ScoreBar';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';

interface PrefetchSearchResultsPanelProps {
  results: PrefetchSearchResult[];
  searchResultDetails?: SearchResultDetail[];
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2 min-w-[8rem]">
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{value}</div>
    </div>
  );
}

function ResultDetailDrawer({ result, onClose }: { result: SerpResultRow; onClose: () => void }) {
  return (
    <DrawerShell title={result.title || result.url} subtitle={result.domain} onClose={onClose}>
      <DrawerSection title="URL">
        <a href={result.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline break-all">{result.url}</a>
      </DrawerSection>
      {result.snippet && (
        <DrawerSection title="Snippet">
          <div className="text-xs text-gray-600 dark:text-gray-400">{result.snippet}</div>
        </DrawerSection>
      )}
      <DrawerSection title="Scores">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-500">Rank</div>
          <div className="font-mono">{result.rank}</div>
          <div className="text-gray-500">Relevance</div>
          <div className="font-mono">{result.relevance_score.toFixed(2)}</div>
          <div className="text-gray-500">Decision</div>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium w-fit ${triageDecisionBadgeClass(result.decision)}`}>{result.decision || '-'}</span>
          {result.reason && <>
            <div className="text-gray-500">Reason</div>
            <div>{result.reason}</div>
          </>}
        </div>
      </DrawerSection>
    </DrawerShell>
  );
}

export function PrefetchSearchResultsPanel({ results, searchResultDetails }: PrefetchSearchResultsPanelProps) {
  const [expandedQuery, setExpandedQuery] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<SerpResultRow | null>(null);

  const details = searchResultDetails || [];
  const hasDetails = details.length > 0;

  const totalResults = results.reduce((sum, r) => sum + r.result_count, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);
  const providers = [...new Set(results.map((r) => r.provider).filter(Boolean))];
  const uniqueDomains = hasDetails
    ? new Set(details.flatMap((d) => d.results.map((r) => r.domain))).size
    : 0;
  const totalDeduped = details.reduce((sum, d) => sum + d.dedupe_count, 0);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Search Results</h3>
        {providers.map((p) => (
          <span key={p} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
            {p}
          </span>
        ))}
      </div>

      {/* Overview Bar */}
      {results.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <StatCard label="Queries" value={results.length} />
          <StatCard label="Total Results" value={totalResults} />
          {uniqueDomains > 0 && <StatCard label="Unique Domains" value={uniqueDomains} />}
          {totalDeduped > 0 && <StatCard label="Deduped" value={totalDeduped} />}
          <StatCard label="Total Duration" value={totalDuration > 0 ? formatMs(totalDuration) : '-'} />
        </div>
      )}

      {/* Per-query accordion with result details */}
      {hasDetails ? (
        <div className="space-y-2">
          {details.map((detail, di) => {
            const isExpanded = expandedQuery === detail.query;
            const matchingBasic = results.find((r) => r.query === detail.query);
            return (
              <div key={di} className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedQuery(isExpanded ? null : detail.query)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/80 hover:bg-gray-100 dark:hover:bg-gray-700/50 text-left"
                >
                  <span className="text-[10px] text-gray-400">{isExpanded ? '▼' : '▶'}</span>
                  <span className="text-xs font-mono text-gray-900 dark:text-gray-100 flex-1 truncate">{detail.query}</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">{detail.provider}</span>
                  <span className="text-[10px] font-mono text-gray-500">{detail.results.length} results</span>
                  {matchingBasic && matchingBasic.duration_ms > 0 && (
                    <span className="text-[10px] font-mono text-gray-400">{formatMs(matchingBasic.duration_ms)}</span>
                  )}
                </button>
                {isExpanded && (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400">
                        <th className="text-right px-2 py-1 font-medium w-8">#</th>
                        <th className="text-left px-2 py-1 font-medium">Title</th>
                        <th className="text-left px-2 py-1 font-medium">Domain</th>
                        <th className="text-left px-2 py-1 font-medium w-24">Relevance</th>
                        <th className="text-left px-2 py-1 font-medium">Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.results.map((r, ri) => (
                        <tr
                          key={ri}
                          className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
                          onClick={() => setSelectedResult(r)}
                        >
                          <td className="text-right px-2 py-1 font-mono text-gray-400">{r.rank || ri + 1}</td>
                          <td className="px-2 py-1 text-gray-900 dark:text-gray-100 truncate max-w-[16rem]">{r.title || '-'}</td>
                          <td className="px-2 py-1 text-gray-500 dark:text-gray-400">{r.domain}</td>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      ) : results.length > 0 ? (
        /* Fallback: basic query/count table when no details */
        <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2 font-medium">Query</th>
                <th className="text-left px-3 py-2 font-medium">Provider</th>
                <th className="text-right px-3 py-2 font-medium">Results</th>
                <th className="text-right px-3 py-2 font-medium">Duration</th>
                <th className="text-left px-3 py-2 font-medium">Worker</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                  <td className="px-3 py-1.5 font-mono text-gray-900 dark:text-gray-100 max-w-[24rem] truncate">{r.query}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">{r.provider || '-'}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.result_count}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600 dark:text-gray-400">{r.duration_ms > 0 ? formatMs(r.duration_ms) : '-'}</td>
                  <td className="px-3 py-1.5 font-mono text-gray-500 dark:text-gray-400">{r.worker_id || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No search results yet. Results will appear after search queries are executed.
        </div>
      )}

      {selectedResult && (
        <ResultDetailDrawer result={selectedResult} onClose={() => setSelectedResult(null)} />
      )}

      {/* Debug Section */}
      {hasDetails && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
            Debug: Raw Search Results
          </summary>
          <pre className="mt-2 text-[10px] font-mono bg-gray-50 dark:bg-gray-900 rounded p-3 overflow-x-auto max-h-60 whitespace-pre-wrap text-gray-600 dark:text-gray-400">
            {JSON.stringify(details, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
