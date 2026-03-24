import { pctString } from '../helpers.ts';

interface ConfidenceBarProps {
  value: number;
}

export function ConfidenceBar({ value }: ConfidenceBarProps) {
  const toneVar =
    value >= 0.9
      ? '--sf-state-success-border'
      : value >= 0.7
        ? '--sf-color-accent-rgb'
        : value >= 0.5
          ? '--sf-state-warning-border'
          : '--sf-state-danger-border';

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-16 h-1.5 rounded-full overflow-hidden"
        style={{ background: 'rgb(var(--sf-color-border-subtle-rgb) / 0.34)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.round(value * 100)}%`,
            background: toneVar === '--sf-color-accent-rgb'
              ? 'rgb(var(--sf-color-accent-rgb))'
              : `var(${toneVar})`,
          }}
        />
      </div>
      <span className="sf-text-caption sf-text-subtle font-mono w-8">
        {pctString(value)}
      </span>
    </div>
  );
}
