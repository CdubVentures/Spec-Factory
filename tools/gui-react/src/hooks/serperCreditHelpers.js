// WHY: Pure functions for Serper credit display, separated from the
// React hook so they're testable via node --test without a TS loader.

/**
 * Maps a credit balance to a semantic chip class.
 * @param {number | null} credit
 * @returns {string}
 */
export function creditChipClass(credit) {
  if (credit == null) return 'sf-chip-neutral';
  if (credit > 500) return 'sf-chip-success';
  if (credit > 100) return 'sf-chip-warning';
  return 'sf-chip-danger';
}

/**
 * Formats a credit number for display (e.g. 2500 → "2,500").
 * @param {number | null} credit
 * @returns {string}
 */
export function formatCredit(credit) {
  if (credit == null) return '?';
  return new Intl.NumberFormat('en-US').format(credit);
}
