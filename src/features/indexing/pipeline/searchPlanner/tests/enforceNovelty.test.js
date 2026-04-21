// WHY: enforceNovelty is the safety net for the LLM novelty-enforcement
// requirement ("if the history knobs are enabled, ensure the LLM actually
// changes the queries"). After enhanceQueryRows returns, we normalize each
// output row's query and diff it against the queryHistory set. Any collision
// gets a deterministic phrasing-family suffix rotation — so even if the LLM
// ignores the prompt and rubber-stamps a prior query, the final output still
// differs from history.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual, notStrictEqual } from 'node:assert';
import { enforceNovelty, normalizeQueryKey, DEFAULT_PHRASING_FAMILIES } from '../enforceNovelty.js';

function row(query, extra = {}) {
  return { query, tier: 'seed', hint_source: 'tier1_seed', ...extra };
}

describe('normalizeQueryKey', () => {
  it('lowercases', () => strictEqual(normalizeQueryKey('BRAND Model'), 'brand model'));
  it('strips punctuation', () => strictEqual(normalizeQueryKey('brand-model.specs!'), 'brand model specs'));
  it('collapses whitespace', () => strictEqual(normalizeQueryKey('  brand   model  '), 'brand model'));
  it('handles empty/null', () => {
    strictEqual(normalizeQueryKey(''), '');
    strictEqual(normalizeQueryKey(null), '');
    strictEqual(normalizeQueryKey(undefined), '');
  });
  it('treats case+punct variants as equal', () => {
    strictEqual(
      normalizeQueryKey('Brand Model, Specs!'),
      normalizeQueryKey('brand model specs'),
    );
  });
});

describe('enforceNovelty — happy paths', () => {
  it('empty history → all rows pass through untouched, noveltyRate=1', () => {
    const rows = [row('brand model specs'), row('brand model review')];
    const result = enforceNovelty({ rows, queryHistory: [] });
    strictEqual(result.noveltyRate, 1);
    strictEqual(result.rotated, 0);
    deepStrictEqual(result.rows.map((r) => r.query), ['brand model specs', 'brand model review']);
  });

  it('empty rows → noveltyRate=1 (trivially novel), rotated=0', () => {
    const result = enforceNovelty({ rows: [], queryHistory: ['x'] });
    strictEqual(result.noveltyRate, 1);
    strictEqual(result.rotated, 0);
    deepStrictEqual(result.rows, []);
  });

  it('all rows novel → noveltyRate=1, rotated=0', () => {
    const rows = [row('brand model specs'), row('brand model weight')];
    const result = enforceNovelty({
      rows,
      queryHistory: ['some other thing', 'brand model review'],
    });
    strictEqual(result.noveltyRate, 1);
    strictEqual(result.rotated, 0);
  });
});

describe('enforceNovelty — rotation on collision', () => {
  it('single row colliding with history gets rotated with first phrasing family', () => {
    const rows = [row('brand model specs')];
    const result = enforceNovelty({
      rows,
      queryHistory: ['brand model specs'],
    });
    strictEqual(result.rotated, 1);
    strictEqual(result.noveltyRate, 0);
    notStrictEqual(result.rows[0].query, 'brand model specs');
    ok(result.rows[0].query.includes('brand model specs'), 'rotation preserves original query as prefix');
    const first = DEFAULT_PHRASING_FAMILIES[0];
    ok(result.rows[0].query.includes(first), `first rotation should append ${first}`);
  });

  it('multiple rows each get unique phrasing families (no duplicates)', () => {
    const rows = [
      row('brand model specs'),
      row('brand model review'),
      row('brand model measurement'),
    ];
    const history = ['brand model specs', 'brand model review', 'brand model measurement'];
    const result = enforceNovelty({ rows, queryHistory: history });
    strictEqual(result.rotated, 3);
    // Each rotated query should differ from its original
    for (let i = 0; i < rows.length; i++) {
      notStrictEqual(result.rows[i].query, rows[i].query);
    }
    // Each output should be unique (no two rotations produce the same query)
    const out = result.rows.map((r) => r.query);
    strictEqual(new Set(out).size, out.length, 'rotated queries must be unique');
  });

  it('mix of stale + fresh → only stale ones rotated, noveltyRate = 0.5', () => {
    const rows = [
      row('brand model specs'),       // stale
      row('brand model keeper'),      // fresh
      row('brand model review'),      // stale
      row('brand model weight'),      // fresh
    ];
    const history = ['brand model specs', 'brand model review'];
    const result = enforceNovelty({ rows, queryHistory: history });
    strictEqual(result.rotated, 2);
    strictEqual(result.noveltyRate, 0.5);
    strictEqual(result.rows[1].query, 'brand model keeper', 'fresh query untouched');
    strictEqual(result.rows[3].query, 'brand model weight', 'fresh query untouched');
    notStrictEqual(result.rows[0].query, 'brand model specs');
    notStrictEqual(result.rows[2].query, 'brand model review');
  });

  it('deterministic: same input always produces same output', () => {
    const rows = [row('brand model specs')];
    const history = ['brand model specs'];
    const r1 = enforceNovelty({ rows: [row('brand model specs')], queryHistory: history });
    const r2 = enforceNovelty({ rows: [row('brand model specs')], queryHistory: history });
    strictEqual(r1.rows[0].query, r2.rows[0].query, 'rotation must be deterministic');
  });

  it('collision detection is case-insensitive and punctuation-agnostic', () => {
    const rows = [row('Brand Model, Specs!')];
    const history = ['brand model specs'];
    const result = enforceNovelty({ rows, queryHistory: history });
    strictEqual(result.rotated, 1, 'normalized comparison should detect the collision');
  });
});

describe('enforceNovelty — metadata preservation', () => {
  it('preserves all row fields other than query (tier, hint_source, etc.)', () => {
    const rows = [row('brand model specs', {
      tier: 'key_search',
      hint_source: 'tier3_key_llm',
      target_fields: ['dpi'],
      group_key: 'sensor',
    })];
    const result = enforceNovelty({ rows, queryHistory: ['brand model specs'] });
    strictEqual(result.rows[0].tier, 'key_search');
    strictEqual(result.rows[0].hint_source, 'tier3_key_llm');
    deepStrictEqual(result.rows[0].target_fields, ['dpi']);
    strictEqual(result.rows[0].group_key, 'sensor');
  });
});
