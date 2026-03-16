// Testing Phase 03 — QueryCompiler, Provider Ranking, and Operator Tuning
// Full test matrix: PC-01–PC-05, QC-01–QC-11, GT-01+, FB-01–FB-04, REG-01–REG-03

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getProviderCapabilities,
  supportsOperator,
  listProviders,
  providerCapabilitySchema,
} from '../src/features/indexing/discovery/providerCapabilities.js';
import {
  compileQuery,
  compileQueryBatch,
  logicalQueryPlanSchema,
} from '../src/features/indexing/discovery/queryCompiler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACTIVE_PROVIDERS = ['searxng', 'google', 'bing', 'dual'];

function makePlan(overrides = {}) {
  return {
    product: 'Razer Viper V3 Pro',
    terms: ['dpi', 'sensor'],
    site_target: null,
    filetype: null,
    doc_hint: '',
    exact_phrases: [],
    exclude_terms: [],
    time_pref: null,
    hard_site: false,
    host_pref: null,
    ...overrides,
  };
}

function makePartialCaps(overrides = {}) {
  return {
    name: 'test_partial',
    supports_site: false,
    supports_filetype: false,
    supports_since: false,
    supports_intitle: false,
    supports_inurl: false,
    supports_exact_phrase: false,
    supports_boolean_or: false,
    supports_boolean_not: false,
    max_query_length: 2048,
    max_results_per_request: 10,
    auth_required: false,
    preference_rank: 50,
    rate_limits: { requests_per_second: 1, burst: 1, cooldown_ms: 1000 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// PC — ProviderCapabilities
// ---------------------------------------------------------------------------

describe('Phase03 — ProviderCapabilities', () => {
  it('PC-01: all production providers present', () => {
    const providers = listProviders();
    for (const name of [...ACTIVE_PROVIDERS, 'none']) {
      assert.ok(providers.includes(name), `provider "${name}" missing from registry`);
    }
  });

  it('PC-02: unknown provider throws', () => {
    assert.throws(() => getProviderCapabilities('askjeeves'), /unknown provider/i);
    assert.throws(() => getProviderCapabilities('legacy_provider'), /unknown provider/i);
    assert.throws(() => getProviderCapabilities(''), /unknown provider/i);
  });

  it('PC-03: required fields present including preference_rank', () => {
    const REQUIRED_FIELDS = [
      'supports_site', 'supports_filetype', 'supports_since',
      'max_query_length', 'rate_limits', 'preference_rank',
    ];
    for (const name of listProviders()) {
      const caps = getProviderCapabilities(name);
      for (const field of REQUIRED_FIELDS) {
        assert.ok(
          field in caps,
          `provider "${name}" missing required field "${field}"`
        );
      }
      assert.ok(
        typeof caps.preference_rank === 'number' && Number.isInteger(caps.preference_rank),
        `provider "${name}" preference_rank must be an integer, got ${caps.preference_rank}`
      );
      assert.ok(
        typeof caps.rate_limits === 'object' && caps.rate_limits !== null,
        `provider "${name}" rate_limits must be an object`
      );
      assert.ok(
        typeof caps.rate_limits.requests_per_second === 'number',
        `provider "${name}" rate_limits.requests_per_second must be a number`
      );
    }
  });

  it('PC-04: booleans strict — no string "true"/"false"', () => {
    const BOOLEAN_FIELDS = [
      'supports_site', 'supports_filetype', 'supports_since',
      'supports_intitle', 'supports_inurl', 'supports_exact_phrase',
      'supports_boolean_or', 'supports_boolean_not', 'auth_required',
    ];
    for (const name of listProviders()) {
      const caps = getProviderCapabilities(name);
      for (const field of BOOLEAN_FIELDS) {
        assert.ok(
          typeof caps[field] === 'boolean',
          `provider "${name}" field "${field}" must be boolean, got ${typeof caps[field]} (${caps[field]})`
        );
      }
    }
  });

  it('PC-05: CI validates — broken entry fails schema', () => {
    const broken = {
      name: 'broken',
      supports_site: 'yes', // string instead of boolean
      supports_filetype: true,
      supports_since: true,
      supports_intitle: true,
      supports_inurl: true,
      supports_exact_phrase: true,
      supports_boolean_or: true,
      supports_boolean_not: true,
      max_query_length: 2048,
      max_results_per_request: 10,
      auth_required: false,
      preference_rank: 1,
      rate_limits: { requests_per_second: 1, burst: 1, cooldown_ms: 1000 },
    };
    const result = providerCapabilitySchema.safeParse(broken);
    assert.equal(result.success, false, 'broken entry with string boolean should fail schema');
  });

  it('PC-05b: CI validates — missing preference_rank fails schema', () => {
    const missing = {
      name: 'missing',
      supports_site: true,
      supports_filetype: true,
      supports_since: true,
      supports_intitle: true,
      supports_inurl: true,
      supports_exact_phrase: true,
      supports_boolean_or: true,
      supports_boolean_not: true,
      max_query_length: 2048,
      max_results_per_request: 10,
      auth_required: false,
      // preference_rank missing
      rate_limits: { requests_per_second: 1, burst: 1, cooldown_ms: 1000 },
    };
    const result = providerCapabilitySchema.safeParse(missing);
    assert.equal(result.success, false, 'missing preference_rank should fail schema');
  });

  it('PC-05c: CI validates — all real providers pass schema', () => {
    for (const name of listProviders()) {
      const caps = getProviderCapabilities(name);
      const result = providerCapabilitySchema.safeParse(caps);
      assert.ok(result.success, `${name} failed schema: ${JSON.stringify(result.error?.issues)}`);
    }
  });

  it('preference_rank ordering: searxng < bing < google (measured 2026-03-09)', () => {
    const s = getProviderCapabilities('searxng');
    const d = getProviderCapabilities('dual');
    const b = getProviderCapabilities('bing');
    const g = getProviderCapabilities('google');
    assert.ok(s.preference_rank < d.preference_rank, 'searxng should rank higher than dual');
    assert.ok(d.preference_rank < g.preference_rank, 'dual should rank higher than google');
    assert.ok(s.preference_rank < b.preference_rank, 'searxng should rank higher than bing (measured best)');
    assert.ok(b.preference_rank < g.preference_rank, 'bing should rank higher than google (google blocked via SearXNG)');
  });

  it('capability objects are frozen', () => {
    for (const name of listProviders()) {
      const caps = getProviderCapabilities(name);
      assert.throws(() => { caps.supports_site = false; }, /Cannot assign/);
      assert.throws(() => { caps.preference_rank = 0; }, /Cannot assign/);
    }
  });
});

// ---------------------------------------------------------------------------
// QC — QueryCompiler
// ---------------------------------------------------------------------------

describe('Phase03 — QueryCompiler', () => {
  it('QC-01: site: when supported → site:host in query', () => {
    for (const provider of ACTIVE_PROVIDERS) {
      const result = compileQuery(
        makePlan({ site_target: 'razer.com' }),
        provider
      );
      assert.ok(
        result.query.includes('site:razer.com'),
        `${provider}: expected site:razer.com, got "${result.query}"`
      );
      assert.equal(result.fallback_applied, false);
    }
  });

  it('QC-02: site: when unsupported → lexical fallback (domain as plain text)', () => {
    const caps = makePartialCaps({ supports_site: false });
    const result = compileQuery(makePlan({ site_target: 'razer.com' }), caps);
    assert.ok(!result.query.includes('site:'), `query should NOT contain site: operator, got "${result.query}"`);
    assert.ok(result.query.includes('razer.com'), `query should contain "razer.com" as plain text, got "${result.query}"`);
    assert.equal(result.fallback_applied, true);
    assert.ok(result.warnings.some(w => w.includes('site_operator_unsupported')));
  });

  it('QC-03: filetype: when supported → filetype:pdf in query', () => {
    // Google, Bing, and Dual share filetype: support in query text.
    // SearXNG measured: filetype: returns 0 results in meta mode → supports_filetype=false.
    for (const provider of ['google', 'bing', 'dual']) {
      const result = compileQuery(
        makePlan({ filetype: 'pdf' }),
        provider
      );
      assert.ok(
        result.query.includes('filetype:pdf'),
        `${provider}: expected filetype:pdf, got "${result.query}"`
      );
    }
    // SearXNG uses lexical fallback for filetype
    const sResult = compileQuery(makePlan({ filetype: 'pdf' }), 'searxng');
    assert.ok(!sResult.query.includes('filetype:'), 'searxng: should NOT emit filetype: (measured unsupported)');
    assert.ok(sResult.query.includes('pdf'), 'searxng: pdf should appear as lexical fallback');
  });

  it('QC-04: filetype: when unsupported → lexical fallback', () => {
    const caps = makePartialCaps({ supports_filetype: false });
    const result = compileQuery(makePlan({ filetype: 'pdf' }), caps);
    assert.ok(!result.query.includes('filetype:'), `query should NOT contain filetype: operator`);
    assert.ok(result.query.includes('pdf'), `query should contain "pdf" as plain text`);
    assert.equal(result.fallback_applied, true);
    assert.ok(result.warnings.some(w => w.includes('filetype_operator_unsupported')));
  });

  it('QC-05: time: when supported → after: in query (Google)', () => {
    const result = compileQuery(
      makePlan({ time_pref: '2025-01-01' }),
      'google'
    );
    assert.ok(
      result.query.includes('after:2025-01-01'),
      `expected after:2025-01-01, got "${result.query}"`
    );
    assert.equal(result.warnings.length, 0);
  });

  it('QC-06: time: when unsupported → omitted with warning', () => {
    // SearXNG, Bing, and Dual don't support since in query text
    for (const provider of ['searxng', 'bing', 'dual']) {
      const result = compileQuery(
        makePlan({ time_pref: '2025-01-01' }),
        provider
      );
      assert.ok(
        !result.query.includes('after:'),
        `${provider}: query should NOT contain after: operator, got "${result.query}"`
      );
      assert.ok(
        result.warnings.some(w => w.includes('since_operator_unsupported')),
        `${provider}: expected since_operator_unsupported warning`
      );
    }
  });

  it('QC-07: max length → truncated cleanly', () => {
    const result = compileQuery(
      makePlan({ product: 'A'.repeat(600) }),
      'searxng'
    );
    assert.ok(result.query.length <= 500, `query length ${result.query.length} exceeds 500`);
    assert.ok(result.warnings.some(w => w.includes('truncated')));
  });

  it('QC-08: combined supported → all operators present', () => {
    const result = compileQuery(
      makePlan({
        site_target: 'example.com',
        filetype: 'pdf',
        time_pref: '2025-01-01',
        exact_phrases: ['Viper V3 Pro'],
        exclude_terms: ['used'],
      }),
      'google'
    );
    assert.ok(result.query.includes('site:example.com'), 'missing site:');
    assert.ok(result.query.includes('filetype:pdf'), 'missing filetype:');
    assert.ok(result.query.includes('after:2025-01-01'), 'missing after:');
    assert.ok(result.query.includes('"Viper V3 Pro"'), 'missing exact phrase');
    assert.ok(result.query.includes('-used'), 'missing exclude');
    assert.equal(result.warnings.length, 0);
    assert.equal(result.fallback_applied, false);
  });

  it('QC-09: combined partial → supported ops + lexical fallback', () => {
    const caps = makePartialCaps({
      supports_site: true,
      supports_filetype: false,
      supports_exact_phrase: true,
      supports_boolean_not: false,
    });
    const result = compileQuery(
      makePlan({
        site_target: 'razer.com',
        filetype: 'pdf',
        exact_phrases: ['V3 Pro'],
        exclude_terms: ['used'],
      }),
      caps
    );
    assert.ok(result.query.includes('site:razer.com'), 'site: should be present (supported)');
    assert.ok(!result.query.includes('filetype:'), 'filetype: should NOT be present (unsupported)');
    assert.ok(result.query.includes('pdf'), 'pdf should appear as plain text (fallback)');
    assert.ok(result.query.includes('"V3 Pro"'), 'exact phrase should be quoted (supported)');
    assert.ok(!result.query.includes('-used'), 'exclude should NOT be present (unsupported)');
    assert.equal(result.fallback_applied, true);
    assert.ok(result.warnings.length >= 2, `expected >= 2 warnings, got ${result.warnings.length}`);
  });

  it('QC-10: empty plan → no crash', () => {
    const result = compileQuery(makePlan({ product: '', terms: [] }), 'searxng');
    assert.equal(result.query.trim(), '');
    assert.ok(result.warnings.some(w => w.includes('empty_product')));
  });

  it('QC-11: determinism → same input twice = same output', () => {
    const plan = makePlan({ site_target: 'razer.com', filetype: 'pdf' });
    for (const provider of ACTIVE_PROVIDERS) {
      const a = compileQuery(plan, provider);
      const b = compileQuery(plan, provider);
      assert.equal(a.query, b.query, `${provider}: output not deterministic`);
      assert.deepEqual(a.warnings, b.warnings);
      assert.equal(a.fallback_applied, b.fallback_applied);
    }
  });
});

// ---------------------------------------------------------------------------
// GT — Golden Tests (3+ per provider)
// ---------------------------------------------------------------------------

describe('Phase03 — Golden Tests', () => {
  const GOLDEN_CASES = [
    // --- Google (supports all including since) ---
    {
      id: 'GT-google-01',
      provider: 'google',
      plan: makePlan({ site_target: 'razer.com' }),
      frozen: 'Razer Viper V3 Pro dpi sensor site:razer.com',
    },
    {
      id: 'GT-google-02',
      provider: 'google',
      plan: makePlan({ filetype: 'pdf', doc_hint: 'manual' }),
      frozen: 'Razer Viper V3 Pro dpi sensor manual filetype:pdf',
    },
    {
      id: 'GT-google-03',
      provider: 'google',
      plan: makePlan({ time_pref: '2025-06-01', exact_phrases: ['V3 Pro'] }),
      frozen: 'Razer Viper V3 Pro dpi sensor after:2025-06-01 "V3 Pro"',
    },
    {
      id: 'GT-google-04',
      provider: 'google',
      plan: makePlan({
        site_target: 'rtings.com', filetype: 'pdf',
        exact_phrases: ['Viper V3'], exclude_terms: ['used', 'refurbished'],
      }),
      frozen: 'Razer Viper V3 Pro dpi sensor site:rtings.com filetype:pdf "Viper V3" -used -refurbished',
    },
    // --- Bing (supports all except since) ---
    {
      id: 'GT-bing-01',
      provider: 'bing',
      plan: makePlan({ site_target: 'razer.com' }),
      frozen: 'Razer Viper V3 Pro dpi sensor site:razer.com',
    },
    {
      id: 'GT-bing-02',
      provider: 'bing',
      plan: makePlan({ filetype: 'pdf' }),
      frozen: 'Razer Viper V3 Pro dpi sensor filetype:pdf',
    },
    {
      id: 'GT-bing-03',
      provider: 'bing',
      plan: makePlan({ exact_phrases: ['Viper V3 Pro'], exclude_terms: ['ebay'] }),
      frozen: 'Razer Viper V3 Pro dpi sensor "Viper V3 Pro" -ebay',
    },
    // --- Dual (safe shared Google+Bing subset: no since) ---
    {
      id: 'GT-dual-01',
      provider: 'dual',
      plan: makePlan({ site_target: 'razer.com' }),
      frozen: 'Razer Viper V3 Pro dpi sensor site:razer.com',
    },
    {
      id: 'GT-dual-02',
      provider: 'dual',
      plan: makePlan({ filetype: 'pdf', doc_hint: 'manual' }),
      frozen: 'Razer Viper V3 Pro dpi sensor manual filetype:pdf',
    },
    {
      id: 'GT-dual-03',
      provider: 'dual',
      plan: makePlan({ exact_phrases: ['Viper V3 Pro'], exclude_terms: ['refurbished'] }),
      frozen: 'Razer Viper V3 Pro dpi sensor "Viper V3 Pro" -refurbished',
    },
    // --- SearXNG (supports all except since and filetype — measured 2026-03-09) ---
    {
      id: 'GT-searxng-01',
      provider: 'searxng',
      plan: makePlan({ site_target: 'razer.com' }),
      frozen: 'Razer Viper V3 Pro dpi sensor site:razer.com',
    },
    {
      id: 'GT-searxng-02',
      provider: 'searxng',
      plan: makePlan({ filetype: 'pdf', doc_hint: 'datasheet' }),
      frozen: 'Razer Viper V3 Pro dpi sensor datasheet pdf', // filetype lexical fallback
    },
    {
      id: 'GT-searxng-03',
      provider: 'searxng',
      plan: makePlan({ exclude_terms: ['used'], exact_phrases: ['V3'] }),
      frozen: 'Razer Viper V3 Pro dpi sensor "V3" -used',
    },
    // --- None ---
    {
      id: 'GT-none-01',
      provider: 'none',
      plan: makePlan(),
      frozen: '',
    },
  ];

  for (const tc of GOLDEN_CASES) {
    it(`${tc.id}: ${tc.provider} frozen output`, () => {
      const result = compileQuery(tc.plan, tc.provider);
      assert.equal(
        result.query, tc.frozen,
        `golden mismatch for ${tc.id}:\n  expected: "${tc.frozen}"\n  got:      "${result.query}"`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// FB — Fallback Behavior
// ---------------------------------------------------------------------------

describe('Phase03 — Fallback Behavior', () => {
  it('FB-01: all operators unsupported → pure lexical output (no operator prefixes)', () => {
    const caps = makePartialCaps({
      supports_site: false,
      supports_filetype: false,
      supports_since: false,
      supports_exact_phrase: false,
      supports_boolean_not: false,
    });
    const result = compileQuery(
      makePlan({
        site_target: 'razer.com',
        filetype: 'pdf',
        time_pref: '2025-01-01',
        exact_phrases: ['Viper V3 Pro'],
        exclude_terms: ['used'],
      }),
      caps
    );
    // No operator prefixes in output
    assert.ok(!result.query.includes('site:'), 'no site: in lexical output');
    assert.ok(!result.query.includes('filetype:'), 'no filetype: in lexical output');
    assert.ok(!result.query.includes('after:'), 'no after: in lexical output');
    assert.ok(!result.query.includes('-used'), 'no -exclude in lexical output');
    // But domain and filetype appear as plain text (lexical fallback)
    assert.ok(result.query.includes('razer.com'), 'domain appears as plain text');
    assert.ok(result.query.includes('pdf'), 'filetype appears as plain text');
    assert.ok(result.query.includes('Viper V3 Pro'), 'phrase appears unquoted');
    assert.equal(result.fallback_applied, true);
    assert.ok(result.warnings.length >= 3, `expected >= 3 warnings, got ${result.warnings.length}`);
  });

  it('FB-02: rate_limits accessible for backoff logic', () => {
    for (const provider of ACTIVE_PROVIDERS) {
      const caps = getProviderCapabilities(provider);
      assert.ok(caps.rate_limits.requests_per_second > 0,
        `${provider}: requests_per_second must be > 0`);
      assert.ok(caps.rate_limits.burst > 0,
        `${provider}: burst must be > 0`);
      assert.ok(typeof caps.rate_limits.cooldown_ms === 'number',
        `${provider}: cooldown_ms must be a number`);
    }
  });

  it('FB-03: empty valid query → logged with warning', () => {
    // Product with only whitespace terms
    const result = compileQuery(
      makePlan({ product: '  ', terms: ['', '  '] }),
      'searxng'
    );
    assert.equal(result.query.trim(), '');
    assert.ok(result.warnings.length > 0, 'empty query should have warnings');
  });

  it('FB-04: all operators fail → pure lexical last resort (no crash)', () => {
    const caps = makePartialCaps({
      supports_site: false,
      supports_filetype: false,
      supports_since: false,
      supports_intitle: false,
      supports_inurl: false,
      supports_exact_phrase: false,
      supports_boolean_or: false,
      supports_boolean_not: false,
    });
    const result = compileQuery(
      makePlan({
        site_target: 'razer.com',
        filetype: 'pdf',
        time_pref: '2025-01-01',
        exact_phrases: ['V3 Pro'],
        exclude_terms: ['used'],
      }),
      caps
    );
    // Should still produce a usable query (product + terms)
    assert.ok(result.query.includes('Razer Viper V3 Pro'), 'product name preserved');
    assert.ok(result.query.includes('dpi'), 'terms preserved');
    assert.ok(result.query.length > 0, 'query is not empty');
    assert.equal(result.fallback_applied, true);
  });
});

// ---------------------------------------------------------------------------
// REG — Regression / Flag Guards
// ---------------------------------------------------------------------------

describe('Phase03 — Regression Guards', () => {
  it('REG-01: none provider = no search capability (legacy behavior)', () => {
    const result = compileQuery(makePlan(), 'none');
    assert.equal(result.query, '');
    assert.ok(result.warnings.some(w => w.includes('provider_none')));
  });

  it('REG-02: connector_only hosts should not appear in compiled queries', async () => {
    // Verify sourceRegistry exposes connector_only check
    const { isConnectorOnly, loadSourceRegistry } = await import(
      '../src/features/indexing/discovery/sourceRegistry.js'
    );
    const { registry } = loadSourceRegistry('mouse', {
      approved: {},
      sources: {
        reddit: {
          base_url: 'https://reddit.com',
          tier: 'tier4_community',
          connector_only: true,
        },
        razer: {
          base_url: 'https://razer.com',
          tier: 'tier1_manufacturer',
          connector_only: false,
        },
      },
    });

    assert.equal(isConnectorOnly(registry, 'reddit.com'), true);
    assert.equal(isConnectorOnly(registry, 'razer.com'), false);

    // A plan targeting a connector_only host should be filterable
    // The compiler itself doesn't filter — the planner should check before compiling
    const connectorHost = registry.entries.find(e => e.connector_only);
    assert.ok(connectorHost, 'connector_only host should exist in test registry');
    assert.equal(connectorHost.connector_only, true);
  });

  it('REG-03: blocked_in_search hosts should not appear in planning', async () => {
    const { isBlockedInSearch, loadSourceRegistry } = await import(
      '../src/features/indexing/discovery/sourceRegistry.js'
    );
    const { registry } = loadSourceRegistry('mouse', {
      approved: {},
      sources: {
        blocked_site: {
          base_url: 'https://blocked-example.com',
          tier: 'tier3_retailer',
          blocked_in_search: true,
        },
        normal_site: {
          base_url: 'https://normal-example.com',
          tier: 'tier3_retailer',
          blocked_in_search: false,
        },
      },
    });

    assert.equal(isBlockedInSearch(registry, 'blocked-example.com'), true);
    assert.equal(isBlockedInSearch(registry, 'normal-example.com'), false);
  });
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('Phase03 — Schema Validation', () => {
  it('logicalQueryPlanSchema rejects missing product', () => {
    const result = logicalQueryPlanSchema.safeParse({ terms: [] });
    assert.equal(result.success, false);
  });

  it('logicalQueryPlanSchema accepts minimal plan', () => {
    const result = logicalQueryPlanSchema.safeParse({ product: 'Mouse', terms: [] });
    assert.ok(result.success, JSON.stringify(result.error?.issues));
  });

  it('logicalQueryPlanSchema accepts full plan with all fields', () => {
    const result = logicalQueryPlanSchema.safeParse({
      product: 'Mouse',
      terms: ['dpi'],
      site_target: 'razer.com',
      filetype: 'pdf',
      doc_hint: 'spec',
      exact_phrases: ['V3 Pro'],
      exclude_terms: ['used'],
      time_pref: '2025-01-01',
      hard_site: true,
      host_pref: 'razer.com',
    });
    assert.ok(result.success, JSON.stringify(result.error?.issues));
  });

  it('preference_rank must be >= 1', () => {
    const withZero = {
      name: 'test',
      supports_site: true,
      supports_filetype: true,
      supports_since: true,
      supports_intitle: true,
      supports_inurl: true,
      supports_exact_phrase: true,
      supports_boolean_or: true,
      supports_boolean_not: true,
      max_query_length: 2048,
      max_results_per_request: 10,
      auth_required: false,
      preference_rank: 0,
      rate_limits: { requests_per_second: 1, burst: 1, cooldown_ms: 1000 },
    };
    const result = providerCapabilitySchema.safeParse(withZero);
    assert.equal(result.success, false, 'preference_rank 0 should fail validation');
  });
});

// ---------------------------------------------------------------------------
// Batch compilation
// ---------------------------------------------------------------------------

describe('Phase03 — Batch Compilation', () => {
  it('batch deduplicates identical queries', () => {
    const plans = [
      makePlan({ site_target: 'razer.com' }),
      makePlan({ site_target: 'razer.com' }),
      makePlan({ site_target: 'rtings.com' }),
    ];
    const results = compileQueryBatch(plans, 'google');
    assert.equal(results.length, 2, 'duplicate queries should be deduped');
  });

  it('batch preserves order of first occurrence', () => {
    const plans = [
      makePlan({ site_target: 'razer.com' }),
      makePlan({ site_target: 'rtings.com' }),
      makePlan({ site_target: 'razer.com' }),
    ];
    const results = compileQueryBatch(plans, 'google');
    assert.ok(results[0].query.includes('razer.com'));
    assert.ok(results[1].query.includes('rtings.com'));
  });
});
