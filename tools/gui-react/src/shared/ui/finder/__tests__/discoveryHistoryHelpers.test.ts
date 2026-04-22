import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { groupHistory, type FinderRun } from '../discoveryHistoryHelpers.ts';

function run(primary_field_key: string, urls: string[], queries: string[]): FinderRun {
  return {
    ran_at: '2026-04-21T00:00:00Z',
    response: { primary_field_key, discovery_log: { urls_checked: urls, queries_run: queries } },
  };
}

describe('groupHistory — scopeLevel=field_key', () => {
  it('buckets runs by primary_field_key', () => {
    const runs = [
      run('polling_rate', ['https://a.com'], ['q1']),
      run('polling_rate', ['https://b.com'], ['q2']),
      run('dpi', ['https://c.com'], ['q3']),
    ];
    const g = groupHistory(runs, 'field_key');
    strictEqual(g.byFieldKey.size, 2);
    deepStrictEqual([...(g.byFieldKey.get('polling_rate')!.urls)].sort(), ['https://a.com', 'https://b.com']);
    deepStrictEqual([...(g.byFieldKey.get('polling_rate')!.queries)].sort(), ['q1', 'q2']);
    deepStrictEqual([...(g.byFieldKey.get('dpi')!.urls)], ['https://c.com']);
  });

  it('drops runs with no primary_field_key', () => {
    const runs: FinderRun[] = [
      { ran_at: 't', response: { discovery_log: { urls_checked: ['https://x'], queries_run: [] } } },
      run('dpi', ['https://c.com'], []),
    ];
    const g = groupHistory(runs, 'field_key');
    strictEqual(g.byFieldKey.size, 1);
    strictEqual(g.byFieldKey.has('dpi'), true);
  });

  it('totalUrls / totalQueries include byFieldKey sums', () => {
    const runs = [
      run('polling_rate', ['https://a.com'], ['q1']),
      run('dpi', ['https://b.com', 'https://c.com'], []),
    ];
    const g = groupHistory(runs, 'field_key');
    strictEqual(g.totalUrls, 3);
    strictEqual(g.totalQueries, 1);
  });
});
