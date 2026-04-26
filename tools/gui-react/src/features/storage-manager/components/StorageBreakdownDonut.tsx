import { useMemo } from 'react';
import type { RunInventoryRow } from '../types.ts';
import { formatBytes } from '../helpers.ts';

interface DonutSegment {
  type: string;
  sizeBytes: number;
  color: string;
  dashArray: string;
  dashOffset: number;
}

const TYPE_COLORS: Record<string, string> = {
  html: 'var(--sf-token-accent)',
  screenshots: 'var(--sf-token-state-success-fg)',
  screenshot: 'var(--sf-token-state-success-fg)',
  video: 'var(--sf-token-state-warning-fg)',
};

const FALLBACK_COLORS = [
  'var(--sf-token-state-info-fg)',
  'var(--sf-token-state-error-fg)',
  'var(--sf-token-accent-strong)',
];

const CIRCUMFERENCE = 2 * Math.PI * 43;

function computeSegments(runs: RunInventoryRow[]): DonutSegment[] {
  const totals = new Map<string, number>();
  for (const run of runs) {
    for (const ab of run.storage_metrics?.artifact_breakdown ?? []) {
      totals.set(ab.type, (totals.get(ab.type) ?? 0) + ab.size_bytes);
    }
  }

  const entries = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return [];

  let fallbackIdx = 0;
  let offset = 0;
  return entries.map(([type, sizeBytes]) => {
    const fraction = sizeBytes / total;
    const dash = fraction * CIRCUMFERENCE;
    const color = TYPE_COLORS[type] ?? FALLBACK_COLORS[fallbackIdx++ % FALLBACK_COLORS.length];
    const seg: DonutSegment = {
      type,
      sizeBytes,
      color,
      dashArray: `${dash} ${CIRCUMFERENCE - dash}`,
      dashOffset: -offset,
    };
    offset += dash;
    return seg;
  });
}

interface StorageBreakdownDonutProps {
  runs: RunInventoryRow[];
}

export function StorageBreakdownDonut({ runs }: StorageBreakdownDonutProps) {
  const segments = useMemo(() => computeSegments(runs), [runs]);

  return (
    <div className="sf-surface-card rounded-lg p-4 flex flex-col gap-3">
      <h3 className="text-[10px] font-extrabold uppercase tracking-[0.07em] sf-text-subtle">
        Artifact Breakdown
      </h3>

      <div className="flex flex-col items-center gap-2.5">
        <div className="relative w-[110px] h-[110px]">
          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(-90deg)' }}>
            {segments.map((seg) => (
              <circle
                key={seg.type}
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
            <div className="text-lg font-extrabold font-mono sf-text-primary leading-none">{segments.length}</div>
            <div className="text-[9px] sf-text-dim uppercase font-semibold tracking-[0.05em]">types</div>
          </div>
        </div>

        {segments.length > 0 && (
          <div className="flex flex-col gap-1 w-full">
            {segments.map((seg) => (
              <div key={seg.type} className="flex items-center gap-1.5 text-[10px]">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: seg.color }} />
                <span className="sf-text-muted truncate capitalize">{seg.type}</span>
                <span className="ml-auto font-mono sf-text-dim">{formatBytes(seg.sizeBytes)}</span>
              </div>
            ))}
          </div>
        )}

        {segments.length === 0 && (
          <div className="text-[10px] sf-text-subtle">No artifact data</div>
        )}
      </div>
    </div>
  );
}
