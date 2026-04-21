import { buildSlotDots, deriveSlotFracTone } from './slotDotsHelpers.ts';
import './VariantSlotDots.css';

export interface VariantSlotDotsProps {
  readonly viewsFilled: number;
  readonly viewsTotal: number;
  readonly heroFilled: number;
  readonly heroTotal: number;
}

/**
 * PIF per-variant slot-dot visualiser. Views as circle dots, hero as
 * rotated square. Inline "X / Y" fraction next to each group.
 */
export function VariantSlotDots({
  viewsFilled, viewsTotal, heroFilled, heroTotal,
}: VariantSlotDotsProps) {
  const viewDots = buildSlotDots(viewsFilled, viewsTotal);
  const heroDots = buildSlotDots(heroFilled, heroTotal);
  const viewsTone = deriveSlotFracTone(viewsFilled, viewsTotal);
  const heroTone = deriveSlotFracTone(heroFilled, heroTotal);

  return (
    <span className="sf-slot-dots">
      <span className="sf-slot-dots-group">
        <span className="sf-slot-dots-label">Views</span>
        <span className="sf-slot-dots-dots">
          {viewDots.map((d, i) => (
            <span key={i} className={`sf-slot-dot ${d.filled ? 'sf-slot-dot-filled' : ''}`} />
          ))}
        </span>
        <span className={`sf-slot-dots-frac sf-slot-dots-frac-${viewsTone}`}>
          {viewsFilled} / {viewsTotal}
        </span>
      </span>
      <span className="sf-slot-dots-group">
        <span className="sf-slot-dots-label">Hero</span>
        <span className="sf-slot-dots-dots">
          {heroDots.map((d, i) => (
            <span key={i} className={`sf-slot-dot sf-slot-dot-hero ${d.filled ? 'sf-slot-dot-filled' : ''}`} />
          ))}
        </span>
        <span className={`sf-slot-dots-frac sf-slot-dots-frac-${heroTone}`}>
          {heroFilled} / {heroTotal}
        </span>
      </span>
    </span>
  );
}
