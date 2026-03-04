interface ScoreBarProps {
  value: number;
  max?: number;
  className?: string;
  barColor?: string;
  label?: string;
}

export function ScoreBar({ value, max = 100, className, barColor, label }: ScoreBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = barColor || (pct >= 70 ? 'sf-metric-fill-success' : pct >= 40 ? 'sf-metric-fill-warning' : 'sf-metric-fill-danger');

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <div className="flex-1 h-2 sf-meter-track rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {label !== undefined ? (
        <span className="sf-text-nano font-mono sf-text-primary shrink-0 w-10 text-right">{label}</span>
      ) : (
        <span className="sf-text-nano font-mono sf-text-primary shrink-0 w-10 text-right">{Math.round(pct)}%</span>
      )}
    </div>
  );
}
