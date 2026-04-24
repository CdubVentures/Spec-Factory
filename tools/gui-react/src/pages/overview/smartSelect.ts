import type { CatalogRow } from '../../types/product.ts';

export interface SmartSelectHistoryEntry {
  readonly productId: string;
  readonly selectedAt: number;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Picks {@link sampleSize} productIds at random from the bottom quartile of
 * rows (sorted ascending by `coverage`). Quartile size is always at least
 * {@link sampleSize} so the pool never starves on small catalogs.
 *
 * Pure — pass an `rng` to make it deterministic in tests.
 */
export function pickBottomQuartileSample(
  rows: readonly CatalogRow[],
  sampleSize: number,
  rng: () => number = Math.random,
): string[] {
  if (rows.length === 0 || sampleSize <= 0) return [];
  const sorted = rows.slice().sort((a, b) => a.coverage - b.coverage);
  const quartileEnd = Math.max(sampleSize, Math.ceil(sorted.length * 0.25));
  const pool = sorted.slice(0, Math.min(quartileEnd, sorted.length));
  return shuffle(pool, rng).slice(0, Math.min(sampleSize, pool.length)).map((r) => r.productId);
}

/**
 * Picks the "next" batch of low-coverage products, excluding anything picked
 * within the last 24 hours. Returns both the new picks and the updated history
 * (caller persists). Entries older than 24h are pruned from the returned
 * history so the localStorage payload stays bounded.
 *
 * Pool semantics: after exclusion, runs {@link pickBottomQuartileSample} on
 * the remaining rows — so "next" still honors the bottom-quartile rule.
 *
 * Pure — pass `now` and `rng` to make it deterministic in tests.
 */
export function pickNextBatch(
  rows: readonly CatalogRow[],
  sampleSize: number,
  history: readonly SmartSelectHistoryEntry[],
  now: number = Date.now(),
  rng: () => number = Math.random,
): { selected: string[]; updatedHistory: SmartSelectHistoryEntry[] } {
  const cutoff = now - ONE_DAY_MS;
  const fresh = history.filter((h) => h.selectedAt >= cutoff);
  const excluded = new Set(fresh.map((h) => h.productId));
  const pool = rows.filter((r) => !excluded.has(r.productId));
  const picks = pickBottomQuartileSample(pool, sampleSize, rng);
  const updatedHistory: SmartSelectHistoryEntry[] = [
    ...fresh,
    ...picks.map((pid) => ({ productId: pid, selectedAt: now })),
  ];
  return { selected: picks, updatedHistory };
}

/**
 * Prune expired history entries (helper for the persistence hook).
 */
export function pruneHistory(
  history: readonly SmartSelectHistoryEntry[],
  now: number = Date.now(),
): SmartSelectHistoryEntry[] {
  const cutoff = now - ONE_DAY_MS;
  return history.filter((h) => h.selectedAt >= cutoff);
}
