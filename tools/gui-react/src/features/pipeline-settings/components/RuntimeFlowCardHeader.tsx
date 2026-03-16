import type { ReactNode } from 'react';
import { Tip } from '../../../shared/ui/feedback/Tip';

interface RuntimeFlowCardHeaderProps {
  runtimeStatusClass: string;
  runtimeStatusText: string;
  showInlineHeaderControls: boolean;
  runtimeHeaderControls: ReactNode;
}

export function RuntimeFlowCardHeader({
  runtimeStatusClass,
  runtimeStatusText,
  showInlineHeaderControls,
  runtimeHeaderControls,
}: RuntimeFlowCardHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold inline-flex items-center" style={{ color: 'var(--sf-text)' }}>
          Runtime Flow Settings
          <Tip text="Phase 3 runtime settings migration. These controls are ordered to match pipeline execution from start to finish." />
        </h3>
        <p className="mt-1 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
          Configure runtime behavior in pipeline order. Blue dots mark the selected step; enabled/disabled state is shown in each step row.
        </p>
        <p className={`mt-2 sf-text-label font-semibold ${runtimeStatusClass}`}>
          {runtimeStatusText}
        </p>
      </div>
      {showInlineHeaderControls ? runtimeHeaderControls : null}
    </div>
  );
}
