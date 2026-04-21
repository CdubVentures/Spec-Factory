import { deriveConfidenceRingSpec } from './confidenceRingMath.ts';
import './ConfidenceRing.css';

export interface ConfidenceRingProps {
  /** Confidence in [0, 1]. null / undefined / NaN → shows em-dash with empty arc. */
  readonly confidence: number | null | undefined;
  /** Accessible + tooltip label. Defaults to "Confidence {percent}%" or "No confidence". */
  readonly title?: string;
}

/**
 * Circular confidence indicator. Ring arc covers confidence×100% of the
 * circumference; number inside is the percent (rounded). Used on variant
 * rows in scalar finder panels (RDF, SKU, …). Paired visually with
 * ImageCountBadge on PIF rows so all variant rows have a right-aligned
 * status badge of similar weight.
 */
export function ConfidenceRing({ confidence, title }: ConfidenceRingProps) {
  const spec = deriveConfidenceRingSpec(confidence);
  const tipText = title
    ?? (spec.isNa ? 'No confidence' : `Confidence ${spec.label}%`);
  return (
    <span className={`sf-confidence-ring sf-confidence-ring-${spec.tone}`} title={tipText} aria-label={tipText}>
      <svg viewBox="0 0 36 36" aria-hidden>
        <circle className="sf-confidence-ring-track" cx="18" cy="18" r="15.5" />
        {!spec.isNa && (
          <circle
            className="sf-confidence-ring-fill"
            cx="18" cy="18" r="15.5"
            strokeDasharray={spec.dasharray}
          />
        )}
      </svg>
      <span className={`sf-confidence-ring-label ${spec.isNa ? 'sf-confidence-ring-label-na' : ''}`}>
        {spec.label}
      </span>
    </span>
  );
}
