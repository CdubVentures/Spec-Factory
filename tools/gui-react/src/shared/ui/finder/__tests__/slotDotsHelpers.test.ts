import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { buildSlotDots, deriveSlotFracTone } from '../slotDotsHelpers.ts';

describe('buildSlotDots', () => {
  it('returns an empty array when total is 0', () => {
    deepStrictEqual(buildSlotDots(0, 0), []);
  });

  it('returns all-empty dots when filled is 0', () => {
    deepStrictEqual(buildSlotDots(0, 3), [{ filled: false }, { filled: false }, { filled: false }]);
  });

  it('fills the first N dots', () => {
    deepStrictEqual(buildSlotDots(2, 4), [
      { filled: true }, { filled: true }, { filled: false }, { filled: false },
    ]);
  });

  it('clamps filled above total', () => {
    deepStrictEqual(buildSlotDots(10, 2), [{ filled: true }, { filled: true }]);
  });

  it('clamps filled below 0', () => {
    deepStrictEqual(buildSlotDots(-3, 2), [{ filled: false }, { filled: false }]);
  });

  it('floors fractional inputs', () => {
    deepStrictEqual(buildSlotDots(1.8, 3.9), [{ filled: true }, { filled: false }, { filled: false }]);
  });

  it('clamps negative total to 0', () => {
    deepStrictEqual(buildSlotDots(2, -5), []);
  });
});

describe('deriveSlotFracTone', () => {
  it('returns none when total is 0', () => {
    strictEqual(deriveSlotFracTone(0, 0), 'none');
  });
  it('returns none when filled is 0 and total > 0', () => {
    strictEqual(deriveSlotFracTone(0, 8), 'none');
  });
  it('returns part when 0 < filled < total', () => {
    strictEqual(deriveSlotFracTone(3, 8), 'part');
  });
  it('returns done when filled === total', () => {
    strictEqual(deriveSlotFracTone(8, 8), 'done');
  });
  it('returns done when filled > total (clamped conceptually)', () => {
    strictEqual(deriveSlotFracTone(10, 8), 'done');
  });
  it('returns none when total is negative', () => {
    strictEqual(deriveSlotFracTone(3, -1), 'none');
  });
});
