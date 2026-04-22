export interface FuzzyMatch {
  text: string;
  score: number;
  matches: Array<[number, number]>;
}

export interface FuzzyMatchOptions {
  limit?: number;
}

const SCORE_EXACT = 1000;
const SCORE_PREFIX = 500;
const SCORE_TOKEN_START = 300;
const SCORE_SUBSTRING = 100;

const WORD_BOUNDARY_RE = /[^a-z0-9]/;

function scoreTokenMatch(lower: string, token: string): { score: number; idx: number } | null {
  const idx = lower.indexOf(token);
  if (idx < 0) return null;
  if (lower.trim() === token) return { score: SCORE_EXACT, idx };
  if (lower.trimStart().startsWith(token)) return { score: SCORE_PREFIX, idx };
  if (idx > 0 && WORD_BOUNDARY_RE.test(lower[idx - 1])) return { score: SCORE_TOKEN_START, idx };
  return { score: SCORE_SUBSTRING, idx };
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      merged.push([cur[0], cur[1]]);
    }
  }
  return merged;
}

export function fuzzyMatch(
  query: string,
  haystack: string[],
  opts: FuzzyMatchOptions = {},
): FuzzyMatch[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return haystack.map((text) => ({ text, score: 0, matches: [] }));
  }

  const tokens = Array.from(
    new Set(trimmed.toLowerCase().split(/\s+/).filter(Boolean)),
  );
  if (tokens.length === 0) {
    return haystack.map((text) => ({ text, score: 0, matches: [] }));
  }

  const results: FuzzyMatch[] = [];
  for (const text of haystack) {
    const lower = text.toLowerCase();
    const ranges: Array<[number, number]> = [];
    let totalScore = 0;
    let allMatched = true;

    for (const token of tokens) {
      const hit = scoreTokenMatch(lower, token);
      if (!hit) {
        allMatched = false;
        break;
      }
      totalScore += hit.score;
      ranges.push([hit.idx, hit.idx + token.length]);
    }

    if (!allMatched) continue;
    results.push({ text, score: totalScore, matches: mergeRanges(ranges) });
  }

  results.sort((a, b) => b.score - a.score || a.text.length - b.text.length);

  const limit = opts.limit;
  if (typeof limit === 'number' && limit >= 0 && results.length > limit) {
    return results.slice(0, limit);
  }
  return results;
}
