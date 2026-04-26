// WHY: All color outputs flow through theme tokens via semantic classes
// (.traffic-*, .sf-callout-*, .sf-status-text-*) defined in theme.css.
// Themes can re-skin without editing this file.

export function trafficColor(color: string): string {
  switch (color) {
    case 'green': return 'traffic-green';
    case 'yellow': return 'traffic-yellow';
    case 'red': return 'traffic-red';
    case 'purple': return 'traffic-purple';
    case 'teal': return 'traffic-teal';
    default: return 'traffic-gray';
  }
}

export function trafficTextColor(color: string): string {
  switch (color) {
    case 'green': return 'sf-status-text-success';
    case 'yellow': return 'sf-status-text-warning';
    case 'red': return 'sf-status-text-danger';
    case 'purple': return 'sf-text-timeout';
    case 'teal': return 'sf-status-text-info';
    default: return 'sf-status-text-muted';
  }
}

// ── Source badge color maps ─────────────────────────────────────
// Shared across DrawerShell, EnumSubTab, ComponentReviewDrawer, etc.
// Uses semantic callout classes \u2014 each pair (light bg + light text + dark bg
// + dark text) collapses into a single theme-aware class.

/** Source badge (works on both light and dark theme surfaces) */
export const sourceBadgeClass: Record<string, string> = {
  reference:          'sf-callout-info',
  override:           'sf-callout-warning',
  pipeline:           'sf-callout-warning',
  manual:             'sf-callout-success',
  user:               'sf-callout-timeout',
  pending_ai:         'sf-callout-timeout',
  pending_ai_primary: 'sf-callout-info',
  pending_ai_shared:  'sf-callout-timeout',
};

/** Dark-background source badge (used in tooltips with dark surface).
 *  Same callout classes work on both \u2014 they read theme tokens. */
export const sourceBadgeDarkClass: Record<string, string> = sourceBadgeClass;

export const SOURCE_BADGE_FALLBACK = 'sf-callout-neutral';
export const SOURCE_BADGE_DARK_FALLBACK = 'sf-callout-neutral';

// ── Threshold-anchored 4-band confidence color scale ──
//
// WHY: Confidence badges should signal "would this publish under the current
// publishConfidenceThreshold?" — not an absolute percentile. Below the bar is
// red (not going to publish). At the bar is amber/yellow-green (borderline).
// Well above is green (comfortably passes). The `threshold` is the global
// `publishConfidenceThreshold` (0-1 fraction). Default 0.7 matches the
// publisher default so callers without a runtime threshold still see
// gate-coherent colors.
//
// Bands (assuming threshold = 0.7):
//   score >= 0.80  → conf-100  (green,   strong pass)
//   score >= 0.70  → conf-70   (yellow-green, pass / at threshold)
//   score >= 0.60  → conf-40   (amber,   close miss / borderline)
//   score <  0.60  → conf-10   (red,     fail)
//
// Non-finite input (null/undefined/NaN) maps to conf-10.
export function confidenceColorClass(score: number, threshold: number = 0.7): string {
  if (!Number.isFinite(score) || !Number.isFinite(threshold)) return 'conf-10';
  if (score >= threshold + 0.1) return 'conf-100';
  if (score >= threshold) return 'conf-70';
  if (score >= threshold - 0.1) return 'conf-40';
  return 'conf-10';
}

export function statusBg(status: string): string {
  switch (status) {
    case 'complete':     return 'sf-callout-success';
    case 'running':      return 'sf-callout-info';
    case 'pending':      return 'sf-callout-neutral';
    case 'exhausted':    return 'sf-callout-warning';
    case 'failed':       return 'sf-callout-danger';
    case 'needs_manual': return 'sf-callout-timeout';
    default:             return 'sf-callout-neutral';
  }
}
