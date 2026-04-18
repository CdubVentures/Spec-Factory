// WHY: Suppressions let users non-destructively prune URLs/queries from the
// discovery-log block that gets injected into finder prompts. The helper
// subtracts a suppression Set AFTER accumulation so runs stay untouched for
// audit. Scope is enforced by the caller (they pass only the suppressions
// matching the call's variant/mode scope).

import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { accumulateDiscoveryLog } from '../discoveryLog.js';

function run({ urls = [], queries = [] } = {}) {
  return {
    ran_at: '2026-04-18T00:00:00Z',
    response: { discovery_log: { urls_checked: urls, queries_run: queries } },
  };
}

describe('accumulateDiscoveryLog — suppressions option', () => {
  const runs = [run({ urls: ['u1', 'u2', 'u3'], queries: ['q1', 'q2', 'q3'] })];

  it('empty suppressions → unchanged output (back-compat default)', () => {
    const r = accumulateDiscoveryLog(runs, { includeUrls: true, includeQueries: true });
    deepStrictEqual([...r.urlsChecked].sort(), ['u1', 'u2', 'u3']);
    deepStrictEqual([...r.queriesRun].sort(), ['q1', 'q2', 'q3']);
  });

  it('suppressing URLs subtracts them from the result', () => {
    const r = accumulateDiscoveryLog(runs, {
      includeUrls: true, includeQueries: true,
      suppressions: { urlsChecked: new Set(['u2']), queriesRun: new Set() },
    });
    deepStrictEqual([...r.urlsChecked].sort(), ['u1', 'u3']);
    deepStrictEqual([...r.queriesRun].sort(), ['q1', 'q2', 'q3']);
  });

  it('suppressing queries subtracts them from the result', () => {
    const r = accumulateDiscoveryLog(runs, {
      includeUrls: true, includeQueries: true,
      suppressions: { urlsChecked: new Set(), queriesRun: new Set(['q1', 'q3']) },
    });
    deepStrictEqual([...r.urlsChecked].sort(), ['u1', 'u2', 'u3']);
    deepStrictEqual([...r.queriesRun].sort(), ['q2']);
  });

  it('suppressing both URLs and queries works independently', () => {
    const r = accumulateDiscoveryLog(runs, {
      includeUrls: true, includeQueries: true,
      suppressions: {
        urlsChecked: new Set(['u1', 'u3']),
        queriesRun: new Set(['q2']),
      },
    });
    deepStrictEqual([...r.urlsChecked].sort(), ['u2']);
    deepStrictEqual([...r.queriesRun].sort(), ['q1', 'q3']);
  });

  it('suppressing items that were never in history is a no-op (no error)', () => {
    const r = accumulateDiscoveryLog(runs, {
      includeUrls: true, includeQueries: true,
      suppressions: {
        urlsChecked: new Set(['never-seen']),
        queriesRun: new Set(['also-never']),
      },
    });
    deepStrictEqual([...r.urlsChecked].sort(), ['u1', 'u2', 'u3']);
    deepStrictEqual([...r.queriesRun].sort(), ['q1', 'q2', 'q3']);
  });

  it('suppressions apply AFTER runMatcher filter', () => {
    // If matcher excludes a run, its contents are never accumulated; suppression
    // has nothing to subtract from for that run. This verifies no accidental
    // double-counting or order issue.
    const twoVariantRuns = [
      { ...run({ urls: ['u_black'] }), response: { ...run({ urls: ['u_black'] }).response, variant_id: 'v_black' } },
      { ...run({ urls: ['u_white'] }), response: { ...run({ urls: ['u_white'] }).response, variant_id: 'v_white' } },
    ];
    const r = accumulateDiscoveryLog(twoVariantRuns, {
      runMatcher: (x) => x.response?.variant_id === 'v_black',
      includeUrls: true,
      suppressions: { urlsChecked: new Set(['u_white']), queriesRun: new Set() },
    });
    // u_white was never accumulated (matcher excluded) and suppression is a no-op.
    deepStrictEqual([...r.urlsChecked].sort(), ['u_black']);
  });

  it('includeUrls=false with suppressions: URLs still empty, no interference on queries path', () => {
    const r = accumulateDiscoveryLog(runs, {
      includeQueries: true,
      suppressions: { urlsChecked: new Set(['u1']), queriesRun: new Set(['q1']) },
    });
    deepStrictEqual(r.urlsChecked, []);
    deepStrictEqual([...r.queriesRun].sort(), ['q2', 'q3']);
  });

  it('set dedupe across runs then suppressed: one suppression removes all copies', () => {
    const dupRuns = [
      run({ urls: ['u1', 'u2'] }),
      run({ urls: ['u1', 'u3'] }),
    ];
    const r = accumulateDiscoveryLog(dupRuns, {
      includeUrls: true,
      suppressions: { urlsChecked: new Set(['u1']), queriesRun: new Set() },
    });
    deepStrictEqual([...r.urlsChecked].sort(), ['u2', 'u3']);
  });
});
