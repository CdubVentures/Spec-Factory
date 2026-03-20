import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../../stores/tabStore';
import { usePersistedToggle } from '../../../../stores/collapseStore';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader';
import { Chip } from '../../../../shared/ui/feedback/Chip';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader';
import { HeroBand } from '../../../../shared/ui/data-display/HeroBand';
import { RuntimeIdxBadgeStrip } from '../../components/RuntimeIdxBadgeStrip';
import { HeroStat, HeroStatGrid } from '../../components/HeroStat';
import type {
  PrefetchSearchProfileData,
  SearchPlanPass,
  PrefetchSearchResult,
  SearchResultDetail,
  RuntimeIdxBadge,
} from '../../types';
import { relativeTime } from '../../../../utils/formatting';
import { providerDisplayLabel } from '../../selectors/searchResultsHelpers.js';
import {
  buildQueryJourneyRows,
  queryJourneyStatusBadgeClass,
  queryJourneyStatusLabel,
} from '../../selectors/prefetchQueryJourneyHelpers.js';

interface PrefetchQueryJourneyPanelProps {
  searchProfile: PrefetchSearchProfileData;
  searchPlans?: SearchPlanPass[];
  searchResults?: PrefetchSearchResult[];
  searchResultDetails?: SearchResultDetail[];
  persistScope: string;
  idxRuntime?: RuntimeIdxBadge[];
}

/* ── Query Journey Drawer ── */

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
          <Chip label={queryJourneyStatusLabel(row.status)} className={queryJourneyStatusBadgeClass(row.status)} />
          <Chip label={row.selected_by_label} className="sf-chip-warning" />
          <Chip label={`order: ${row.execution_order ?? '-'}`} className="sf-chip-neutral" />
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
            <Chip label={`pass ${row.order_priority_breakdown.passType}`} className="sf-chip-info" />
            <Chip label={`target ${row.order_priority_breakdown.targetCoverage}`} className="sf-chip-success" />
            <Chip label={`attempts ${row.order_priority_breakdown.attempts}`} className="sf-chip-accent" />
            <Chip label={`constraints ${row.order_priority_breakdown.constraints}`} className="sf-chip-warning" />
          </div>
        )}
      </DrawerSection>

      <DrawerSection title="Coverage Targets">
        <div className="flex flex-wrap gap-1">
          {row.target_fields.length > 0 ? row.target_fields.map((field) => (
            <Chip key={field} label={field} className="sf-chip-success" />
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
            <Chip key={provider} label={providerDisplayLabel(provider)} className="sf-chip-accent" />
          )) : (
            <span className="text-xs sf-text-subtle">No provider observed yet</span>
          )}
        </div>
      </DrawerSection>
    </DrawerShell>
  );
}

/* ── Main Panel ── */

