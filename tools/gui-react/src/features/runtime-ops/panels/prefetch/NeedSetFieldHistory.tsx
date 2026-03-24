import type { NeedSetField } from '../../types.ts';
import { resolveNeedsetState } from '../../badgeRegistries.ts';
import { queryFamilyBadge } from '../../../indexing/helpers.tsx';
import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader.tsx';

/* ── Props ──────────────────────────────────────────────────────────── */

export interface NeedSetFieldHistoryProps {
  historyFields: NeedSetField[];
  stuckFieldCount: number;
  escalationThreshold: number;
  hasPreLlmData: boolean;
  historyOpen: boolean;
  toggleHistoryOpen: () => void;
  expandedHistoryField: string | null;
  setExpandedHistoryField: (value: string | null) => void;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function NeedSetFieldHistory({
  historyFields,
  stuckFieldCount,
  escalationThreshold,
  hasPreLlmData,
  historyOpen,
  toggleHistoryOpen,
  expandedHistoryField,
  setExpandedHistoryField,
}: NeedSetFieldHistoryProps) {
  if (historyFields.length === 0 && !hasPreLlmData) return null;

  return (
    <div>
      <CollapsibleSectionHeader
        isOpen={historyOpen}
        onToggle={toggleHistoryOpen}
        summary={historyFields.length > 0
          ? <>{historyFields.length} tracked{stuckFieldCount > 0 && <span className="text-[var(--sf-state-error-fg)]"> &middot; {stuckFieldCount} stuck</span>}</>
          : <>awaiting search data</>
        }
      >
        field history
      </CollapsibleSectionHeader>

      {historyOpen && historyFields.length === 0 && (
        <div className="mt-3 px-4 py-3 rounded-sm sf-surface-elevated border sf-border-soft text-xs sf-text-muted italic">
          No search history yet &mdash; history populates as searches complete and fields accumulate evidence across rounds.
        </div>
      )}

      {historyOpen && historyFields.length > 0 && (
        <div className="mt-3 space-y-2">
          {/* Summary stat */}
          {stuckFieldCount > 0 && (
            <div className="px-4 py-2.5 rounded-sm border border-[var(--sf-state-error-border)] bg-[var(--sf-state-error-bg)] text-xs sf-text-muted italic">
              <strong className="not-italic text-[var(--sf-state-error-fg)]">{stuckFieldCount} field{stuckFieldCount !== 1 ? 's' : ''}</strong> failed {escalationThreshold}+ search rounds without finding a value — the planner will radically change strategy for these.
            </div>
          )}

          {/* History table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[112rem] border sf-border-soft rounded-sm">
            <table className="min-w-full text-xs">
              <thead className="sf-surface-elevated sticky top-0">
                <tr>
                  {['field', 'state', 'queries', 'domains', 'hosts', 'evidence', 'no-value', 'urls'].map(h => (
                    <th key={h} className="py-2 px-3 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {historyFields.map((f: NeedSetField) => {
                  const h = f.history;
                  if (!h) return null;
                  const isStuck = h.no_value_attempts >= escalationThreshold;
                  const isExpanded = expandedHistoryField === f.field_key;
                  const stB = resolveNeedsetState(f.state);
                  return (
                    <tr
                      key={f.field_key}
                      onClick={() => setExpandedHistoryField(isExpanded ? null : f.field_key)}
                      className={`border-b sf-border-soft cursor-pointer hover:sf-surface-elevated ${isStuck ? 'bg-[var(--sf-state-error-bg)]' : ''}`}
                    >
                      <td className="py-1.5 px-3 font-mono font-medium sf-text-primary">{f.field_key}</td>
                      <td className="py-1.5 px-3">
                        <span className="inline-flex items-center gap-1">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${resolveNeedsetState(f.state).dot}`} />
                          <span className={`text-[10px] font-semibold uppercase ${stB.badge}`}>{stB.label}</span>
                        </span>
                      </td>
                      <td className="py-1.5 px-3 font-mono text-center">{h.query_count}</td>
                      <td className="py-1.5 px-3 font-mono text-center">{h.domains_tried?.length ?? 0}</td>
                      <td className="py-1.5 px-3">
                        <div className="flex flex-wrap gap-0.5">
                          {(h.host_classes_tried ?? []).map(hc => (
                            <span key={hc} className="px-1 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.04em] sf-bg-surface-soft-strong sf-text-subtle">{hc}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="flex flex-wrap gap-0.5">
                          {(h.evidence_classes_tried ?? []).map(ec => (
                            <span key={ec} className={`px-1 py-0.5 rounded-sm text-[8px] font-bold uppercase tracking-[0.04em] ${queryFamilyBadge(ec)}`}>{ec.replace(/_/g, ' ')}</span>
                          ))}
                        </div>
                      </td>
                      <td className={`py-1.5 px-3 font-mono font-bold text-center ${isStuck ? 'text-[var(--sf-state-error-fg)]' : 'sf-text-muted'}`}>
                        {h.no_value_attempts}
                      </td>
                      <td className="py-1.5 px-3 font-mono text-center sf-text-muted">{h.urls_examined_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Expanded detail for selected field */}
          {expandedHistoryField && (() => {
            const f = historyFields.find((ff: NeedSetField) => ff.field_key === expandedHistoryField);
            const h = f?.history;
            if (!h) return null;
            return (
              <div className="sf-surface-elevated rounded-sm border sf-border-soft px-4 py-3 space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] sf-text-primary">
                  {expandedHistoryField} — search history detail
                </div>
                {(h.existing_queries?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">queries tried ({h.existing_queries?.length ?? 0})</div>
                    {(h.existing_queries ?? []).map((q, i) => (
                      <div key={i} className="pl-3 text-[11px] font-mono sf-text-muted leading-relaxed">&rarr; {q}</div>
                    ))}
                  </div>
                )}
                {(h.domains_tried?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle mb-1">domains visited ({h.domains_tried?.length ?? 0})</div>
                    <div className="flex flex-wrap gap-1.5 pl-3">
                      {(h.domains_tried ?? []).map(d => (
                        <span key={d} className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono sf-bg-surface-soft-strong sf-text-muted">{d}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[10px] font-mono sf-text-subtle pt-2 border-t sf-border-soft">
                  <span>dupes suppressed: <strong className="sf-text-primary">{h.duplicate_attempts_suppressed}</strong></span>
                  <span>refs found: <strong className="sf-text-primary">{h.refs_found ?? 0}</strong></span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
