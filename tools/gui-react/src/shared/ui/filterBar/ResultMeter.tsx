/**
 * ResultMeter — "shown / total · label" with a micro progress bar.
 *
 * Tone rules:
 *   - zero        → red
 *   - < 30%       → orange (warn)
 *   - otherwise   → accent
 *
 * The bar is an absolutely-positioned fill over a 72×3 track; colors resolve
 * via inline var(--sf-state-*-fg) to match BillingFilterBar's dot pattern.
 */

import { memo } from 'react';

interface ResultMeterProps {
  readonly shown: number;
  readonly total: number;
  readonly label?: string;
}

type Tone = 'accent' | 'warn' | 'zero';

function toneFor(shown: number, total: number): Tone {
  if (total === 0) return 'accent';
  if (shown === 0) return 'zero';
  if (shown / total < 0.3) return 'warn';
  return 'accent';
}

function colorForTone(tone: Tone): string {
  if (tone === 'zero') return 'var(--sf-state-danger-fg)';
  if (tone === 'warn') return 'var(--sf-state-warning-fg)';
  return 'var(--sf-token-accent)';
}

export const ResultMeter = memo(function ResultMeter({ shown, total, label = 'keys' }: ResultMeterProps) {
  const tone = toneFor(shown, total);
  const pct = total > 0 ? Math.max(0, Math.min(100, (shown / total) * 100)) : 0;
  const color = colorForTone(tone);
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] sf-text-primary tabular-nums">
      <span>
        <span className="font-bold" style={{ color }}>{shown}</span>
        <span className="sf-text-muted"> of {total}</span>
      </span>
      <span className="sf-text-muted text-[11.5px]">{label}</span>
      <span
        className="relative inline-block w-[72px] h-[3px] rounded-full overflow-hidden"
        style={{ background: 'var(--sf-token-border-soft, var(--sf-token-border-default))' }}
        aria-hidden
      >
        <span
          className="absolute left-0 top-0 h-full rounded-full transition-[width] duration-200"
          style={{ width: `${pct}%`, background: color }}
        />
      </span>
    </span>
  );
});
