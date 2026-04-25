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

function pifRun(opts: {
  variant_id: string;
  mode?: string;
  run_scope_key?: string;
  urls?: string[];
  queries?: string[];
}): FinderRun {
  return {
    ran_at: '2026-04-25T00:00:00Z',
    response: {
      variant_id: opts.variant_id,
      ...(opts.mode ? { mode: opts.mode } : {}),
      ...(opts.run_scope_key ? { run_scope_key: opts.run_scope_key } : {}),
      discovery_log: {
        urls_checked: opts.urls || [],
        queries_run: opts.queries || [],
      },
    },
  };
}

describe('groupHistory — scopeLevel=variant+mode pool buckets', () => {
  it('buckets a run with run_scope_key under that pool key', () => {
    const runs = [
      pifRun({ variant_id: 'v_black', mode: 'view', run_scope_key: 'view:top', urls: ['https://top.example'] }),
    ];
    const g = groupHistory(runs, 'variant+mode');
    const modes = g.byVariantMode.get('v_black')!;
    strictEqual(modes.size, 1);
    strictEqual(modes.has('view:top'), true);
    strictEqual(modes.has('view'), false);
    deepStrictEqual([...modes.get('view:top')!.urls], ['https://top.example']);
  });

  it('buckets a legacy run (no run_scope_key) under its mode', () => {
    const runs = [
      pifRun({ variant_id: 'v_black', mode: 'view', urls: ['https://legacy.example'] }),
    ];
    const g = groupHistory(runs, 'variant+mode');
    const modes = g.byVariantMode.get('v_black')!;
    strictEqual(modes.size, 1);
    strictEqual(modes.has('view'), true);
    deepStrictEqual([...modes.get('view')!.urls], ['https://legacy.example']);
  });

  it('keeps pool-keyed and legacy runs in separate buckets — no merge', () => {
    const runs = [
      pifRun({ variant_id: 'v_black', mode: 'view', run_scope_key: 'view:top', urls: ['https://new-top.example'] }),
      pifRun({ variant_id: 'v_black', mode: 'view', urls: ['https://legacy-view.example'] }),
      pifRun({ variant_id: 'v_black', mode: 'view', run_scope_key: 'priority-view', urls: ['https://prio.example'] }),
      pifRun({ variant_id: 'v_black', mode: 'hero', urls: ['https://legacy-hero.example'] }),
      pifRun({ variant_id: 'v_black', mode: 'hero', run_scope_key: 'loop-hero', urls: ['https://loop-hero.example'] }),
    ];
    const g = groupHistory(runs, 'variant+mode');
    const modes = g.byVariantMode.get('v_black')!;
    strictEqual(modes.size, 5);
    strictEqual(modes.has('view:top'), true);
    strictEqual(modes.has('view'), true);
    strictEqual(modes.has('priority-view'), true);
    strictEqual(modes.has('hero'), true);
    strictEqual(modes.has('loop-hero'), true);
    deepStrictEqual([...modes.get('view:top')!.urls], ['https://new-top.example']);
    deepStrictEqual([...modes.get('view')!.urls], ['https://legacy-view.example']);
    deepStrictEqual([...modes.get('hero')!.urls], ['https://legacy-hero.example']);
    deepStrictEqual([...modes.get('loop-hero')!.urls], ['https://loop-hero.example']);
  });
});
