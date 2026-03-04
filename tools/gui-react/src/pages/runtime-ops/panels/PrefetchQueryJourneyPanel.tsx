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
          <span className="px-2 py-0.5 rounded-full font-medium sf-chip-warning">
            {row.selected_by_label}
          </span>
          <span className="px-2 py-0.5 rounded-full font-medium sf-chip-neutral">
            Order: {row.execution_order ?? '-'}
          </span>
        </div>
      </DrawerSection>

      <DrawerSection title="Why Selected">
        <ul className="space-y-1">
          {row.reasons.map((reason) => (
            <li key={reason} className="text-xs sf-text-muted">
              {reason}
            </li>
          ))}
        </ul>
        <div className="mt-2 text-xs sf-text-muted">
          Order justification: {row.order_justification}
        </div>
        {row.order_priority_breakdown && (
          <div className="mt-2 flex flex-wrap gap-1">
            <span className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-info">
              pass {row.order_priority_breakdown.passType}
            </span>
            <span className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-success">
              target {row.order_priority_breakdown.targetCoverage}
            </span>
            <span className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-accent">
              attempts {row.order_priority_breakdown.attempts}
            </span>
            <span className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-warning">
              constraints {row.order_priority_breakdown.constraints}
            </span>
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Coverage Targets">
        <div className="flex flex-wrap gap-1">
          {row.target_fields.length > 0 ? row.target_fields.map((field) => (
            <span key={field} className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-success">
              {field}
            </span>
          )) : (
            <span className="text-xs sf-text-subtle">No explicit target fields</span>
          )}
        </div>
      </DrawerSection>

      <DrawerSection title="Execution Signals">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="sf-text-subtle">Sent count</div>
          <div className="font-mono">{row.sent_count}</div>
          <div className="sf-text-subtle">Results count</div>
          <div className="font-mono">{row.result_count}</div>
          <div className="sf-text-subtle">Attempts (logged)</div>
          <div className="font-mono">{row.attempts}</div>
          <div className="sf-text-subtle">First sent</div>
          <div className="font-mono">{row.sent_ts ? relativeTime(row.sent_ts) : '-'}</div>
        </div>
      </DrawerSection>

      <DrawerSection title="Providers">
        <div className="flex flex-wrap gap-1">
          {row.providers.length > 0 ? row.providers.map((provider) => (
            <span key={provider} className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-accent">
              {providerDisplayLabel(provider)}
            </span>
          )) : (
            <span className="text-xs sf-text-subtle">No provider observed yet</span>
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
        <h3 className="text-sm font-semibold sf-text-primary">Query Journey</h3>
        <div className="text-sm sf-text-subtle text-center py-8">
          No query lifecycle data yet. This view appears once search profile/planner/results data is available.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto flex-1">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold sf-text-primary">
          Query Journey
          <Tip text="Story view for what was planned first, what got sent, and why each query was selected." />
        </h3>
        <span className="px-2 py-0.5 rounded-full sf-text-caption font-medium sf-chip-info">
          {journeyRows.length} quer{journeyRows.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      <div className="sf-surface-card p-3">
        <div className="sf-text-caption uppercase tracking-wider sf-text-subtle font-medium mb-2">
          Storyline
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          <StageCard label="Planned" value={plannedCount} className="sf-callout sf-callout-neutral" />
          <span className="sf-text-subtle sf-text-caption shrink-0">&rarr;</span>
          <StageCard label="Sent" value={sentCount} className="sf-callout-info" />
          <span className="sf-text-subtle sf-text-caption shrink-0">&rarr;</span>
          <StageCard label="Results" value={resultsCount} className="sf-callout-success" />
          <span className="sf-text-subtle sf-text-caption shrink-0">&rarr;</span>
          <StageCard label="Still Planned" value={pendingCount} className="sf-callout-warning" />
        </div>
        {firstSearched && (
          <div className="mt-3 text-xs sf-text-muted border-t sf-border-soft pt-2">
            First searched: <span className="font-mono">{firstSearched.query}</span> ({firstSearched.selected_by_label})
          </div>
        )}
        <div className="mt-2 text-xs sf-text-muted">
          <span className="font-medium">How ranking works:</span> Sent queries are ordered by first send timestamp (shown as <span className="font-mono">T+seconds</span> in justification). Unsent queries are ranked afterward by planned priority score (<span className="font-mono">Pscore</span>) from pass type, target coverage, logged attempts, and constraints.
        </div>
        <div className="mt-1 text-xs sf-text-subtle">
          Pscore formula: <span className="font-mono">pass + target + attempts + constraints</span>.
        </div>
        <div className="mt-2 text-xs sf-text-muted space-y-1">
          <div>Pass (0-70): Validate +28, Reason +20, Primary +14, Fast +8.</div>
          <div>Target (0-24): +4 per target field, capped at +24.</div>
          <div>Attempts (0-10): +2 per logged attempt from search profile (<span className="font-mono">query_rows.attempts</span>), capped at +10.</div>
          <div>Attempts is a retry boost: previously searched queries can rank higher when coverage is still incomplete.</div>
          <div>Constraints (0-14): +8 for field-rule hints + +6 for site/domain-constrained queries.</div>
        </div>
      </div>

      <div className={`sf-table-shell rounded overflow-hidden overflow-x-auto overflow-y-auto ${selectedRow ? 'max-h-[50vh]' : 'max-h-none'}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="sf-table-head">
              <th className="sf-table-head-cell text-right px-2 py-2 w-12">Order</th>
              <th className="sf-table-head-cell text-left px-2 py-2">Query</th>
              <th className="sf-table-head-cell text-left px-2 py-2">Selected By<Tip text={'Who picked this query.\nPlanner = chosen by LLM pass to close missing coverage.\nDeterministic = generated by fixed search-profile rules.'} /></th>
              <th className="sf-table-head-cell text-left px-2 py-2">Justification</th>
              <th className="sf-table-head-cell text-left px-2 py-2">Target Fields</th>
              <th className="sf-table-head-cell text-left px-2 py-2">Status</th>
              <th className="sf-table-head-cell text-right px-2 py-2">Pscore<Tip text={'Total planned priority score.\nFor unsent queries: higher Pscore ranks earlier.\nFor sent queries: shown for context only.'} /></th>
              <th className="sf-table-head-cell text-right px-2 py-2">Pass<Tip text={'Pass-type points.\nValidate +28, Reason +20, Primary +14, Fast +8.\nMax 70.'} /></th>
              <th className="sf-table-head-cell text-right px-2 py-2">Target<Tip text={'Coverage points.\n+4 per targeted field, capped at +24.'} /></th>
              <th className="sf-table-head-cell text-right px-2 py-2">Attempts<Tip text={'Attempts points from logged query attempts.\n+2 per logged attempt from search profile query_rows.attempts.\nMax +10.\nThis is a retry boost, so previously searched queries can stay high when coverage is incomplete.'} /></th>
              <th className="sf-table-head-cell text-right px-2 py-2">Constraints<Tip text={'Constraint points.\n+8 for field-rule hints.\n+6 for site/domain constrained query text.\nMax +14.'} /></th>
              <th className="sf-table-head-cell text-right px-2 py-2">Results</th>
            </tr>
          </thead>
          <tbody>
            {journeyRows.map((row) => (
              <tr
                key={row.query}
                onClick={() => setSelectedQuery(selectedRow?.query === row.query ? null : row.query)}
                className={`border-t sf-border-soft sf-table-row cursor-pointer ${selectedRow?.query === row.query ? 'sf-table-row-active' : ''}`}
              >
                <td className="px-2 py-1.5 text-right font-mono sf-text-subtle">
                  {row.execution_order ?? '-'}
                </td>
                <td className="px-2 py-1.5 font-mono sf-text-primary max-w-[24rem] truncate">
                  {row.query}
                </td>
                <td className="px-2 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${
                    row.selected_by === 'planner'
                      ? 'sf-chip-warning'
                      : 'sf-chip-neutral'
                  }`}>
                    {row.selected_by_label}
                  </span>
                </td>
                <td className="px-2 py-1.5 sf-text-muted max-w-[16rem] truncate">
                  {row.order_justification}
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {row.target_fields.slice(0, 3).map((field) => (
                      <span key={field} className="px-1.5 py-0.5 rounded sf-text-caption font-medium sf-chip-success">
                        {field}
                      </span>
                    ))}
                    {row.target_fields.length > 3 && (
                      <span className="sf-text-caption sf-text-subtle">+{row.target_fields.length - 3}</span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <span className={`px-1.5 py-0.5 rounded sf-text-caption font-medium ${queryJourneyStatusBadgeClass(row.status)}`}>
                    {queryJourneyStatusLabel(row.status)}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right font-mono sf-status-text-info">
                  {row.order_priority_breakdown ? `P${row.order_priority_breakdown.total}` : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono sf-text-muted">
                  {row.order_priority_breakdown ? row.order_priority_breakdown.passType : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono sf-text-muted">
                  {row.order_priority_breakdown ? row.order_priority_breakdown.targetCoverage : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono sf-text-muted">
                  {row.order_priority_breakdown ? `${row.order_priority_breakdown.attempts} (${row.attempts}x)` : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono sf-text-muted">
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
