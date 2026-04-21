/**
 * Pure helpers for VariantSlotDots. Unit-testable under `node --test`.
 */

export interface SlotDotItem {
  readonly filled: boolean;
}

/**
 * Build a row of N "dot" descriptors — the first `filled` are filled, the
 * remainder are empty. `filled` is clamped to [0, total]; `total` is clamped
 * to [0, ∞).
 */
export function buildSlotDots(filled: number, total: number): readonly SlotDotItem[] {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeFilled = Math.max(0, Math.min(Math.floor(filled), safeTotal));
  return Array.from({ length: safeTotal }, (_, i) => ({ filled: i < safeFilled }));
}

export type SlotFracTone = 'none' | 'part' | 'done';

/**
 * Colour tone for an inline "X / Y" fraction. Mirrors the sample-html
 * semantics: dim when empty, amber when partial, green when complete.
 */
export function deriveSlotFracTone(filled: number, total: number): SlotFracTone {
  if (total <= 0 || filled <= 0) return 'none';
  if (filled >= total) return 'done';
  return 'part';
}
