import { confidenceTier } from './confidenceDiamondTiers.ts';
import './ConfidenceDiamond.css';

export interface ConfidenceDiamondProps {
  /** Confidence 0–100. <= 0 or NaN renders the empty (dashed) state. */
  readonly confidence: number;
}

/**
 * Solid-filled diamond with confidence value inside.
 * Shared between SKU + RDF Overview cells — both are per-variant scalar
 * finders with a single value+confidence per variant.
 *
 * Tier thresholds match keyFinder's ConfidenceRing:
 *   >=85 good, >=60 warn, >0 danger, =0 empty (dashed outline).
 */
export function ConfidenceDiamond({ confidence }: ConfidenceDiamondProps) {
  const tier = confidenceTier(confidence);
  const text = tier === 'empty' ? '\u2014' : String(Math.round(confidence));
  return (
    <svg className={`sf-conf-diamond sf-conf-diamond-${tier}`} viewBox="0 0 40 40" aria-hidden>
      <polygon points="20,2 38,20 20,38 2,20" />
      <text className="sf-conf-diamond-text" x="20" y="20">{text}</text>
    </svg>
  );
}
