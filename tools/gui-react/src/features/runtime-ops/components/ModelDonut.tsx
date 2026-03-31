import type { DonutSegment } from '../panels/workers/llmDashboardHelpers.ts';
import { fmtCost } from '../panels/workers/llmDashboardHelpers.ts';
import { shortModel } from '../selectors/llmModelHelpers.ts';

interface ModelDonutProps {
  segments: DonutSegment[];
  centerLabel: string | number;
  centerCaption: string;
  showLegend?: boolean;
}

export function ModelDonut({ segments, centerLabel, centerCaption, showLegend = true }: ModelDonutProps) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative w-[110px] h-[110px]">
        <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
          {segments.map((seg) => (
            <circle
              key={seg.model}
              cx="50" cy="50" r="43"
              fill="none"
              stroke={seg.color}
              strokeWidth="14"
              strokeDasharray={seg.dashArray}
              strokeDashoffset={seg.dashOffset}
              opacity="0.85"
            />
          ))}
          {segments.length === 0 && (
            <circle cx="50" cy="50" r="43" fill="none" stroke="var(--sf-token-border-default)" strokeWidth="14" opacity="0.3" />
          )}
        </svg>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <div className="text-lg font-extrabold font-mono sf-text-primary leading-none">{centerLabel}</div>
          <div className="text-[9px] sf-text-dim uppercase font-semibold tracking-[0.05em]">{centerCaption}</div>
        </div>
      </div>
      {showLegend && segments.length > 0 && (
        <div className="flex flex-col gap-1 w-full">
          {segments.map((seg) => (
            <div key={seg.model} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: seg.color }} />
              <span className="sf-text-muted truncate">{shortModel(seg.model)}</span>
              <span className="ml-auto font-mono sf-text-dim">{seg.calls} &middot; {fmtCost(seg.costUsd)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
