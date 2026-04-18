// WHY: CEF product-scoped suppressions — adding a suppressed URL to the store
// with variant_id='' makes next CEF accumulator skip it from the prompt block.

import { describe, it } from 'node:test';
import { ok } from 'node:assert';
import { buildColorEditionFinderPrompt } from '../colorEditionLlmAdapter.js';
import { accumulateDiscoveryLog } from '../../../core/finder/discoveryLog.js';

const runs = [
  { ran_at: '2026-04-18T00:00:00Z', response: { discovery_log: {
    urls_checked: ['https://keep.com', 'https://bad.com'],
    queries_run: ['keep query', 'bad query'],
  } } },
];

const product = { brand: 'Corsair', model: 'M75' };
const colors = [{ name: 'black', hex: '#000' }];
const colorNames = ['black'];

describe('CEF suppressions — integration', () => {
  it('with suppressed URL + query: prompt omits them, keeps the rest', () => {
    const acc = accumulateDiscoveryLog(runs, {
      includeUrls: true, includeQueries: true,
      suppressions: {
        urlsChecked: new Set(['https://bad.com']),
        queriesRun: new Set(['bad query']),
      },
    });
    const prompt = buildColorEditionFinderPrompt({
      product, colors, colorNames, previousRuns: runs, previousDiscovery: acc,
    });
    ok(prompt.includes('https://keep.com'));
    ok(!prompt.includes('https://bad.com'), 'suppressed URL must be absent');
    ok(prompt.includes('keep query'));
    ok(!prompt.includes('bad query'));
  });
});
