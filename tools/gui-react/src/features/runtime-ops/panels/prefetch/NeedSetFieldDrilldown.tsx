import { useMemo } from 'react';
import type { PrefetchNeedSetPlannerRow } from '../../types.ts';
import { resolveNeedsetState, resolveNeedsetBucket } from '../../badgeRegistries.ts';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader.tsx';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import { sortPlannerRows, nextAction } from './needSetHelpers.ts';
import type { PlannerSortKey } from './needSetHelpers.ts';

/* ── Types ──────────────────────────────────────────────────────────── */

export interface DrilldownRow extends PrefetchNeedSetPlannerRow {
  bundle_label: string;
  phase: string;
  source_target: string;
}

export interface NeedSetFieldDrilldownProps {
  drilldownRows: DrilldownRow[];
  isLlmPending: boolean;
  drilldownOpen: boolean;
  toggleDrilldownOpen: () => void;
  drilldownFilter: 'unresolved' | 'escalated' | 'all';
  setDrilldownFilter: (value: 'unresolved' | 'escalated' | 'all') => void;
  fieldFilter: string;
  setFieldFilter: (value: string) => void;
  plannerSortKey: PlannerSortKey;
  plannerSortDir: 'asc' | 'desc';
  onSort: (key: PlannerSortKey) => void;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function NeedSetFieldDrilldown({
  drilldownRows,
  isLlmPending,
  drilldownOpen,
  toggleDrilldownOpen,
  drilldownFilter,
  setDrilldownFilter,
  fieldFilter,
  setFieldFilter,
  plannerSortKey,
  plannerSortDir,
  onSort,
}: NeedSetFieldDrilldownProps) {

  const filteredDrilldownRows = useMemo(() => {
    let rows = drilldownRows;
    if (drilldownFilter === 'unresolved') rows = rows.filter(r => r.state !== 'satisfied');
    else if (drilldownFilter === 'escalated') rows = rows.filter(r => r.state === 'conflict' || r.state === 'weak');
    if (fieldFilter) rows = rows.filter(r => r.field_key.toLowerCase().includes(fieldFilter.toLowerCase()));
    return sortPlannerRows(rows, plannerSortKey, plannerSortDir);
  }, [drilldownRows, drilldownFilter, fieldFilter, plannerSortKey, plannerSortDir]);

  const sortArrow = (key: PlannerSortKey) =>
    plannerSortKey === key ? (plannerSortDir === 'asc' ? ' \u25b4' : ' \u25be') : '';

  return (
    <>
      {/* LLM pending placeholder */}
      {isLlmPending && (
        <div>
          <SectionHeader>field drilldown</SectionHeader>
          <div className="flex items-center gap-2.5 py-3 px-4 rounded-sm sf-surface-elevated border sf-border-soft">
            <div className="w-20 h-1 rounded-sm overflow-hidden sf-bg-surface-soft-strong">
              <div className="h-full w-full rounded-sm bg-[var(--sf-token-accent)] animate-pulse" />
            </div>
            <span className="text-[10px] font-mono font-semibold tracking-[0.02em] sf-text-muted">
              search planner LLM in progress&hellip;
            </span>
          </div>
        </div>
      )}

      {/* Drilldown table */}
      {drilldownRows.length > 0 && (
        <div>
          <CollapsibleSectionHeader isOpen={drilldownOpen} onToggle={toggleDrilldownOpen} summary={<>{drilldownRows.length} fields</>}>field drilldown</CollapsibleSectionHeader>

          {drilldownOpen && (
            <div className="mt-3 space-y-2">
              {/* Filter buttons */}
              <div className="flex items-center gap-2">
                {([
                  ['unresolved', 'Unresolved'],
                  ['escalated', 'Escalated'],
                  ['all', 'All fields'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setDrilldownFilter(key)}
                    className={`px-2.5 py-1 rounded-sm text-[10px] font-bold font-mono tracking-[0.04em] border cursor-pointer transition-colors ${
                      drilldownFilter === key
                        ? 'text-[var(--sf-token-text-inverse)] bg-[var(--sf-token-text-primary)] border-transparent'
                        : 'sf-text-muted sf-surface-elevated sf-border-soft hover:sf-text-primary'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <span className="text-[10px] font-mono sf-text-subtle ml-2">
                  showing {filteredDrilldownRows.length} of {drilldownRows.length}
                </span>
              </div>

              {/* Text filter */}
              <input
                type="text"
                placeholder="filter by field name..."
                value={fieldFilter}
                onChange={(e) => setFieldFilter(e.target.value)}
                className="w-full px-2 py-1 rounded-sm border sf-border-soft sf-surface-panel sf-text-primary text-xs"
              />

              {/* Table */}
              <div className="overflow-x-auto overflow-y-auto max-h-[84rem] border sf-border-soft rounded-sm">
                <table className="min-w-full text-xs">
                  <thead className="sf-surface-elevated sticky top-0">
                    <tr>
                      {[
                        { key: 'field_key' as const, label: 'field' },
                        { key: 'bundle_id' as const, label: 'bundle' },
                        { key: 'required_level' as const, label: 'bucket' },
                        { key: 'state' as const, label: 'state' },
                      ].map(col => (
                        <th key={col.key} className="py-2 px-3 text-left border-b sf-border-soft">
                          <button onClick={() => onSort(col.key)} className="hover:underline text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">
                            {col.label}{sortArrow(col.key)}
                          </button>
                        </th>
                      ))}
                      <th className="py-2 px-3 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">next action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDrilldownRows.map((row) => {
                      const bB = resolveNeedsetBucket(row.priority_bucket);
                      const stB = resolveNeedsetState(row.state);
                      return (
                        <tr key={`${row.field_key}-${row.bundle_id}`} className={`sf-table-row border-b sf-border-soft ${row.state === 'conflict' ? 'bg-[var(--sf-state-error-bg)]' : ''}`}>
                          <td className={`py-1.5 px-3 font-mono font-medium ${row.state === 'satisfied' ? 'sf-text-subtle' : 'sf-text-primary'}`}>{row.field_key}</td>
                          <td className="py-1.5 px-3 font-mono sf-text-muted">{row.bundle_id || '\u2014'}</td>
                          <td className="py-1.5 px-3">
                            <span className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase ${bB.badge}`}>{bB.label}</span>
                          </td>
                          <td className="py-1.5 px-3">
                            <span className="inline-flex items-center gap-1">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${resolveNeedsetState(row.state).dot}`} />
                              <span className={`text-[10px] font-semibold uppercase ${stB.badge}`}>{stB.label}</span>
                            </span>
                          </td>
                          <td className="py-1.5 px-3 font-mono sf-text-muted">{nextAction(row.state)}</td>
                        </tr>
                      );
                    })}
                    {filteredDrilldownRows.length === 0 && (
                      <tr><td className="py-3 px-3 sf-text-muted text-center" colSpan={5}>no matching fields</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
