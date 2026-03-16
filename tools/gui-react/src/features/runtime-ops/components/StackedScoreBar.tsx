interface Segment {
  label: string;
  value: number;
  color: string;
}

interface StackedScoreBarProps {
  segments: Segment[];
  className?: string;
  showLegend?: boolean;
}

export function StackedScoreBar({ segments, className, showLegend }: StackedScoreBarProps) {
  const total = segments.reduce((sum, s) => sum + Math.abs(s.value), 0);
  if (total === 0) return null;

  return (
    <div className={className || ''}>
      <div className="h-2.5 sf-meter-track rounded-full overflow-hidden flex">
        {segments.map((seg) => {
          const pct = total > 0 ? (Math.abs(seg.value) / total) * 100 : 0;
          if (pct < 0.5) return null;
          return (
            <div
              key={seg.label}
              className={`h-full ${seg.color} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${seg.value.toFixed(2)}`}
            />
          );
        })}
      </div>
      {showLegend && (
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-sm ${seg.color}`} />
              <span className="sf-text-nano sf-text-subtle">{seg.label}: {seg.value.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
