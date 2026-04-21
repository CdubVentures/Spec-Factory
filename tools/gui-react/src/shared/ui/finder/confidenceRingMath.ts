/**
 * Pure math for ConfidenceRing's SVG arc dasharray + label + colour class.
 * Unit-testable under `node --test` — no React / DOM dependency.
 */

const R = 15.5;
const CIRC = 2 * Math.PI * R; // ≈ 97.389

export type ConfidenceRingTone = 'good' | 'warn' | 'danger' | 'neutral';

export interface ConfidenceRingSpec {
  readonly dasharray: string;
  readonly tone: ConfidenceRingTone;
  /** Text rendered inside the ring. "—" when no confidence is available. */
  readonly label: string;
  /** True when label is the em-dash fallback (used for styling). */
  readonly isNa: boolean;
}

/**
 * Derive the SVG arc + label for a confidence value in [0, 1].
 * - null / NaN / negative → "—" with empty arc (neutral tone).
 * - Values are clamped into [0, 1] before computing arc length.
 * - Tone thresholds: >= 0.85 good, >= 0.60 warn, < 0.60 danger.
 */
export function deriveConfidenceRingSpec(confidence: number | null | undefined): ConfidenceRingSpec {
  if (confidence === null || confidence === undefined || Number.isNaN(confidence) || confidence < 0) {
    return { dasharray: `0 ${CIRC.toFixed(3)}`, tone: 'neutral', label: '—', isNa: true };
  }
  const clamped = Math.min(1, confidence);
  const arcLen = clamped * CIRC;
  const label = String(Math.round(clamped * 100));
  const tone: ConfidenceRingTone =
    clamped >= 0.85 ? 'good' :
    clamped >= 0.60 ? 'warn' :
    'danger';
  return {
    dasharray: `${arcLen.toFixed(3)} ${CIRC.toFixed(3)}`,
    tone,
    label,
    isNa: false,
  };
}
