import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import {
  pickBottomQuartileSample,
  pickNextBatch,
  pruneHistory,
  type SmartSelectHistoryEntry,
} from '../smartSelect.ts';
import type { CatalogRow } from '../../../types/product.ts';

// Minimal CatalogRow factory — only the fields smartSelect reads.
function row(productId: string, coverage: number): CatalogRow {
  return {
    productId,
    id: 0,
    brand: '',
    model: '',
    base_model: '',
    variant: '',
    identifier: '',
    confidence: 0,
    coverage,
    fieldsFilled: 0,
    fieldsTotal: 0,
    cefRunCount: 0,
    pifVariants: [],
    skuVariants: [],
    rdfVariants: [],
    keyTierProgress: [],
  } as unknown as CatalogRow;
}

// Deterministic RNG — cycles through a seed list so tests are stable.
function seededRng(seeds: readonly number[]): () => number {
  let i = 0;
  return () => {
    const v = seeds[i % seeds.length];
    i += 1;
    return v;
  };
}

describe('pickBottomQuartileSample', () => {
  it('returns [] when rows is empty', () => {
    deepStrictEqual(pickBottomQuartileSample([], 5), []);
  });

  it('returns [] when sampleSize is 0 or negative', () => {
    deepStrictEqual(pickBottomQuartileSample([row('a', 0.1)], 0), []);
    deepStrictEqual(pickBottomQuartileSample([row('a', 0.1)], -3), []);
  });

  it('returns all productIds when rows.length <= sampleSize', () => {
    const result = pickBottomQuartileSample(
      [row('a', 0.5), row('b', 0.2), row('c', 0.9)],
      5,
      seededRng([0, 0, 0]),
    );
    strictEqual(result.length, 3);
    // All three should be present regardless of order.
    deepStrictEqual(result.slice().sort(), ['a', 'b', 'c']);
  });

  it('picks from the bottom quartile (small catalog)', () => {
    const rows = [
      row('hi1', 0.9), row('hi2', 0.8), row('hi3', 0.7),
      row('mid', 0.5),
      row('lo1', 0.1), row('lo2', 0.2), row('lo3', 0.3),
    ];
    // With sampleSize=3, quartile = max(3, ceil(7*0.25)) = max(3, 2) = 3, so
    // pool is the 3 lowest-coverage rows: lo1 / lo2 / lo3.
    const result = pickBottomQuartileSample(rows, 3, () => 0.5);
    strictEqual(result.length, 3);
    deepStrictEqual(result.slice().sort(), ['lo1', 'lo2', 'lo3']);
  });

  it('quartile grows with catalog size', () => {
    const rows: CatalogRow[] = [];
    for (let i = 0; i < 100; i += 1) rows.push(row(`p${i}`, i / 100));
    // sampleSize=20, quartileEnd=max(20, ceil(100*0.25))=25.
    // Pool = lowest 25 by coverage = p0..p24.
    const result = pickBottomQuartileSample(rows, 20, () => 0.5);
    strictEqual(result.length, 20);
    for (const pid of result) {
      const n = Number(pid.slice(1));
      ok(n < 25, `${pid} should be in bottom quartile`);
    }
  });

  it('is deterministic with a fixed rng', () => {
    const rows = [row('a', 0.1), row('b', 0.2), row('c', 0.3), row('d', 0.4)];
    const rng1 = seededRng([0.5, 0.5, 0.5]);
    const rng2 = seededRng([0.5, 0.5, 0.5]);
    const r1 = pickBottomQuartileSample(rows, 2, rng1);
    const r2 = pickBottomQuartileSample(rows, 2, rng2);
    deepStrictEqual(r1, r2);
  });
});

