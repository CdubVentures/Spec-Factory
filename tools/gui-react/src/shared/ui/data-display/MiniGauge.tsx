import { memo } from 'react';
import './MiniGauge.css';

// WHY: r=8.5 inside a 22px box yields circumference 2π·8.5 ≈ 53.41.
// Centralized so callers cannot drift the ring math.
const RADIUS = 8.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type MiniGaugeTone = 'green' | 'yellow' | 'red' | 'gray';

export interface MiniGaugeProps {
  readonly ratio: number;
  readonly tone: MiniGaugeTone;
  readonly label: string;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function MiniGaugeInner({ ratio, tone, label }: MiniGaugeProps) {
  const clamped = clamp01(ratio);
  const dashOffset = CIRCUMFERENCE * (1 - clamped);
  const showFill = tone !== 'gray';
  return (
    <span className={`sf-mini-gauge sf-mini-gauge-${tone}`}>
      <span className="sf-mini-gauge-ring">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
          <circle
            cx="11"
            cy="11"
            r={RADIUS}
            fill="none"
            strokeWidth="2.5"
            className="sf-mini-gauge-track"
          />
          {showFill && (
            <circle
              cx="11"
              cy="11"
              r={RADIUS}
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE.toFixed(2)}
              strokeDashoffset={dashOffset.toFixed(2)}
              className="sf-mini-gauge-fill"
            />
          )}
        </svg>
      </span>
      <span className="sf-mini-gauge-label">{label}</span>
    </span>
  );
}

// WHY: rendered 3× per catalog row (coverage/confidence/fields columns) ×
// ~500 rows = 1500 cells per Overview render. Props are primitives, so
// default shallow equality dedupes identical renders.
export const MiniGauge = memo(MiniGaugeInner);
