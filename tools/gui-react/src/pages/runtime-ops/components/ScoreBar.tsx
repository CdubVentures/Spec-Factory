interface ScoreBarProps {
  value: number;
  max?: number;
  className?: string;
  barColor?: string;
  label?: string;
}

export function ScoreBar({ value, max = 100, className, barColor, label }: ScoreBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = barColor || (pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-400');

  return (
    <div className={`flex items-center gap-2 ${className || ''}`}>
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      {label !== undefined ? (
        <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 shrink-0 w-10 text-right">{label}</span>
      ) : (
        <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 shrink-0 w-10 text-right">{Math.round(pct)}%</span>
      )}
    </div>
  );
}