describe('pickNextBatch', () => {
  const NOW = 1_700_000_000_000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  it('behaves like pickBottomQuartileSample when history is empty', () => {
    const rows = [row('a', 0.1), row('b', 0.2), row('c', 0.3), row('d', 0.4)];
    const { selected } = pickNextBatch(rows, 2, [], NOW, () => 0.5);
    strictEqual(selected.length, 2);
  });

  it('excludes productIds selected within the last 24h', () => {
    const rows = [row('a', 0.1), row('b', 0.2), row('c', 0.3), row('d', 0.4)];
    const history: SmartSelectHistoryEntry[] = [
      { productId: 'a', selectedAt: NOW - 1000 },          // 1s ago — fresh
      { productId: 'b', selectedAt: NOW - ONE_DAY_MS / 2 }, // 12h ago — fresh
    ];
    const { selected } = pickNextBatch(rows, 4, history, NOW, () => 0.5);
    // 'a' and 'b' excluded, pool = [c, d]
    deepStrictEqual(selected.slice().sort(), ['c', 'd']);
  });

  it('includes productIds whose history entries have expired (>24h)', () => {
    const rows = [row('a', 0.1), row('b', 0.2)];
    const history: SmartSelectHistoryEntry[] = [
      { productId: 'a', selectedAt: NOW - ONE_DAY_MS - 1 }, // just past 24h
    ];
    const { selected } = pickNextBatch(rows, 2, history, NOW, () => 0.5);
    strictEqual(selected.length, 2);
    deepStrictEqual(selected.slice().sort(), ['a', 'b']);
  });

  it('returned updatedHistory preserves fresh entries and appends new picks', () => {
    const rows = [row('a', 0.1), row('b', 0.2), row('c', 0.3)];
    const history: SmartSelectHistoryEntry[] = [
      { productId: 'x', selectedAt: NOW - 1000 },
    ];
    const { selected, updatedHistory } = pickNextBatch(rows, 2, history, NOW, () => 0.5);
    // 'x' stays (fresh) + new picks get appended
    strictEqual(updatedHistory.length, 1 + selected.length);
    strictEqual(updatedHistory[0].productId, 'x');
    for (const pick of selected) {
      ok(
        updatedHistory.some((h) => h.productId === pick && h.selectedAt === NOW),
        `updatedHistory should contain ${pick} stamped at NOW`,
      );
    }
  });

  it('updatedHistory drops expired entries (pruning)', () => {
    const rows = [row('a', 0.1)];
    const history: SmartSelectHistoryEntry[] = [
      { productId: 'old', selectedAt: NOW - ONE_DAY_MS - 5000 },
      { productId: 'fresh', selectedAt: NOW - 5000 },
    ];
    const { updatedHistory } = pickNextBatch(rows, 1, history, NOW, () => 0.5);
    ok(!updatedHistory.some((h) => h.productId === 'old'), 'expired entry should be pruned');
    ok(updatedHistory.some((h) => h.productId === 'fresh'), 'fresh entry preserved');
  });

  it('returns empty selected when every eligible row is in the cooldown', () => {
    const rows = [row('a', 0.1), row('b', 0.2)];
    const history: SmartSelectHistoryEntry[] = [
      { productId: 'a', selectedAt: NOW - 1000 },
      { productId: 'b', selectedAt: NOW - 1000 },
    ];
    const { selected } = pickNextBatch(rows, 2, history, NOW, () => 0.5);
    deepStrictEqual(selected, []);
  });
});

describe('pruneHistory', () => {
  const NOW = 1_700_000_000_000;
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  it('drops entries older than 24h, keeps the rest', () => {
    const history: SmartSelectHistoryEntry[] = [
      { productId: 'expired', selectedAt: NOW - ONE_DAY_MS - 1 },
      { productId: 'boundary', selectedAt: NOW - ONE_DAY_MS },
      { productId: 'fresh', selectedAt: NOW - 100 },
    ];
    const result = pruneHistory(history, NOW);
    deepStrictEqual(
      result.map((h) => h.productId).sort(),
      ['boundary', 'fresh'],
    );
  });

  it('handles an empty history', () => {
    deepStrictEqual(pruneHistory([], NOW), []);
  });
});
