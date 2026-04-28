import { buildRingDasharray } from './pifRingMath.ts';
import { buildPifVariantRingSpecs, type PifVariantRingProgress } from './pifVariantRingRoles.ts';
import './PifVariantRings.css';

export type PifVariantRingsProps = PifVariantRingProgress;

/**
 * 3 concentric segmented rings per variant:
 *   Outer  (r=21) - carousel views filled over scored carousel view target
 *   Middle (r=14) - additional non-scored carousel images over extra target
 *   Inner  (r=7)  - hero slots over heroCount when heroEnabled
 *
 * Each ring is divided into N arcs where N = target; first `filled` arcs
 * are drawn in the ring's color (amber while partial, theme color when
 * complete). Empty rings still render segmented tracks when target > 0.
 */
export function PifVariantRings(props: PifVariantRingsProps) {
  const rings = buildPifVariantRingSpecs(props);

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
