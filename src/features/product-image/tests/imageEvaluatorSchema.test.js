/**
 * imageEvaluatorSchema contract tests.
 *
 * Exhaustive boundary tests for the Zod schemas that validate
 * LLM vision evaluator responses (view winner + hero selection).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { viewEvalResponseSchema, heroEvalResponseSchema } from '../imageEvaluatorSchema.js';

/* ── viewEvalResponseSchema ─────────────────────────────────────── */

describe('viewEvalResponseSchema', () => {
  const validWinner = {
    filename: 'top-black.png',
    reasoning: 'Clean cutout, sharp edges, product centered.',
  };

  it('accepts a valid winner with no rejected', () => {
    const input = { winner: validWinner };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.winner.filename, 'top-black.png');
  });

  it('accepts winner with rejected array', () => {
    const input = {
      winner: validWinner,
      rejected: [{ filename: 'top-black-2.png', flags: ['watermark'] }],
    };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rejected.length, 1);
  });

  it('accepts winner with empty rejected array', () => {
    const input = { winner: validWinner, rejected: [] };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
  });

  it('accepts winner with omitted rejected (optional)', () => {
    const input = { winner: validWinner };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rejected, undefined);
  });

  it('accepts all 5 valid flag values in rejected', () => {
    const input = {
      winner: validWinner,
      rejected: [{
        filename: 'bad.png',
        flags: ['watermark', 'badge', 'cropped', 'wrong_product', 'other'],
        reasoning: 'Multiple issues',
      }],
    };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rejected[0].flags.length, 5);
  });

  it('accepts view rejected entry without flags (outranked, not disqualified)', () => {
    const input = {
      winner: validWinner,
      rejected: [{ filename: 'ok-but-worse.png', reasoning: 'Lower resolution than winner' }],
    };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rejected[0].flags, undefined);
    assert.equal(result.data.rejected[0].reasoning, 'Lower resolution than winner');
  });

  it('accepts rejected entry with reasoning', () => {
    const input = {
      winner: validWinner,
      rejected: [{ filename: 'bad.png', flags: ['watermark'], reasoning: 'Visible watermark overlay in corner' }],
    };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rejected[0].reasoning, 'Visible watermark overlay in corner');
  });

  it('accepts rejected entry without reasoning (backward compat)', () => {
    const input = {
      winner: validWinner,
      rejected: [{ filename: 'bad.png', flags: ['watermark'] }],
    };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rejected[0].reasoning, undefined);
  });

  it('accepts multiple rejected entries', () => {
    const input = {
      winner: validWinner,
      rejected: [
        { filename: 'a.png', flags: ['watermark'] },
        { filename: 'b.png', flags: ['wrong_product'] },
        { filename: 'c.png', flags: ['cropped', 'badge'] },
      ],
    };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rejected.length, 3);
  });

  // --- Missing required fields ---

  it('rejects missing winner', () => {
    const result = viewEvalResponseSchema.safeParse({ rejected: [] });
    assert.equal(result.success, false);
  });

  it('rejects missing winner filename', () => {
    const result = viewEvalResponseSchema.safeParse({
      winner: { reasoning: 'no filename' },
    });
    assert.equal(result.success, false);
  });

  it('rejects missing winner reasoning', () => {
    const result = viewEvalResponseSchema.safeParse({
      winner: { filename: 'top.png' },
    });
    assert.equal(result.success, false);
  });

  it('rejects rejected entry missing filename', () => {
    const result = viewEvalResponseSchema.safeParse({
      winner: validWinner,
      rejected: [{ flags: ['watermark'] }],
    });
    assert.equal(result.success, false);
  });

  it('accepts rejected entry with only filename (flags + reasoning both optional)', () => {
    const result = viewEvalResponseSchema.safeParse({
      winner: validWinner,
      rejected: [{ filename: 'bad.png' }],
    });
    assert.equal(result.success, true);
  });

  // --- Invalid types ---

  it('rejects unknown flag value in rejected', () => {
    const result = viewEvalResponseSchema.safeParse({
      winner: validWinner,
      rejected: [{ filename: 'bad.png', flags: ['blurry'] }],
    });
    assert.equal(result.success, false);
  });

  // --- Edge cases ---

  it('accepts very long reasoning string', () => {
    const result = viewEvalResponseSchema.safeParse({
      winner: { ...validWinner, reasoning: 'x'.repeat(10000) },
    });
    assert.equal(result.success, true);
  });

  it('accepts null winner (all candidates rejected)', () => {
    const input = {
      winner: null,
      rejected: [
        { filename: 'bad1.png', flags: ['watermark'] },
        { filename: 'bad2.png', flags: ['wrong_product'] },
      ],
    };
    const result = viewEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.winner, null);
    assert.equal(result.data.rejected.length, 2);
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

  // --- Hero rejected entries ---

  it('accepts heroes with rejected array', () => {
    const input = {
      heroes: [validHero],
      rejected: [{ filename: 'bad.png', reasoning: 'Mouse is not the focal point — desk overview shot' }],
    };
    const result = heroEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rejected.length, 1);
    assert.equal(result.data.rejected[0].reasoning, 'Mouse is not the focal point — desk overview shot');
  });

  it('accepts heroes without rejected (backward compat)', () => {
    const result = heroEvalResponseSchema.safeParse({ heroes: [validHero] });
    assert.equal(result.success, true);
    assert.equal(result.data.rejected, undefined);
  });

  it('accepts hero rejected entry with flags + reasoning', () => {
    const input = {
      heroes: [],
      rejected: [{ filename: 'bad.png', flags: ['watermark'], reasoning: 'Getty watermark visible' }],
    };
    const result = heroEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.deepStrictEqual(result.data.rejected[0].flags, ['watermark']);
  });

  it('accepts hero rejected entry with reasoning only (no flags)', () => {
    const input = {
      heroes: [],
      rejected: [{ filename: 'bad.png', reasoning: 'Editorial review photo — copyright risk' }],
    };
    const result = heroEvalResponseSchema.safeParse(input);
    assert.equal(result.success, true);
    assert.equal(result.data.rejected[0].flags, undefined);
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
