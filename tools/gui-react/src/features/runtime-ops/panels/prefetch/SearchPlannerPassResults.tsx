import type { SearchPlanPass } from '../../types';
import { resolveLlmReasonBadge } from '../../badgeRegistries';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader';
import { Chip } from '../../../../shared/ui/feedback/Chip';
import { normalizeToken, normalizeQuery, planReason } from './searchPlannerHelpers';

/* ── Props ──────────────────────────────────────────────────────────── */

export interface SearchPlannerPassResultsProps {
  plans: SearchPlanPass[];
  totalQueries: number;
  executedQueryTokens: Set<string>;
  expandedPassQueries: Record<string, boolean>;
  toggleExpandedPassQuery: (key: string) => void;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function SearchPlannerPassResults({
  plans,
  totalQueries,
  executedQueryTokens,
  expandedPassQueries,
  toggleExpandedPassQuery,
}: SearchPlannerPassResultsProps) {
  return (
    <div>
      <SectionHeader>pass results &middot; {plans.length} pass{plans.length !== 1 ? 'es' : ''} &middot; {totalQueries} queries</SectionHeader>
      <div className="space-y-2">
        {plans.map((plan, i) => {
          const missingFields = plan.missing_critical_fields || [];
          const passRowKey = `${plan.pass_index ?? i}-${plan.pass_name || 'pass'}`;
          const queriesExpanded = Boolean(expandedPassQueries[passRowKey]);
          const sentToSearchCount = plan.queries_generated.reduce((sum, query) => (
            executedQueryTokens.has(normalizeToken(normalizeQuery(query))) ? sum + 1 : sum
          ), 0);
          const isAggressive = String(plan.mode || 'standard').toLowerCase() === 'aggressive';
          return (
            <div key={passRowKey} className="sf-surface-elevated rounded-sm border sf-border-soft overflow-hidden">
              {/* Pass header — clickable */}
              <div
                onClick={() => toggleExpandedPassQuery(passRowKey)}
                className="grid gap-4 px-5 py-3.5 cursor-pointer select-none"
                style={{ gridTemplateColumns: 'auto 1fr auto' }}
              >
                {/* Left: pass name pill */}
                <div className="pt-0.5">
                  <Chip label={plan.pass_name || `pass ${plan.pass_index + 1}`} className={resolveLlmReasonBadge(planReason(plan.pass_name, i))} />
                </div>
                {/* Center: metadata */}
                <div className="min-w-0">
                  <div className="text-[15px] font-bold sf-text-primary leading-tight">
                    {plan.pass_name?.replace(/_/g, ' ') || `Pass ${plan.pass_index + 1}`}
                  </div>
                  {plan.stop_condition && (
                    <div className="mt-0.5 text-xs sf-text-muted truncate">{plan.stop_condition}</div>
                  )}
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t sf-border-soft">
                    <Chip label={isAggressive ? 'aggressive' : 'standard'} className={isAggressive ? 'sf-chip-warning' : 'sf-chip-neutral'} />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted">
                      queries <strong className="sf-text-primary">{plan.queries_generated.length}</strong>
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted">
                      sent <strong className={sentToSearchCount > 0 ? 'text-[var(--sf-state-success-fg)]' : 'sf-text-primary'}>{sentToSearchCount}/{plan.queries_generated.length}</strong>
                    </span>
                    {missingFields.length > 0 && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted">
                        missing <strong className="text-[var(--sf-state-error-fg)]">{missingFields.length}</strong>
                      </span>
                    )}
                  </div>
                </div>
                {/* Right: expand indicator */}
                <div className="text-right shrink-0 pt-1">
                  <span className="text-[11px] font-mono sf-text-subtle">
                    {queriesExpanded ? '\u25B4' : '\u25BE'}
                  </span>
                </div>
              </div>

              {/* Expanded: rationale + missing fields + query list */}
              {queriesExpanded && (
                <div className="border-t sf-border-soft px-5 py-3.5 space-y-3">
                  {plan.plan_rationale && (
                    <div className="text-xs sf-text-muted italic">{plan.plan_rationale}</div>
                  )}
                  {missingFields.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">missing critical fields in pass</div>
                      <div className="flex flex-wrap gap-1.5">
                        {missingFields.map((f) => (
                          <Chip key={f} label={f} className="sf-chip-danger" />
                        ))}
                      </div>
                    </div>
                  )}
                  {plan.queries_generated.length > 0 && (
                    <div className="overflow-x-auto border sf-border-soft rounded-sm">
                      <table className="min-w-full text-xs">
                        <thead className="sf-surface-elevated sticky top-0">
                          <tr>
                            {['#', 'query', 'status'].map((h) => (
                              <th key={h} className="py-2 px-4 text-left border-b sf-border-soft text-[9px] font-bold uppercase tracking-[0.08em] sf-text-subtle">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {plan.queries_generated.map((query, qi) => {
                            const sentToSearch = executedQueryTokens.has(normalizeToken(normalizeQuery(query)));
                            return (
                              <tr key={qi} className={`border-b sf-border-soft ${sentToSearch ? 'sf-callout sf-callout-success' : ''}`}>
                                <td className="py-1.5 px-4 font-mono sf-text-subtle w-8">{qi + 1}</td>
                                <td className="py-1.5 px-4 font-mono sf-text-primary">{query}</td>
                                <td className="py-1.5 px-4">
                                  {sentToSearch ? (
                                    <Chip label="sent to search" className="sf-chip-success" />
                                  ) : (
                                    <span className="sf-text-subtle">&mdash;</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
