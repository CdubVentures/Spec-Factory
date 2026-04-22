/**
 * FinderTabStatus — status glyph for a single IndexingTabBar tab.
 *
 * Renders exactly one of:
 *   - Running pip (when status === 'running')
 *   - Done ring + check (when numerator >= denominator, or status === 'complete' without ratio)
 *   - Progress ring with % label (when percent + denominator are defined)
 *   - "Empty" dashed pip (when status === 'empty' without ratio)
 *   - "Idle" pip (fallback)
 */

import type { FinderTabStatus as Status } from '../../../shared/ui/finder/tabSummary.ts';

export interface FinderTabStatusProps {
  readonly status: Status;
  readonly percent?: number;
  readonly numerator?: number;
  readonly denominator?: number;
}

export function FinderTabStatus({ status, percent, numerator, denominator }: FinderTabStatusProps) {
  if (status === 'running') {
    return (
      <span className="finder-tab-pip finder-tab-pip-running" aria-label="status: running">
        <span className="finder-tab-pip-blink" aria-hidden />
        Running
      </span>
    );
  }

  const hasRatio = typeof percent === 'number' && typeof denominator === 'number' && denominator > 0;
  const isFilled = hasRatio && typeof numerator === 'number' && numerator >= denominator;

  if (isFilled || (status === 'complete' && !hasRatio)) {
    return <DoneRing label={`status: complete`} />;
  }

  if (hasRatio) {
    return <ProgressRing percent={percent!} />;
  }

  if (status === 'empty') {
    return (
      <span className="finder-tab-pip finder-tab-pip-empty" aria-label="status: empty">
        Empty
      </span>
    );
  }

  return (
    <span className="finder-tab-pip" aria-label={`status: ${status}`}>
      Idle
    </span>
  );
}

const RING_R = 11;
const RING_CIRC = 2 * Math.PI * RING_R;
const RING_CIRC_STR = RING_CIRC.toFixed(3);

function ProgressRing({ percent }: { readonly percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = (RING_CIRC * (1 - clamped / 100)).toFixed(3);
  return (
    <svg
      className="finder-tab-ring"
      viewBox="0 0 28 28"
      aria-label={`${Math.round(clamped)} percent`}
      role="img"
    >
      <circle
        className="finder-tab-ring-track"
        cx="14"
        cy="14"
        r={RING_R}
        fill="none"
        strokeWidth="2.5"
      />
      <circle
        className="finder-tab-ring-fill"
        cx="14"
        cy="14"
        r={RING_R}
        fill="none"
        strokeWidth="2.5"
        strokeDasharray={RING_CIRC_STR}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
      />
      <text className="finder-tab-ring-label" x="14" y="16.5" textAnchor="middle">
        {Math.round(clamped)}
      </text>
    </svg>
  );
}

function DoneRing({ label }: { readonly label: string }) {
  return (
    <svg
      className="finder-tab-ring finder-tab-ring-done"
      viewBox="0 0 28 28"
      aria-label={label}
      role="img"
    >
      <circle
        className="finder-tab-ring-track"
        cx="14"
        cy="14"
        r={RING_R}
        fill="none"
        strokeWidth="2.5"
      />
      <circle
        className="finder-tab-ring-fill"
        cx="14"
        cy="14"
        r={RING_R}
        fill="none"
        strokeWidth="2.5"
        strokeDasharray={RING_CIRC_STR}
        strokeDashoffset="0"
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
      />
      <polyline
        className="finder-tab-ring-check"
        points="9.5,14.5 13,18 19,11"
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
