import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../stores/tabStore';
import { DrawerShell, DrawerSection } from '../../../components/common/DrawerShell';
import { Tip } from '../../../components/common/Tip';
import { StageCard } from '../components/StageCard';
import type {
  PrefetchSearchProfileData,
  SearchPlanPass,
  PrefetchSearchResult,
  SearchResultDetail,
} from '../types';
import { relativeTime } from '../../../utils/formatting';
import { providerDisplayLabel } from './searchResultsHelpers.js';
import {
  buildQueryJourneyRows,
  queryJourneyStatusBadgeClass,
  queryJourneyStatusLabel,
} from './prefetchQueryJourneyHelpers.js';

interface PrefetchQueryJourneyPanelProps {
  searchProfile: PrefetchSearchProfileData;
  searchPlans?: SearchPlanPass[];
  searchResults?: PrefetchSearchResult[];
  searchResultDetails?: SearchResultDetail[];
  persistScope: string;
}


function QueryJourneyDrawer({
  row,
  onClose,
}: {
  row: ReturnType<typeof buildQueryJourneyRows>[number];
  onClose: () => void;
}) {
  return (
    <DrawerShell
      title="Query Journey Detail"
      subtitle={row.query}
      maxHeight="none"
      className="max-h-none"
      scrollContent={false}
      onClose={onClose}
    >
      <DrawerSection title="Lifecycle">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={`px-2 py-0.5 rounded-full font-medium ${queryJourneyStatusBadgeClass(row.status)}`}>
            {queryJourneyStatusLabel(row.status)}
          </span>
          <span className="px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            {row.selected_by_label}
          </span>
          <span className="px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
            Order: {row.execution_order ?? '-'}
          </span>
        </div>
      </DrawerSection>

      <DrawerSection title="Why Selected">
        <ul className="space-y-1">
          {row.reasons.map((reason) => (
            <li key={reason} className="text-xs text-gray-700 dark:text-gray-300">
              {reason}
            </li>
          ))}
        </ul>
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          Order justification: {row.order_justification}
        </div>
        {row.order_priority_breakdown && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200">
              pass {row.order_priority_breakdown.passType}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              target {row.order_priority_breakdown.targetCoverage}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
              attempts {row.order_priority_breakdown.attempts}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              constraints {row.order_priority_breakdown.constraints}
            </span>
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Coverage Targets">
        <div className="flex flex-wrap gap-1">
          {row.target_fields.length > 0 ? row.target_fields.map((field) => (
            <span key={field} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              {field}
            </span>
          )) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">No explicit target fields</span>
          )}
        </div>
      </DrawerSection>

      <DrawerSection title="Execution Signals">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="text-gray-500">Sent count</div>
          <div className="font-mono">{row.sent_count}</div>
          <div className="text-gray-500">Results count</div>
          <div className="font-mono">{row.result_count}</div>
          <div className="text-gray-500">Attempts (logged)</div>
          <div className="font-mono">{row.attempts}</div>
          <div className="text-gray-500">First sent</div>
          <div className="font-mono">{row.sent_ts ? relativeTime(row.sent_ts) : '-'}</div>
        </div>
      </DrawerSection>

      <DrawerSection title="Providers">
        <div className="flex flex-wrap gap-1">
          {row.providers.length > 0 ? row.providers.map((provider) => (
            <span key={provider} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
              {providerDisplayLabel(provider)}
            </span>
          )) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">No provider observed yet</span>
          )}
        </div>
      </DrawerSection>
    </DrawerShell>
  );
}

