/**
 * imageEvaluatorSchema contract tests.
 *
 * Exhaustive boundary tests for the Zod schemas that validate
 * LLM vision evaluator responses (view ranking + hero selection).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { viewEvalResponseSchema, heroEvalResponseSchema } from '../imageEvaluatorSchema.js';

/* ── viewEvalResponseSchema ─────────────────────────────────────── */

describe('viewEvalResponseSchema', () => {
  const validRanking = {
    filename: 'top-black.png',
    rank: 1,
    best: true,
    flags: [],
    reasoning: 'Clean cutout, sharp edges, product centered.',
  };

  it('accepts a valid rankings array', () => {
    const input = { rankings: [validRanking] };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.deepStrictEqual(result.data.rankings[0].filename, 'top-black.png');
  });

  it('accepts an empty rankings array', () => {
    const result = viewEvalResponseSchema.safeParse({ rankings: [] });
    assert.equal(result.success, true);
    assert.deepStrictEqual(result.data.rankings, []);
  });

  it('accepts multiple rankings', () => {
    const input = {
      rankings: [
        { ...validRanking, rank: 1, best: true },
        { ...validRanking, filename: 'top-black-2.png', rank: 2, best: false },
        { ...validRanking, filename: 'top-black-3.png', rank: 3, best: false, flags: ['watermark'] },
      ],
    };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rankings.length, 3);
  });

  it('accepts all 4 valid flag values', () => {
    const input = {
      rankings: [{
        ...validRanking,
        flags: ['watermark', 'badge', 'cropped', 'wrong_product'],
      }],
    };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rankings[0].flags.length, 4);
  });

  // --- Missing required fields ---

  it('rejects missing filename', () => {
    const { filename: _, ...noFilename } = validRanking;
    const result = viewEvalResponseSchema.safeParse({ rankings: [noFilename] });
    assert.equal(result.success, false);
  });

  it('rejects missing rank', () => {
    const { rank: _, ...noRank } = validRanking;
    const result = viewEvalResponseSchema.safeParse({ rankings: [noRank] });
    assert.equal(result.success, false);
  });

  it('rejects missing best', () => {
    const { best: _, ...noBest } = validRanking;
    const result = viewEvalResponseSchema.safeParse({ rankings: [noBest] });
    assert.equal(result.success, false);
  });

  it('rejects missing reasoning', () => {
    const { reasoning: _, ...noReasoning } = validRanking;
    const result = viewEvalResponseSchema.safeParse({ rankings: [noReasoning] });
    assert.equal(result.success, false);
  });

  // --- Invalid types ---

  it('rejects rank as string', () => {
    const result = viewEvalResponseSchema.safeParse({
      rankings: [{ ...validRanking, rank: '1' }],
    });
    assert.equal(result.success, false);
  });

  it('rejects best as number', () => {
    const result = viewEvalResponseSchema.safeParse({
      rankings: [{ ...validRanking, best: 1 }],
    });
    assert.equal(result.success, false);
  });

  it('rejects non-integer rank', () => {
    const result = viewEvalResponseSchema.safeParse({
      rankings: [{ ...validRanking, rank: 1.5 }],
    });
    assert.equal(result.success, false);
  });

  // --- Flag validation ---

  it('rejects unknown flag value', () => {
    const result = viewEvalResponseSchema.safeParse({
      rankings: [{ ...validRanking, flags: ['blurry'] }],
    });
    assert.equal(result.success, false);
  });

  // --- Edge cases ---

  it('accepts rank = 0', () => {
    const result = viewEvalResponseSchema.safeParse({
      rankings: [{ ...validRanking, rank: 0 }],
    });
    assert.equal(result.success, true);
  });

  it('accepts very long reasoning string', () => {
    const result = viewEvalResponseSchema.safeParse({
      rankings: [{ ...validRanking, reasoning: 'x'.repeat(10000) }],
    });
    assert.equal(result.success, true);
  });
});

/* ── heroEvalResponseSchema ─────────────────────────────────────── */

describe('heroEvalResponseSchema', () => {
  const validHero = {
    filename: 'top-black.png',
    hero_rank: 1,
    reasoning: 'Best overall product showcase angle.',
  };

  it('accepts a valid heroes array', () => {
    const result = heroEvalResponseSchema.safeParse({ heroes: [validHero] });
    assert.equal(result.success, true);
    assert.equal(result.data.heroes[0].hero_rank, 1);
  });

  it('accepts an empty heroes array', () => {
    const result = heroEvalResponseSchema.safeParse({ heroes: [] });
    assert.equal(result.success, true);
    assert.deepStrictEqual(result.data.heroes, []);
  });

  it('accepts multiple heroes', () => {
    const result = heroEvalResponseSchema.safeParse({
      heroes: [
        validHero,
        { ...validHero, filename: 'angle-black.png', hero_rank: 2 },
        { ...validHero, filename: 'sangle-black.png', hero_rank: 3 },
      ],
    });
    assert.equal(result.success, true);
    assert.equal(result.data.heroes.length, 3);
  });

  // --- Missing required fields ---

  it('rejects missing filename', () => {
    const { filename: _, ...noFilename } = validHero;
    const result = heroEvalResponseSchema.safeParse({ heroes: [noFilename] });
    assert.equal(result.success, false);
  });

  it('rejects missing hero_rank', () => {
    const { hero_rank: _, ...noRank } = validHero;
    const result = heroEvalResponseSchema.safeParse({ heroes: [noRank] });
    assert.equal(result.success, false);
  });

  it('rejects missing reasoning', () => {
    const { reasoning: _, ...noReasoning } = validHero;
    const result = heroEvalResponseSchema.safeParse({ heroes: [noReasoning] });
    assert.equal(result.success, false);
  });

  // --- Invalid types ---

  it('rejects hero_rank as string', () => {
    const result = heroEvalResponseSchema.safeParse({
      heroes: [{ ...validHero, hero_rank: '1' }],
    });
    assert.equal(result.success, false);
  });

  it('rejects non-integer hero_rank', () => {
    const result = heroEvalResponseSchema.safeParse({
      heroes: [{ ...validHero, hero_rank: 1.5 }],
    });
    assert.equal(result.success, false);
  });

  // --- Edge cases ---

  it('accepts hero_rank = 0', () => {
    const result = heroEvalResponseSchema.safeParse({
      heroes: [{ ...validHero, hero_rank: 0 }],
    });
    assert.equal(result.success, true);
  });
});
