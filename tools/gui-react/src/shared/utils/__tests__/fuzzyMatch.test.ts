import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import { fuzzyMatch } from '../fuzzyMatch.ts';

describe('fuzzyMatch — empty inputs', () => {
  it('returns empty array for empty haystack', () => {
    deepStrictEqual(fuzzyMatch('anything', []), []);
  });

  it('returns every haystack entry with score 0 when query is empty', () => {
    const results = fuzzyMatch('', ['Razer', 'Logitech', 'Pulsar']);
    strictEqual(results.length, 3);
    for (const r of results) {
      strictEqual(r.score, 0);
      deepStrictEqual(r.matches, []);
    }
  });

  it('returns every haystack entry with score 0 when query is only whitespace', () => {
    const results = fuzzyMatch('   ', ['Razer', 'Logitech']);
    strictEqual(results.length, 2);
    strictEqual(results[0].score, 0);
  });
});

describe('fuzzyMatch — single-token scoring', () => {
  it('ranks exact match highest', () => {
    const results = fuzzyMatch('razer', ['Razer', 'Razerless', 'Hyperazer']);
    strictEqual(results[0].text, 'Razer');
    ok(results[0].score > results[1].score, 'exact should outrank prefix');
  });

  it('ranks prefix match above substring match', () => {
    const results = fuzzyMatch('vip', ['Viper', 'Big Viper', 'Improviper']);
    strictEqual(results[0].text, 'Viper');
    ok(results[0].score > results[1].score, 'prefix should outrank token-start');
    ok(results[1].score > results[2].score, 'token-start should outrank substring');
  });

  it('matches case-insensitively', () => {
    const results = fuzzyMatch('RAZER', ['razer']);
    strictEqual(results.length, 1);
    strictEqual(results[0].text, 'razer');
  });

  it('excludes entries with no match', () => {
    const results = fuzzyMatch('xyz', ['Razer', 'Logitech']);
    deepStrictEqual(results, []);
  });

  it('returns match ranges for highlighting', () => {
    const results = fuzzyMatch('vip', ['Viper']);
    strictEqual(results[0].matches.length, 1);
    deepStrictEqual(results[0].matches[0], [0, 3]);
  });

  it('detects token-start (word boundary) matches', () => {
    // "pro" starts a word in "Viper V2 Pro" — should outrank a substring match
    const results = fuzzyMatch('pro', ['Viper V2 Pro', 'Improvising']);
    strictEqual(results[0].text, 'Viper V2 Pro');
    ok(results[0].score > results[1].score);
  });

  it('breaks ties by shorter text', () => {
    // both prefix-match "viper"; shorter should win
    const results = fuzzyMatch('viper', ['Viper V2 Pro', 'Viper']);
    strictEqual(results[0].text, 'Viper');
  });
});

describe('fuzzyMatch — multi-token', () => {
  it('requires all tokens to match somewhere', () => {
    const haystack = ['Razer Viper V2 Pro White', 'Razer Viper Mini', 'Logitech G Pro'];
    // "razer viper" — both tokens must appear
    const results = fuzzyMatch('razer viper', haystack);
    strictEqual(results.length, 2);
    ok(results.every((r) => r.text.toLowerCase().includes('razer') && r.text.toLowerCase().includes('viper')));
  });

  it('excludes entries missing any token', () => {
    const results = fuzzyMatch('razer pulsar', ['Razer Viper', 'Pulsar X2', 'Razer Pulsar Ltd']);
    strictEqual(results.length, 1);
    strictEqual(results[0].text, 'Razer Pulsar Ltd');
  });

  it('merges overlapping match ranges', () => {
    // "vip" and "viper" both match "Viper V2 Pro" at overlapping positions — should merge
    const results = fuzzyMatch('vip viper', ['Viper V2 Pro']);
    strictEqual(results.length, 1);
    // merged into a single range starting at 0
    strictEqual(results[0].matches.length, 1);
    strictEqual(results[0].matches[0][0], 0);
  });

  it('collects multiple non-overlapping match ranges', () => {
    const results = fuzzyMatch('razer pro', ['Razer Viper V2 Pro']);
    strictEqual(results.length, 1);
    ok(results[0].matches.length >= 2, 'should have at least two separate ranges');
  });

  it('ignores duplicate tokens in query', () => {
    const single = fuzzyMatch('razer', ['Razer Viper']);
    const doubled = fuzzyMatch('razer razer', ['Razer Viper']);
    // both should match; doubled should not double-count score indefinitely
    strictEqual(doubled.length, 1);
    strictEqual(single.length, 1);
  });
});

describe('fuzzyMatch — options', () => {
  it('respects limit option (top N by score)', () => {
    const haystack = ['Viper', 'Viper V2 Pro', 'Big Viper', 'Improviper'];
    const results = fuzzyMatch('vip', haystack, { limit: 2 });
    strictEqual(results.length, 2);
    // top two should be the prefix matches (Viper first by tie-break)
    strictEqual(results[0].text, 'Viper');
    strictEqual(results[1].text, 'Viper V2 Pro');
  });

  it('limit larger than matches returns all matches', () => {
    const results = fuzzyMatch('razer', ['Razer Viper', 'Razer Basilisk'], { limit: 10 });
    strictEqual(results.length, 2);
  });
});

describe('fuzzyMatch — normalization edge cases', () => {
  it('ignores leading/trailing query whitespace', () => {
    const results = fuzzyMatch('  razer  ', ['Razer']);
    strictEqual(results.length, 1);
  });

  it('handles haystack entries with leading whitespace', () => {
    const results = fuzzyMatch('razer', ['  Razer  ']);
    strictEqual(results.length, 1);
  });
});
