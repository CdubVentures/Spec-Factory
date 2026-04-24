import { buildRingDasharray } from './pifRingMath.ts';
import './PifVariantRings.css';

export interface PifVariantRingsProps {
  readonly priorityFilled: number;
  readonly priorityTotal: number;
  readonly loopFilled: number;
  readonly loopTotal: number;
  readonly heroFilled: number;
  readonly heroTarget: number;
}

interface RingSpec {
  readonly cls: 'outer' | 'middle' | 'inner';
  readonly radius: number;
  readonly filled: number;
  readonly target: number;
}

/**
 * 3 concentric segmented rings per variant:
 *   Outer  (r=21) — Priority Views (Single Run) — `viewConfig` entries with priority:true
 *   Middle (r=14) — Hero slots — `heroCount` when `heroEnabled`
 *   Inner  (r=7)  — Loop Run extras — `viewBudget` views NOT in priority
 *
 * Each ring is divided into N arcs where N = target; first `filled` arcs
 * are drawn in the ring's colour (amber while partial, theme colour when
 * complete). Empty rings still render segmented tracks when target > 0.
 */
export function PifVariantRings({
  priorityFilled, priorityTotal, loopFilled, loopTotal, heroFilled, heroTarget,
}: PifVariantRingsProps) {
  const rings: RingSpec[] = [
    { cls: 'outer',  radius: 21, filled: priorityFilled, target: priorityTotal },
    { cls: 'middle', radius: 14, filled: heroFilled,     target: heroTarget    },
    { cls: 'inner',  radius: 7,  filled: loopFilled,     target: loopTotal     },
  ];

  return (
    <span className="sf-pif-rings-stack">
      {rings.map((ring) => {
        const { track, fill } = buildRingDasharray({
          filled: ring.filled,
          target: ring.target,
          radius: ring.radius,
        });
        const state = ring.target > 0 && ring.filled >= ring.target
          ? 'done'
          : ring.filled > 0
            ? 'part'
            : 'empty';
        return (
          <svg
            key={ring.cls}
            className={`sf-pif-rings-svg sf-pif-rings-${ring.cls} ${state}`}
            viewBox="0 0 50 50"
            aria-hidden
          >
            <circle
              className="sf-pif-rings-track"
              cx="25" cy="25" r={ring.radius}
              {...(track ? { strokeDasharray: track } : {})}
            />
            {fill && (
              <circle
                className="sf-pif-rings-fill"
                cx="25" cy="25" r={ring.radius}
                strokeDasharray={fill}
              />
            )}
          </svg>
        );
      })}
    </span>
  );
}
