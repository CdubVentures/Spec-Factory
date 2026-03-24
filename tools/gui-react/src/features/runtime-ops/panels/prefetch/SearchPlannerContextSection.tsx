import { CollapsibleSectionHeader } from '../../../../shared/ui/data-display/CollapsibleSectionHeader';
import { Chip } from '../../../../shared/ui/feedback/Chip';
import type { PlannerInputSummary } from './searchPlannerHelpers';

/* ── Props ──────────────────────────────────────────────────────────── */

export interface SearchPlannerContextSectionProps {
  plannerInputSummary: PlannerInputSummary;
  contextOpen: boolean;
  toggleContextOpen: () => void;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function SearchPlannerContextSection({
  plannerInputSummary,
  contextOpen,
  toggleContextOpen,
}: SearchPlannerContextSectionProps) {
  if (plannerInputSummary.callCountWithPayload === 0) return null;

  return (
    <div>
      <CollapsibleSectionHeader
        isOpen={contextOpen}
        onToggle={toggleContextOpen}
        summary={<>{plannerInputSummary.missingCriticalFields.length} missing &middot; {plannerInputSummary.existingQueries.length} existing &middot; {plannerInputSummary.criticalFields.length} critical</>}
      >
        planner context
      </CollapsibleSectionHeader>

      {contextOpen && (
        <div className="sf-surface-elevated rounded-sm border sf-border-soft px-5 py-4 mt-3 space-y-4">
          {plannerInputSummary.products.length > 0 && (
            <div>
              <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">product identity</div>
              <div className="flex flex-wrap gap-1.5">
                {plannerInputSummary.products.map((p) => (
                  <Chip key={p} label={p} className="sf-chip-accent" />
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">
              missing critical fields ({plannerInputSummary.missingCriticalFields.length})
            </div>
            {plannerInputSummary.missingCriticalFields.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {plannerInputSummary.missingCriticalFields.map((f) => (
                  <Chip key={f} label={f} className="sf-chip-danger" />
                ))}
              </div>
            ) : (
              <div className="sf-text-caption sf-text-subtle">none</div>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">
              critical fields ({plannerInputSummary.criticalFields.length})
            </div>
            {plannerInputSummary.criticalFields.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {plannerInputSummary.criticalFields.map((f) => (
                  <Chip key={f} label={f} className="sf-chip-warning" />
                ))}
              </div>
            ) : (
              <div className="sf-text-caption sf-text-subtle">none</div>
            )}
          </div>
          <div>
            <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.06em] sf-text-subtle">
              existing queries ({plannerInputSummary.existingQueries.length})
            </div>
            {plannerInputSummary.existingQueries.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {plannerInputSummary.existingQueries.slice(0, 18).map((q) => (
                  <Chip key={q} label={q} className="sf-chip-neutral" />
                ))}
                {plannerInputSummary.existingQueries.length > 18 && (
                  <span className="sf-text-caption sf-text-muted">+{plannerInputSummary.existingQueries.length - 18} more</span>
                )}
              </div>
            ) : (
              <div className="sf-text-caption sf-text-subtle">none</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
