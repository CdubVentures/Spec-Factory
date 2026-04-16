import { FinderKpiCard } from '../../../shared/ui/finder/index.ts';
import type { KpiCard } from '../../../shared/ui/finder/types.ts';
import type { SaveStatus } from '../../../types/review.ts';

interface ReviewDashboardStripProps {
  readonly kpiCards: readonly KpiCard[];
  readonly saveStatus: SaveStatus;
}

export function ReviewDashboardStrip({
  kpiCards,
  saveStatus,
}: ReviewDashboardStripProps) {
  return (
    <div className="sf-review-dashboard-strip rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card) => (
          <FinderKpiCard key={card.label} value={card.value} label={card.label} tone={card.tone} />
        ))}
      </div>

      {saveStatus !== 'idle' && (
        <div className="flex items-center gap-2">
          {saveStatus === 'saving' && <span className="sf-text-nano sf-status-text-info">Saving...</span>}
          {saveStatus === 'saved' && <span className="sf-text-nano sf-status-text-success">Saved</span>}
          {saveStatus === 'error' && <span className="sf-text-nano sf-status-text-danger">Save failed</span>}
        </div>
      )}
    </div>
  );
}
