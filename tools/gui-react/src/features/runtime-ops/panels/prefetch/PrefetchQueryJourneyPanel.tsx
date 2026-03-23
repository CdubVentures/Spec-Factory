import { useMemo } from 'react';
import { usePersistedNullableTab } from '../../../../stores/tabStore';
import { DrawerShell, DrawerSection } from '../../../../shared/ui/overlay/DrawerShell';
import { Tip } from '../../../../shared/ui/feedback/Tip';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader';
import { Chip } from '../../../../shared/ui/feedback/Chip';
import { DebugJsonDetails } from '../../../../shared/ui/data-display/DebugJsonDetails';
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
import {
  classifyQueryTier,
  tierLabel,
  tierChipClass,
  enrichmentStrategyLabel,
} from '../../selectors/searchProfileTierHelpers.js';

interface PrefetchQueryJourneyPanelProps {
  searchProfile: PrefetchSearchProfileData;
  searchPlans?: SearchPlanPass[];
  searchResults?: PrefetchSearchResult[];
  searchResultDetails?: SearchResultDetail[];
  persistScope: string;
  idxRuntime?: RuntimeIdxBadge[];
}

const TH_CLS = 'py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle';

/* ── Query Journey Drawer (tier-aware) ── */

function QueryJourneyDrawer({
  row,
  onClose,
}: {
  row: ReturnType<typeof buildQueryJourneyRows>[number];
  onClose: () => void;
}) {
  const tier = classifyQueryTier(row);
  const enrichment = enrichmentStrategyLabel(row);

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
          <Chip label={tierLabel(tier)} className={tierChipClass(tier)} />
          {row.planner_passes.length > 0 && <Chip label={`+ ${row.planner_passes.join(', ')}`} className="sf-chip-warning" />}
          <Chip label={`order: ${row.execution_order ?? '-'}`} className="sf-chip-neutral" />
        </div>
      </DrawerSection>

      <DrawerSection title="Tier Context">
        <div className="space-y-1 text-xs sf-text-muted">
          <div>Tier: <strong className="sf-text-primary">{tierLabel(tier)}</strong></div>
          {row.group_key && <div>Group: <span className="font-mono">{row.group_key}</span></div>}
          {row.normalized_key && <div>Key: <span className="font-mono">{row.normalized_key}</span></div>}
          {enrichment && <div>Enrichment: <span className="italic">{enrichment}</span> (repeat {row.repeat_count})</div>}
        </div>
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

  const plannedCount = journeyRows.filter((row) => row.planned).length;
  const plannerCount = journeyRows.filter((row) => row.selected_by === 'planner').length;
  const seedCount = journeyRows.filter((row) => classifyQueryTier(row) === 'seed').length;
  const groupCount = journeyRows.filter((row) => classifyQueryTier(row) === 'group').length;
  const keyCount = journeyRows.filter((row) => classifyQueryTier(row) === 'key').length;
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
          <Chip label="Tier-Aware" className="sf-chip-info" />
          <Tip text="Queries ordered by tier priority: seeds first (broadest), then groups (by productivity), then keys (by availability/difficulty). Click any row for full detail." />
        </>}
      >
        <RuntimeIdxBadgeStrip badges={idxRuntime} />

        <HeroStatGrid>
          <HeroStat value={plannedCount} label="planned" />
          <HeroStat value={`T1:${seedCount} T2:${groupCount} T3:${keyCount}`} label="tier split" />
          <HeroStat value={resultsCount} label="results received" colorClass={resultsCount > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-muted'} />
          <HeroStat value={pendingCount} label="still pending" colorClass={pendingCount > 0 ? 'text-[var(--sf-state-warning-fg)]' : 'sf-text-muted'} />
        </HeroStatGrid>

        <div className="text-sm sf-text-muted italic leading-relaxed max-w-3xl">
          <strong className="sf-text-primary not-italic">{plannedCount}</strong> queries
          {seedCount > 0 && <> &mdash; <strong className="sf-text-primary not-italic">{seedCount}</strong> seeds</>}
          {groupCount > 0 && <>, <strong className="sf-text-primary not-italic">{groupCount}</strong> groups</>}
          {keyCount > 0 && <>, <strong className="sf-text-primary not-italic">{keyCount}</strong> keys</>}
          {plannerCount > 0 && <> (<strong className="sf-text-primary not-italic">{plannerCount}</strong> LLM-enhanced)</>}
          {resultsCount > 0 && (
            <> &mdash; <strong className="sf-text-primary not-italic">{resultsCount}</strong> received <strong className="sf-text-primary not-italic">{totalResults}</strong> total results</>
          )}
          {pendingCount > 0 && (
            <>. <strong className="sf-text-primary not-italic">{pendingCount}</strong> still pending</>
          )}
          .
          {firstSearched && (
            <> First searched: <strong className="sf-text-primary not-italic font-mono text-xs">{firstSearched.query}</strong> ({firstSearched.selected_by_label}).</>
          )}
        </div>
      </HeroBand>

      {/* ── Tier ordering explanation ── */}
      <div className="text-[10px] sf-text-subtle italic">
        Ordered by tier priority: seeds first (broadest), then groups (by productivity), then keys (by availability/difficulty). Sent queries ordered by execution timestamp.
      </div>

      {/* ── Journey Table ── */}
      <div>
        <SectionHeader>query lifecycle &middot; {journeyRows.length} quer{journeyRows.length === 1 ? 'y' : 'ies'}</SectionHeader>
        <div className={`overflow-x-auto overflow-y-auto border sf-border-soft rounded-sm ${selectedRow ? 'max-h-[50vh]' : 'max-h-none'}`}>
          <table className="min-w-full text-xs">
            <thead className="sf-surface-elevated sticky top-0">
              <tr>
                <th className={`${TH_CLS} text-right w-12`}>Order</th>
                <th className={TH_CLS}>Query</th>
                <th className={TH_CLS}>Tier</th>
                <th className={TH_CLS}>Target Fields</th>
                <th className={TH_CLS}>Status</th>
                <th className={`${TH_CLS} text-right`}>Results</th>
              </tr>
            </thead>
            <tbody>
              {journeyRows.map((row) => {
                const tier = classifyQueryTier(row);
                return (
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
                      <div className="flex items-center gap-1">
                        <Chip label={tierLabel(tier)} className={tierChipClass(tier)} />
                        {row.planner_passes.length > 0 && <Chip label="LLM" className="sf-chip-warning" />}
                      </div>
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
                    <td className="py-1.5 px-4 text-right font-mono">{row.result_count}</td>
                  </tr>
                );
              })}
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
