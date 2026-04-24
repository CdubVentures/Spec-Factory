/**
 * PIF variant-rings SVG geometry helpers.
 *
 * Produces stroke-dasharray strings for a segmented-ring stack where each
 * ring is divided into N arcs with ~gap px dividers, and the first
 * `filled` arcs are drawn in the fill colour. The rest of the arcs stay
 * on the track (dim).
 *
 * Pure — unit-testable; no React / DOM dependencies.
 */

export interface RingSegmentSpec {
  readonly filled: number;
  readonly target: number;
  readonly radius: number;
  /** Gap between segments in px. Ignored when target <= 1. */
  readonly gapPx?: number;
}

export interface RingDasharraySpec {
  /** Dash string for the track circle (always segmented when target > 1). */
  readonly track: string | null;
  /** Dash string for the fill circle. `null` when filled === 0. */
  readonly fill: string | null;
}

/**
 * Compute stroke-dasharray strings for a single ring.
 *
 * Rules:
 * - target <= 0 → no track, no fill (caller hides the ring)
 * - target === 1 → full circle track, fill is either 0 or a closed circle
 * - target > 1 → N equal arcs with gapPx dividers; first `filled` are drawn
 */
export function buildRingDasharray({
  filled,
  target,
  radius,
  gapPx = 3.5,
}: RingSegmentSpec): RingDasharraySpec {
  if (!(target > 0) || !(radius > 0)) return { track: null, fill: null };
  const circumference = 2 * Math.PI * radius;
  const safeFilled = Math.max(0, Math.min(Math.floor(filled), target));

  if (target === 1) {
    return {
      track: null, // undivided ring uses default track circle; caller omits dasharray
      fill: safeFilled > 0 ? `${circumference} 0` : null,
    };
  }

  const gap = Math.max(0, gapPx);
  const segLen = (circumference - gap * target) / target;
  // Safety: if gap consumes too much of the circumference, clamp segLen.
  const safeSegLen = Math.max(0.5, segLen);
  const track = `${safeSegLen} ${gap}`;

  if (safeFilled === 0) return { track, fill: null };

  // Build an explicit alternating dash pattern: visible, gap, visible, gap, …
  // Then replace the trailing gap with a large hidden tail so remaining
  // segments stay on the track only.
  const parts: number[] = [];
  for (let i = 0; i < safeFilled; i++) {
    parts.push(safeSegLen, gap);
  }
  const hiddenTail = circumference - (safeFilled * (safeSegLen + gap)) + gap;
  parts[parts.length - 1] = Math.max(0, hiddenTail);
  return { track, fill: parts.join(' ') };
}