export function PrefetchQueryJourneyPanel({
  searchProfile,
  searchPlans,
  searchResults,
  searchResultDetails,
  persistScope,
  idxRuntime,
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

  const [rankingOpen, toggleRankingOpen] = usePersistedToggle(`runtimeOps:queryJourney:ranking:${persistScope}`, true);

  const plannedCount = journeyRows.filter((row) => row.planned).length;
  const plannerCount = journeyRows.filter((row) => row.selected_by === 'planner').length;
  const deterministicCount = journeyRows.filter((row) => row.selected_by === 'deterministic').length;
  const sentCount = journeyRows.filter((row) => row.sent_count > 0).length;
  const resultsCount = journeyRows.filter((row) => row.status === 'results_received').length;
  const pendingCount = journeyRows.filter((row) => row.status === 'planned').length;
  const totalResults = journeyRows.reduce((sum, row) => sum + row.result_count, 0);
  const firstSearched = journeyRows.find((row) => row.execution_order === 1) || null;

  if (journeyRows.length === 0) {
    return (
      <div className="flex flex-col gap-5 p-5 overflow-y-auto flex-1">
        <h3 className="text-sm font-semibold sf-text-primary">Query Journey</h3>
        <RuntimeIdxBadgeStrip badges={idxRuntime} />
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="text-3xl opacity-60">&#128506;</div>
          <div className="text-sm font-medium sf-text-muted">Waiting for query journey data</div>
          <p className="max-w-md leading-relaxed sf-text-caption sf-text-subtle">
            The query journey will appear once search profile, planner, and results data is available.
            It shows the full lifecycle of each query — what was planned, what got sent, and why each query was selected.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 p-5 overflow-y-auto overflow-x-hidden flex-1 min-h-0 min-w-0">

      {/* ── Hero Band ── */}
      <HeroBand
        titleRow={<>
          <span className="text-[26px] font-bold sf-text-primary tracking-tight leading-none">Query Journey</span>
          <span className="text-[20px] sf-text-muted tracking-tight italic leading-none">&middot; Lifecycle Tracker</span>
          {resultsCount === journeyRows.length && journeyRows.length > 0 && (
            <Chip label="COMPLETE" className="sf-chip-success" />
          )}
          {pendingCount > 0 && (
            <Chip label="IN PROGRESS" className="sf-chip-warning" />
          )}
        </>}
        trailing={<>
          <Chip label="Deterministic" className="sf-chip-neutral" />
          <Tip text="Story view for what was planned first, what got sent, and why each query was selected. Click any row to see the full journey detail." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        {/* Big stat numbers */}
        <HeroStatGrid>
          <HeroStat value={plannedCount} label="planned" />
          <HeroStat value={plannedCount} label="sent" colorClass={plannedCount > 0 ? 'text-[var(--sf-token-accent)]' : 'sf-text-muted'} />
          <HeroStat value={resultsCount} label="results received" colorClass={resultsCount > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={pendingCount} label="still pending" colorClass={pendingCount > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'} />
        </HeroStatGrid>

        {/* Narrative */}
        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          {plannedCount > 0 && (
            <>
              <strong className="sf-text-primary not-italic">{plannedCount}</strong> queries planned
              {(deterministicCount > 0 || plannerCount > 0) && (
                <> (<strong className="sf-text-primary not-italic">{deterministicCount}</strong> from search profile, <strong className="sf-text-primary not-italic">{plannerCount}</strong> from search planner)</>
              )}
              {plannedCount > 0 && (
                <> &mdash; <strong className="sf-text-primary not-italic">{plannedCount}</strong> sent to providers</>
              )}
              {resultsCount > 0 && (
                <>, <strong className="sf-text-primary not-italic">{resultsCount}</strong> received <strong className="sf-text-primary not-italic">{totalResults}</strong> total results</>
              )}
              {pendingCount > 0 && (
                <>. <strong className="sf-text-primary not-italic">{pendingCount}</strong> still awaiting execution</>
              )}
              .
            </>
          )}
          {firstSearched && (
            <> First searched: <strong className="sf-text-primary not-italic font-mono text-xs">{firstSearched.query}</strong> ({firstSearched.selected_by_label}).</>
          )}
        </div>
      </HeroBand>

      {/* ── Ranking Explainer (collapsible) ── */}
      <div>
        <CollapsibleSectionHeader isOpen={rankingOpen} onToggle={toggleRankingOpen}>ranking formula</CollapsibleSectionHeader>

        {rankingOpen && (
          <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 mt-3 space-y-4">
            <div className="text-xs sf-text-muted leading-relaxed">
              <strong className="sf-text-primary">Sent queries</strong> are ordered by first send timestamp (<span className="font-mono">T+seconds</span> from the earliest sent query).
              <br />
              <strong className="sf-text-primary">Unsent queries</strong> are ranked by planned priority score (<span className="font-mono">Pscore</span>) — higher scores rank first.
            </div>
            <div className="px-3 py-2 rounded-sm sf-pre-block">
              <span className="text-[11px] font-mono font-bold sf-text-primary">Pscore = pass + target + attempts + constraints</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="px-3 py-2.5 rounded-sm border sf-border-soft sf-chip-info">
                <div className="text-[9px] font-bold uppercase tracking-[0.06em]">Pass</div>
                <div className="text-sm font-bold font-mono mt-0.5">0–70</div>
                <div className="text-[10px] mt-1.5 opacity-80 leading-snug">
                  Additive across passes a query appears in. Validate +28, Reason +20, Primary +14, Fast +8.
                </div>
              </div>
              <div className="px-3 py-2.5 rounded-sm border sf-border-soft sf-chip-success">
                <div className="text-[9px] font-bold uppercase tracking-[0.06em]">Target</div>
                <div className="text-sm font-bold font-mono mt-0.5">0–24</div>
                <div className="text-[10px] mt-1.5 opacity-80 leading-snug">
                  +4 per targeted field on this query, capped at 24. More target fields = higher priority.
                </div>
              </div>
              <div className="px-3 py-2.5 rounded-sm border sf-border-soft sf-chip-accent">
                <div className="text-[9px] font-bold uppercase tracking-[0.06em]">Attempts</div>
                <div className="text-sm font-bold font-mono mt-0.5">0–10</div>
                <div className="text-[10px] mt-1.5 opacity-80 leading-snug">
                  +2 per logged attempt from search profile <span className="font-mono">query_rows.attempts</span>, capped at 10. Retry boost for incomplete coverage.
                </div>
              </div>
              <div className="px-3 py-2.5 rounded-sm border sf-border-soft sf-chip-warning">
                <div className="text-[9px] font-bold uppercase tracking-[0.06em]">Constraints</div>
                <div className="text-sm font-bold font-mono mt-0.5">0–14</div>
                <div className="text-[10px] mt-1.5 opacity-80 leading-snug">
                  +8 for field-rule hint sources, +6 for site/domain-constrained query text. Max 14.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Journey Table ── */}
      <div>
        <SectionHeader>query lifecycle &middot; {journeyRows.length} quer{journeyRows.length === 1 ? 'y' : 'ies'}</SectionHeader>
        <div className={`overflow-x-auto overflow-y-auto border sf-border-soft rounded-sm ${selectedRow ? 'max-h-[50vh]' : 'max-h-none'}`}>
          <table className="min-w-full text-xs">
            <thead className="sf-surface-elevated sticky top-0">
              <tr>
                <th className="py-2 px-4 text-right border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle w-12">Order</th>
                <th className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Query</th>
                <th className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">
                  Selected By
                  <Tip text={'Who picked this query.\nPlanner = chosen by LLM pass to close missing coverage.\nDeterministic = generated by fixed search-profile rules.'} />
                </th>
                <th className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Target Fields</th>
                <th className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Status</th>
                <th className="py-2 px-4 text-right border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">
                  Pscore
                  <Tip text={'Total planned priority score.\nFor unsent queries: higher Pscore ranks earlier.\nFor sent queries: shown for context only.'} />
                </th>
                <th className="py-2 px-4 text-right border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">Results</th>
              </tr>
            </thead>
            <tbody>
              {journeyRows.map((row) => (
                <tr
                  key={row.query}
                  onClick={() => setSelectedQuery(selectedRow?.query === row.query ? null : row.query)}
                  className={`border-b sf-border-soft hover:sf-surface-elevated cursor-pointer ${selectedRow?.query === row.query ? 'sf-callout sf-callout-info' : ''}`}
                >
                  <td className="py-1.5 px-4 text-right font-mono sf-text-subtle">
                    {row.execution_order ?? '-'}
                  </td>
                  <td className="py-1.5 px-4 font-mono sf-text-primary max-w-[24rem] truncate">
                    {row.query}
                  </td>
                  <td className="py-1.5 px-4">
                    <Chip
                      label={row.selected_by_label}
                      className={row.selected_by === 'planner' ? 'sf-chip-warning' : 'sf-chip-neutral'}
                    />
                  </td>
                  <td className="py-1.5 px-4">
                    <div className="flex flex-wrap gap-1">
                      {row.target_fields.slice(0, 3).map((field) => (
                        <Chip key={field} label={field} className="sf-chip-success" />
                      ))}
                      {row.target_fields.length > 3 && (
                        <span className="sf-text-caption sf-text-subtle">+{row.target_fields.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-4">
                    <Chip label={queryJourneyStatusLabel(row.status)} className={queryJourneyStatusBadgeClass(row.status)} />
                  </td>
                  <td className="py-1.5 px-4 text-right font-mono sf-status-text-info">
                    {row.order_priority_breakdown ? `P${row.order_priority_breakdown.total}` : '-'}
                  </td>
                  <td className="py-1.5 px-4 text-right font-mono">{row.result_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detail Drawer ── */}
      {selectedRow && (
        <QueryJourneyDrawer row={selectedRow} onClose={() => setSelectedQuery(null)} />
      )}

      {/* ── Debug ── */}
      <DebugJsonDetails label="raw query journey json" data={journeyRows} />
    </div>
  );
}
