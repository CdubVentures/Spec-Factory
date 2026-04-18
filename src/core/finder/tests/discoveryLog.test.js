// WHY: Boundary matrix for the universal discovery-log helper that CEF, PIF,
// and RDF share. Covers: both-off / URL-only / query-only / both-on, product vs
// variant vs variant+mode scoping via runMatcher predicate, dedupe, malformed
// input safety, and the prompt-fragment builder's scope-label rendering and
// empty-output short-circuit.

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import {
  accumulateDiscoveryLog,
  buildPreviousDiscoveryBlock,
} from '../discoveryLog.js';

function run(overrides = {}) {
  return {
    ran_at: '2026-04-17T10:00:00Z',
    response: {
      variant_key: overrides.variantKey ?? 'color:black',
      variant_id: overrides.variantId ?? 'v_black',
      mode: overrides.mode ?? null,
      discovery_log: {
        urls_checked: overrides.urls ?? [],
        queries_run: overrides.queries ?? [],
        notes: [],
      },
    },
  };
}

describe('accumulateDiscoveryLog — toggle semantics', () => {
  const runs = [run({ urls: ['u1', 'u2'], queries: ['q1'] })];

  it('both toggles off → empty lists regardless of history', () => {
    const result = accumulateDiscoveryLog(runs, {});
    deepStrictEqual(result, { urlsChecked: [], queriesRun: [] });
  });

  it('urls on, queries off → urls populated, queries empty', () => {
    const result = accumulateDiscoveryLog(runs, { includeUrls: true });
    deepStrictEqual(result, { urlsChecked: ['u1', 'u2'], queriesRun: [] });
  });

  it('urls off, queries on → queries populated, urls empty', () => {
    const result = accumulateDiscoveryLog(runs, { includeQueries: true });
    deepStrictEqual(result, { urlsChecked: [], queriesRun: ['q1'] });
  });

  it('both on → both populated', () => {
    const result = accumulateDiscoveryLog(runs, { includeUrls: true, includeQueries: true });
    deepStrictEqual(result, { urlsChecked: ['u1', 'u2'], queriesRun: ['q1'] });
  });
});

describe('accumulateDiscoveryLog — scoping via runMatcher', () => {
  const runs = [
    run({ variantKey: 'color:black', variantId: 'v_black', mode: 'view', urls: ['u_black_view'] }),
    run({ variantKey: 'color:white', variantId: 'v_white', mode: 'view', urls: ['u_white_view'] }),
    run({ variantKey: 'color:black', variantId: 'v_black', mode: 'hero', urls: ['u_black_hero'] }),
  ];

  it('no runMatcher → product-scoped, every run contributes (CEF case)', () => {
    const result = accumulateDiscoveryLog(runs, { includeUrls: true });
    deepStrictEqual([...result.urlsChecked].sort(), ['u_black_hero', 'u_black_view', 'u_white_view']);
  });

  it('runMatcher filters by variant id (RDF case)', () => {
    const result = accumulateDiscoveryLog(runs, {
      includeUrls: true,
      runMatcher: (r) => r.response?.variant_id === 'v_black',
    });
    deepStrictEqual([...result.urlsChecked].sort(), ['u_black_hero', 'u_black_view']);
  });

  it('runMatcher filters by variant + mode (PIF case — view runs only)', () => {
    const result = accumulateDiscoveryLog(runs, {
      includeUrls: true,
      runMatcher: (r) => r.response?.variant_id === 'v_black' && r.response?.mode === 'view',
    });
    deepStrictEqual(result.urlsChecked, ['u_black_view']);
  });

  it('runMatcher excluding all runs → empty lists', () => {
    const result = accumulateDiscoveryLog(runs, {
      includeUrls: true,
      includeQueries: true,
      runMatcher: () => false,
    });
    deepStrictEqual(result, { urlsChecked: [], queriesRun: [] });
  });
});

describe('accumulateDiscoveryLog — set dedupe across runs', () => {
  const runs = [
    run({ urls: ['u1', 'u2'], queries: ['q1'] }),
    run({ urls: ['u2', 'u3'], queries: ['q1', 'q2'] }),
  ];

  it('dedupes urls across runs (set union)', () => {
    const result = accumulateDiscoveryLog(runs, { includeUrls: true, includeQueries: true });
    deepStrictEqual([...result.urlsChecked].sort(), ['u1', 'u2', 'u3']);
    deepStrictEqual([...result.queriesRun].sort(), ['q1', 'q2']);
  });
});

describe('accumulateDiscoveryLog — malformed input safety', () => {
  it('empty previousRuns → empty lists', () => {
    deepStrictEqual(
      accumulateDiscoveryLog([], { includeUrls: true, includeQueries: true }),
      { urlsChecked: [], queriesRun: [] },
    );
  });

  it('runs missing response.discovery_log → skipped without throw', () => {
    const runs = [{ ran_at: 't', response: {} }, run({ urls: ['u1'] })];
    const result = accumulateDiscoveryLog(runs, { includeUrls: true });
    deepStrictEqual(result.urlsChecked, ['u1']);
  });

  it('runs missing response entirely → skipped without throw', () => {
    const runs = [{ ran_at: 't' }, run({ urls: ['u1'] })];
    const result = accumulateDiscoveryLog(runs, { includeUrls: true });
    deepStrictEqual(result.urlsChecked, ['u1']);
  });

  it('non-array urls_checked/queries_run → skipped without throw', () => {
    const runs = [
      { ran_at: 't', response: { discovery_log: { urls_checked: null, queries_run: 'nope' } } },
      run({ urls: ['u1'], queries: ['q1'] }),
    ];
    const result = accumulateDiscoveryLog(runs, { includeUrls: true, includeQueries: true });
    deepStrictEqual(result.urlsChecked, ['u1']);
    deepStrictEqual(result.queriesRun, ['q1']);
  });
});

describe('buildPreviousDiscoveryBlock — prompt fragment', () => {
  it('both empty lists → empty string (no-op block)', () => {
    strictEqual(
      buildPreviousDiscoveryBlock({ urlsChecked: [], queriesRun: [], scopeLabel: 'this product' }),
      '',
    );
  });

  it('urls only → emits URLs line, no queries line', () => {
    const out = buildPreviousDiscoveryBlock({
      urlsChecked: ['https://a.com', 'https://b.com'],
      queriesRun: [],
      scopeLabel: 'this variant',
    });
    strictEqual(out.includes('URLs already checked'), true);
    strictEqual(out.includes('Queries already run'), false);
    strictEqual(out.includes('this variant'), true);
  });

  it('queries only → emits queries line, no URLs line', () => {
    const out = buildPreviousDiscoveryBlock({
      urlsChecked: [],
      queriesRun: ['q1 q2'],
      scopeLabel: 'this variant',
    });
    strictEqual(out.includes('URLs already checked'), false);
    strictEqual(out.includes('Queries already run'), true);
  });

  it('both populated → emits both lines with scope label', () => {
    const out = buildPreviousDiscoveryBlock({
      urlsChecked: ['https://a.com'],
      queriesRun: ['q1'],
      scopeLabel: 'this product',
    });
    strictEqual(out.includes('URLs already checked'), true);
    strictEqual(out.includes('Queries already run'), true);
    strictEqual(out.includes('this product'), true);
  });

  it('scope label "this variant\'s view runs" renders literally', () => {
    const out = buildPreviousDiscoveryBlock({
      urlsChecked: ['u'],
      queriesRun: [],
      scopeLabel: "this variant's view runs",
    });
    strictEqual(out.includes("this variant's view runs"), true);
  });
});