export function PrefetchQueryJourneyPanel({
  searchProfile,
  searchPlans,
  searchResults,
  searchResultDetails,
  persistScope,
}: PrefetchQueryJourneyPanelProps) {
  const journeyRows = useMemo(
    () => buildQueryJourneyRows({
      queryRows: searchProfile?.query_rows || [],
      searchPlans: searchPlans || [],
      searchResults: searchResults || [],
      searchResultDetails: searchResultDetails || [],
    }),
    [searchProfile?.query_rows, searchPlans, searchResults, searchResultDetails],
  );
  const queryValues = useMemo(
    () => journeyRows.map((row) => row.query).filter(Boolean),
    [journeyRows],
  );
  const [selectedQuery, setSelectedQuery] = usePersistedNullableTab<string>(
    `runtimeOps:prefetch:queryJourney:selected:${persistScope}`,
    null,
    { validValues: queryValues },
  );

  const selectedRow = useMemo(
    () => journeyRows.find((row) => row.query === selectedQuery) || null,
    [journeyRows, selectedQuery],
  );

  const plannedCount = journeyRows.filter((row) => row.planned).length;
  const sentCount = journeyRows.filter((row) => row.sent_count > 0).length;
  const resultsCount = journeyRows.filter((row) => row.status === 'results_received').length;
  const pendingCount = journeyRows.filter((row) => row.status === 'planned').length;
  const firstSearched = journeyRows.find((row) => row.execution_order === 1) || null;

  if (journeyRows.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1 min-h-0">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Query Journey</h3>
        <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
          No query lifecycle data yet. This view appears once search profile/planner/results data is available.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          Query Journey
          <Tip text="Story view for what was planned first, what got sent, and why each query was selected." />
        </h3>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200">
          {journeyRows.length} quer{journeyRows.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-medium mb-2">
          Storyline
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <StageCard label="Planned" value={plannedCount} className="border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-100" />
          <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
          <StageCard label="Sent" value={sentCount} className="border-blue-200 text-blue-800 bg-blue-50 dark:border-blue-800 dark:text-blue-200 dark:bg-blue-900/20" />
          <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
          <StageCard label="Results" value={resultsCount} className="border-emerald-200 text-emerald-800 bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:bg-emerald-900/20" />
          <span className="text-gray-300 dark:text-gray-600 text-xs shrink-0">&rarr;</span>
          <StageCard label="Still Planned" value={pendingCount} className="border-amber-200 text-amber-800 bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:bg-amber-900/20" />
        </div>
        {firstSearched && (
          <div className="mt-3 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700 pt-2">
            First searched: <span className="font-mono">{firstSearched.query}</span> ({firstSearched.selected_by_label})
          </div>
        )}
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
          <span className="font-medium">How ranking works:</span> Sent queries are ordered by first send timestamp (shown as <span className="font-mono">T+seconds</span> in justification). Unsent queries are ranked afterward by planned priority score (<span className="font-mono">Pscore</span>) from pass type, target coverage, logged attempts, and constraints.
        </div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Pscore formula: <span className="font-mono">pass + target + attempts + constraints</span>.
        </div>
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
          <div>Pass (0-70): Validate +28, Reason +20, Primary +14, Fast +8.</div>
          <div>Target (0-24): +4 per target field, capped at +24.</div>
          <div>Attempts (0-10): +2 per logged attempt from search profile (<span className="font-mono">query_rows.attempts</span>), capped at +10.</div>
          <div>Attempts is a retry boost: previously searched queries can rank higher when coverage is still incomplete.</div>
          <div>Constraints (0-14): +8 for field-rule hints + +6 for site/domain-constrained queries.</div>
        </div>
      </div>

      <div className={`border border-gray-200 dark:border-gray-700 rounded overflow-hidden overflow-x-auto overflow-y-auto ${selectedRow ? 'max-h-[50vh]' : 'max-h-none'}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
              <th className="text-right px-2 py-2 font-medium w-12">Order</th>
              <th className="text-left px-2 py-2 font-medium">Query</th>
              <th className="text-left px-2 py-2 font-medium">Selected By<Tip text={'Who picked this query.\nPlanner = chosen by LLM pass to close missing coverage.\nDeterministic = generated by fixed search-profile rules.'} /></th>
              <th className="text-left px-2 py-2 font-medium">Justification</th>
              <th className="text-left px-2 py-2 font-medium">Target Fields</th>
              <th className="text-left px-2 py-2 font-medium">Status</th>
              <th className="text-right px-2 py-2 font-medium">Pscore<Tip text={'Total planned priority score.\nFor unsent queries: higher Pscore ranks earlier.\nFor sent queries: shown for context only.'} /></th>
              <th className="text-right px-2 py-2 font-medium">Pass<Tip text={'Pass-type points.\nValidate +28, Reason +20, Primary +14, Fast +8.\nMax 70.'} /></th>
              <th className="text-right px-2 py-2 font-medium">Target<Tip text={'Coverage points.\n+4 per targeted field, capped at +24.'} /></th>
              <th className="text-right px-2 py-2 font-medium">Attempts<Tip text={'Attempts points from logged query attempts.\n+2 per logged attempt from search profile query_rows.attempts.\nMax +10.\nThis is a retry boost, so previously searched queries can stay high when coverage is incomplete.'} /></th>
              <th className="text-right px-2 py-2 font-medium">Constraints<Tip text={'Constraint points.\n+8 for field-rule hints.\n+6 for site/domain constrained query text.\nMax +14.'} /></th>
              <th className="text-right px-2 py-2 font-medium">Results</th>
            </tr>
          </thead>
          <tbody>
            {journeyRows.map((row) => (
              <tr
                key={row.query}
                onClick={() => setSelectedQuery(selectedRow?.query === row.query ? null : row.query)}
                className={`border-t border-gray-100 dark:border-gray-700/50 cursor-pointer ${
                  selectedRow?.query === row.query
                    ? 'bg-sky-50 dark:bg-sky-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                }`}
              >
                <td className="px-2 py-1.5 text-right font-mono text-gray-500">
                  {row.execution_order ?? '-'}
                </td>
                <td className="px-2 py-1.5 font-mono text-gray-900 dark:text-gray-100 max-w-[24rem] truncate">
                  {row.query}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    row.selected_by === 'planner'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                      : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {row.selected_by_label}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400 max-w-[16rem] truncate">
                  {row.order_justification}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {row.target_fields.slice(0, 3).map((field) => (
                      <span key={field} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        {field}
                      </span>
                    ))}
                    {row.target_fields.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{row.target_fields.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${queryJourneyStatusBadgeClass(row.status)}`}>
                    {queryJourneyStatusLabel(row.status)}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-sky-700 dark:text-sky-300">
                  {row.order_priority_breakdown ? `P${row.order_priority_breakdown.total}` : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-600 dark:text-gray-300">
                  {row.order_priority_breakdown ? row.order_priority_breakdown.passType : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-600 dark:text-gray-300">
                  {row.order_priority_breakdown ? row.order_priority_breakdown.targetCoverage : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-600 dark:text-gray-300">
                  {row.order_priority_breakdown ? `${row.order_priority_breakdown.attempts} (${row.attempts}x)` : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-gray-600 dark:text-gray-300">
                  {row.order_priority_breakdown ? row.order_priority_breakdown.constraints : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{row.result_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRow && (
        <QueryJourneyDrawer row={selectedRow} onClose={() => setSelectedQuery(null)} />
      )}
    </div>
  );
}
