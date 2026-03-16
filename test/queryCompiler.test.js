import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compileQuery,
  compileQueryBatch,
  logicalQueryPlanSchema,
} from '../src/features/indexing/discovery/queryCompiler.js';
import { listProviders } from '../src/features/indexing/discovery/providerCapabilities.js';

// Golden table-driven cases
const GOLDEN_TABLE = [
  {
    name: 'SearXNG + site operator',
    provider: 'searxng',
    plan: { product: 'Razer Viper V3 Pro', terms: ['dpi'], site_target: 'razer.com' },
    expect: { includes: ['site:razer.com', 'Razer Viper V3 Pro', 'dpi'], warnings: 0 },
  },
  {
    name: 'SearXNG + filetype pdf (lexical fallback — measured unsupported)',
    provider: 'searxng',
    plan: { product: 'Razer Viper V3 Pro', terms: [], filetype: 'pdf' },
    expect: { includes: ['pdf'], excludes: ['filetype:'], minWarnings: 1, fallback: true },
  },
  {
    name: 'Google + all operators',
    provider: 'google',
    plan: {
      product: 'Mouse', terms: ['weight'], site_target: 'example.com',
      filetype: 'pdf', exact_phrases: ['Viper V3 Pro'], exclude_terms: ['used'],
    },
    expect: {
      includes: ['site:example.com', 'filetype:pdf', '"Viper V3 Pro"', '-used'],
      warnings: 0,
    },
  },
  {
    name: 'Bing + filetype',
    provider: 'bing',
    plan: { product: 'Mouse', terms: [], filetype: 'pdf' },
    expect: { includes: ['filetype:pdf'], warnings: 0 },
  },
  {
    name: 'None provider → empty + warning',
    provider: 'none',
    plan: { product: 'Mouse', terms: [] },
    expect: { emptyQuery: true, minWarnings: 1 },
  },
  {
    name: 'Empty product → empty query + warning',
    provider: 'searxng',
    plan: { product: '', terms: [] },
    expect: { emptyQuery: true, warningIncludes: ['empty_product'] },
  },
  {
    name: 'SearXNG + doc_hint',
    provider: 'searxng',
    plan: { product: 'Mouse', terms: [], doc_hint: 'specification' },
    expect: { includes: ['specification'] },
  },
];

describe('queryCompiler', () => {
  describe('golden table-driven cases', () => {
    for (const tc of GOLDEN_TABLE) {
      it(tc.name, () => {
        const result = compileQuery(tc.plan, tc.provider);
        assert.ok(typeof result.query === 'string');
        assert.ok(Array.isArray(result.warnings));
        assert.ok(typeof result.fallback_applied === 'boolean');

        if (tc.expect.includes) {
          for (const s of tc.expect.includes) {
            assert.ok(result.query.includes(s), `query "${result.query}" should include "${s}"`);
          }
        }
        if (tc.expect.excludes) {
          for (const s of tc.expect.excludes) {
            assert.ok(!result.query.includes(s), `query "${result.query}" should NOT include "${s}"`);
          }
        }
        if (tc.expect.warnings !== undefined) {
          assert.equal(result.warnings.length, tc.expect.warnings,
            `expected ${tc.expect.warnings} warnings, got: ${JSON.stringify(result.warnings)}`);
        }
        if (tc.expect.warningIncludes) {
          for (const w of tc.expect.warningIncludes) {
            assert.ok(
              result.warnings.some(warn => warn.includes(w)),
              `warnings should include "${w}", got: ${JSON.stringify(result.warnings)}`
            );
          }
        }
        if (tc.expect.minWarnings !== undefined) {
          assert.ok(result.warnings.length >= tc.expect.minWarnings);
        }
        if (tc.expect.fallback) {
          assert.equal(result.fallback_applied, true);
        }
        if (tc.expect.emptyQuery) {
          assert.equal(result.query.trim(), '');
        }
      });
    }
  });

  it('critical negative: no unsupported operators in output for each provider', () => {
    const fullPlan = {
      product: 'Test Mouse',
      terms: ['weight'],
      site_target: 'example.com',
      filetype: 'pdf',
      exact_phrases: ['Test Mouse'],
      exclude_terms: ['used'],
      doc_hint: 'spec',
    };

    const operatorPrefixes = ['site:', 'filetype:', 'intitle:', 'inurl:'];
    const unsupportedMap = {
      none: ['site:', 'filetype:', 'intitle:', 'inurl:'],
    };

    for (const provider of listProviders()) {
      const result = compileQuery(fullPlan, provider);
      const unsupported = unsupportedMap[provider] || [];
      for (const prefix of unsupported) {
        assert.ok(
          !result.query.includes(prefix),
          `${provider}: query "${result.query}" must NOT contain unsupported "${prefix}"`
        );
      }
    }
  });

  it('idempotency: same plan + provider → same output', () => {
    const plan = { product: 'Mouse', terms: ['dpi'], site_target: 'razer.com' };
    const a = compileQuery(plan, 'searxng');
    const b = compileQuery(plan, 'searxng');
    assert.equal(a.query, b.query);
    assert.deepEqual(a.warnings, b.warnings);
  });

  it('batch dedup', () => {
    const plans = [
      { product: 'Mouse', terms: ['dpi'] },
      { product: 'Mouse', terms: ['dpi'] },
      { product: 'Mouse', terms: ['weight'] },
    ];
    const results = compileQueryBatch(plans, 'searxng');
    assert.equal(results.length, 2, 'duplicate queries should be deduped');
  });

  it('truncation for long query', () => {
    const plan = { product: 'A'.repeat(600), terms: [] };
    const result = compileQuery(plan, 'searxng');
    assert.ok(result.query.length <= 500, `query length ${result.query.length} exceeds max`);
    assert.ok(result.warnings.some(w => w.includes('truncated')));
  });

  it('forward-compat: plan with time_pref compiles same as without', () => {
    const base = { product: 'Mouse', terms: ['dpi'] };
    const withTimePref = { ...base, time_pref: 'recent' };
    const a = compileQuery(base, 'searxng');
    const b = compileQuery(withTimePref, 'searxng');
    assert.equal(a.query, b.query);
  });

  it('schema validation rejects malformed plan', () => {
    const bad = { terms: ['dpi'] }; // missing product
    const result = logicalQueryPlanSchema.safeParse(bad);
    assert.equal(result.success, false);
  });

  it('schema accepts minimal valid plan', () => {
    const ok = { product: 'Mouse', terms: [] };
    const result = logicalQueryPlanSchema.safeParse(ok);
    assert.ok(result.success, JSON.stringify(result.error?.issues));
  });
});
