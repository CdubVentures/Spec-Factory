/**
 * Unit tests for the SERP URL Selector core functions:
 * - buildSerpSelectorInput
 * - validateSelectorOutput
 * - adaptSerpSelectorOutput
 *
 * RED phase — tests written before implementation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSerpSelectorInput,
  validateSelectorOutput,
  adaptSerpSelectorOutput,
  SERP_SELECTOR_MAX_CANDIDATES,
  SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES,
  SERP_SELECTOR_TITLE_MAX_CHARS,
  SERP_SELECTOR_SNIPPET_MAX_CHARS,
} from '../serpSelector.js';

// ---------------------------------------------------------------------------
// Shared fixture factories
// ---------------------------------------------------------------------------

function makeCategoryConfig(overrides = {}) {
  const sourceHostMap = new Map([
    ['razer.com', { host: 'razer.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
    ['rtings.com', { host: 'rtings.com', tierName: 'lab', role: 'review', tier: 2 }],
    ['amazon.com', { host: 'amazon.com', tierName: 'retailer', role: 'retailer', tier: 3 }],
    ['logitech.com', { host: 'logitech.com', tierName: 'manufacturer', role: 'manufacturer', tier: 1 }],
  ]);
  const approvedRootDomains = new Set(['razer.com', 'rtings.com']);
  return {
    category: 'mouse',
    fieldOrder: ['weight', 'sensor', 'dpi', 'polling_rate'],
    sourceHosts: [...sourceHostMap.values()],
    sourceHostMap,
    sourceRegistry: {},
    approvedRootDomains,
    denylist: ['spam-site.biz'],
    validatedRegistry: { 'rtings.com': { role: 'review' } },
    ...overrides,
  };
}

function makeIdentityLock() {
  return {
    brand: 'Razer',
    model: 'Viper V3 Pro',
    variant: 'Pro',
    productId: 'mouse-razer-viper-v3-pro',
    brand_tokens: ['razer'],
    model_tokens: ['viper', 'v3', 'pro'],
    required_digit_groups: ['3'],
    allowed_model_tokens: ['viper', 'v3', 'pro'],
  };
}

function makeVariables() {
  return { brand: 'Razer', model: 'Viper V3 Pro', variant: 'Pro', category: 'mouse' };
}

function makeBrandResolution() {
  return {
    officialDomain: 'razer.com',
    supportDomain: 'support.razer.com',
    aliases: ['razerzone.com'],
    confidence: 0.8,
    reasoning: ['Primary manufacturer domain'],
  };
}

function makeSearchProfileBase() {
  return {
    variant_guard_terms: ['v2', 'mini', 'lite'],
    negative_terms: ['knockoff'],
    identity_aliases: [{ alias: 'RVU', source: 'learned', weight: 0.6 }],
    archetype_summary: { manufacturer: { hosts: ['razer.com'] } },
  };
}

function makeEffectiveHostPlan() {
  return {
    policy_map: {
      'razer.com': { field_coverage: { high: ['weight', 'sensor'], medium: ['dpi'] } },
      'rtings.com': { field_coverage: { high: ['polling_rate'], medium: ['weight'] } },
    },
  };
}

function makeCandidateRow(overrides = {}) {
  return {
    url: 'https://razer.com/gaming-mice/razer-viper-v3-pro',
    original_url: 'https://razer.com/gaming-mice/razer-viper-v3-pro',
    host: 'razer.com',
    rootDomain: 'razer.com',
    title: 'Razer Viper V3 Pro',
    snippet: 'Official product page for the Razer Viper V3 Pro gaming mouse',
    tier: 1,
    tierName: 'manufacturer',
    role: 'manufacturer',
    doc_kind_guess: 'product_page',
    approvedDomain: true,
    seen_by_providers: ['google'],
    seen_in_queries: ['razer viper v3 pro specs'],
    cross_provider_count: 1,
    provider: 'google',
    query: 'razer viper v3 pro specs',
    ...overrides,
  };
}

function makeQueryMetaByQuery() {
  return new Map([
    ['razer viper v3 pro specs', {
      query: 'razer viper v3 pro specs',
      target_fields: ['weight', 'sensor'],
      doc_hint: 'spec_pdf',
      domain_hint: 'razer.com',
      hint_source: 'deterministic',
    }],
    ['razer viper v3 pro review', {
      query: 'razer viper v3 pro review',
      target_fields: ['polling_rate', 'dpi'],
      doc_hint: 'review',
      domain_hint: '',
      hint_source: 'archetype_planner',
    }],
  ]);
}

function makeFrontierDb(overrides = {}) {
  return {
    isDomainDead: () => false,
    shouldSkipUrl: () => false,
    isRepeatLoser: () => false,
    ...overrides,
  };
}

function makeBaseContext(overrides = {}) {
  return {
    runId: 'run-001',
    category: 'mouse',
    productId: 'mouse-razer-viper-v3-pro',
    round: 0,
    roundMode: 'initial',
    variables: makeVariables(),
    identityLock: makeIdentityLock(),
    brandResolution: makeBrandResolution(),
    missingFields: ['weight', 'sensor', 'dpi', 'polling_rate'],
    missingCriticalFields: ['weight', 'sensor'],
    focusFields: [
      { field_key: 'weight', required_level: 'critical', need_score: 8.5 },
      { field_key: 'sensor', required_level: 'critical', need_score: 7.2 },
    ],
    effectiveHostPlan: makeEffectiveHostPlan(),
    searchProfileBase: makeSearchProfileBase(),
    candidateRows: [
      makeCandidateRow(),
      makeCandidateRow({
        url: 'https://rtings.com/mouse/reviews/razer/viper-v3-pro',
        host: 'rtings.com',
        title: 'Razer Viper V3 Pro Review - RTINGS',
        snippet: 'Full lab review',
        tier: 2,
        tierName: 'lab',
        role: 'review',
        doc_kind_guess: 'review',
        approvedDomain: true,
        seen_in_queries: ['razer viper v3 pro review'],
      }),
    ],
    queryMetaByQuery: makeQueryMetaByQuery(),
    categoryConfig: makeCategoryConfig(),
    frontierDb: makeFrontierDb(),
    discoveryCap: 60,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildSerpSelectorInput
// ---------------------------------------------------------------------------

describe('buildSerpSelectorInput', () => {
  it('returns valid SelectorInput shape', () => {
    const { selectorInput, candidateMap, overflowRows } = buildSerpSelectorInput(makeBaseContext());
    assert.equal(selectorInput.schema_version, 'serp_selector_input.v1');
    assert.ok(selectorInput.run);
    assert.ok(selectorInput.product_lock);
    assert.ok(selectorInput.need_context);
    assert.ok(selectorInput.selection_limits);
    assert.ok(Array.isArray(selectorInput.candidates));
    assert.ok(candidateMap instanceof Map);
    assert.ok(Array.isArray(overflowRows));
  });

  it('run section from params', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext());
    assert.equal(selectorInput.run.run_id, 'run-001');
    assert.equal(selectorInput.run.category, 'mouse');
    assert.equal(selectorInput.run.product_id, 'mouse-razer-viper-v3-pro');
    assert.equal(selectorInput.run.round, 0);
  });

  it('product_lock from identityLock', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext());
    const lock = selectorInput.product_lock;
    assert.equal(lock.brand, 'Razer');
    assert.equal(lock.model, 'Viper V3 Pro');
    assert.equal(lock.variant, 'Pro');
    assert.ok(lock.identity_lock);
    assert.deepEqual(lock.identity_lock.brand_tokens, ['razer']);
    assert.deepEqual(lock.variant_guard_terms, ['v2', 'mini', 'lite']);
    assert.deepEqual(lock.negative_terms, ['knockoff']);
  });

  it('brand_resolution when present', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext());
    assert.ok(selectorInput.brand_resolution);
    assert.equal(selectorInput.brand_resolution.official_domain, 'razer.com');
    assert.equal(selectorInput.brand_resolution.support_domain, 'support.razer.com');
    assert.deepEqual(selectorInput.brand_resolution.aliases, ['razerzone.com']);
  });

  it('brand_resolution when null', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext({ brandResolution: null }));
    assert.equal(selectorInput.brand_resolution, undefined);
  });

  it('need_context from missingFields', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext());
    const ctx = selectorInput.need_context;
    assert.deepEqual(ctx.missing_critical_fields, ['weight', 'sensor']);
    assert.deepEqual(ctx.unresolved_fields, ['weight', 'sensor', 'dpi', 'polling_rate']);
    assert.ok(Array.isArray(ctx.focus_fields));
    assert.equal(ctx.focus_fields.length, 2);
    assert.equal(ctx.focus_fields[0].field_key, 'weight');
    assert.equal(ctx.focus_fields[0].required_level, 'critical');
  });

  it('selection_limits has max_total_keep and prefer_pinned only', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext({ discoveryCap: 60 }));
    const limits = selectorInput.selection_limits;
    assert.equal(limits.max_total_keep, 60);
    assert.equal(limits.prefer_pinned, true);
    // No hard max_approved/max_candidate quotas
    assert.equal(limits.max_approved, undefined);
    assert.equal(limits.max_candidate, undefined);
  });

  it('max_total_keep capped by serpSelectorUrlCap when lower than discoveryCap', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext({
      discoveryCap: 120,
      serpSelectorUrlCap: 50,
    }));
    assert.equal(selectorInput.selection_limits.max_total_keep, 50);
  });

  it('max_total_keep uses discoveryCap when serpSelectorUrlCap is higher', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext({
      discoveryCap: 30,
      serpSelectorUrlCap: 50,
    }));
    assert.equal(selectorInput.selection_limits.max_total_keep, 30);
  });

  it('max_total_keep falls back to discoveryCap when serpSelectorUrlCap not provided', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext({
      discoveryCap: 60,
    }));
    assert.equal(selectorInput.selection_limits.max_total_keep, 60);
  });

  it('candidate cap reads from domainClassifierUrlCap when provided', () => {
    const rows = [];
    for (let i = 0; i < 100; i++) {
      rows.push(makeCandidateRow({
        url: `https://site${i}.com/page`,
        host: `site${i}.com`,
        title: `Page ${i}`,
        approvedDomain: false,
        tier: 4,
      }));
    }
    const ctx = makeBaseContext({ candidateRows: rows, domainClassifierUrlCap: 40 });
    const { selectorInput, overflowRows } = buildSerpSelectorInput(ctx);
    assert.ok(selectorInput.candidates.length <= 40, `Expected <= 40, got ${selectorInput.candidates.length}`);
    assert.ok(overflowRows.length >= 60, `Expected >= 60 overflow, got ${overflowRows.length}`);
  });

  it('candidate cap defaults to SERP_SELECTOR_MAX_CANDIDATES when domainClassifierUrlCap not provided', () => {
    const rows = [];
    for (let i = 0; i < SERP_SELECTOR_MAX_CANDIDATES + 5; i++) {
      rows.push(makeCandidateRow({
        url: `https://site${i}.com/page`,
        host: `site${i}.com`,
        title: `Page ${i}`,
        approvedDomain: false,
        tier: 4,
      }));
    }
    const ctx = makeBaseContext({ candidateRows: rows });
    const { selectorInput } = buildSerpSelectorInput(ctx);
    assert.ok(selectorInput.candidates.length <= SERP_SELECTOR_MAX_CANDIDATES);
  });

  it('candidates[] shape', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext());
    assert.ok(selectorInput.candidates.length >= 1);
    const c = selectorInput.candidates[0];
    assert.ok(typeof c.id === 'string');
    assert.ok(typeof c.url === 'string');
    assert.ok(typeof c.host === 'string');
    assert.ok(typeof c.source_channel === 'string');
    assert.ok(c.host_signals);
    assert.ok(c.identity_signals);
    assert.ok(c.surface_flags);
  });

  it('candidates[] official_host from brandResolution only', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext());
    const razerCandidate = selectorInput.candidates.find((c) => c.host === 'razer.com');
    assert.ok(razerCandidate);
    assert.equal(razerCandidate.host_signals.official_host, true);
  });

  it('candidates[] official_host false for other manufacturers', () => {
    const ctx = makeBaseContext({
      candidateRows: [
        makeCandidateRow({
          url: 'https://logitech.com/g-pro-x',
          host: 'logitech.com',
          title: 'Logitech G Pro X',
          tier: 1,
          tierName: 'manufacturer',
          role: 'manufacturer',
          approvedDomain: false,
        }),
      ],
    });
    const { selectorInput } = buildSerpSelectorInput(ctx);
    const logitechCandidate = selectorInput.candidates.find((c) => c.host === 'logitech.com');
    assert.ok(logitechCandidate);
    // WHY: logitech.com is a manufacturer host but NOT the resolved brand domain
    assert.equal(logitechCandidate.host_signals.official_host, false);
  });

  it('candidates[] support_host from brandResolution', () => {
    const ctx = makeBaseContext({
      candidateRows: [
        makeCandidateRow({
          url: 'https://support.razer.com/gaming-mice/razer-viper-v3-pro',
          host: 'support.razer.com',
          title: 'Razer Viper V3 Pro Support',
          tier: 1,
          tierName: 'manufacturer',
          role: 'support',
        }),
      ],
    });
    const { selectorInput } = buildSerpSelectorInput(ctx);
    const supportCandidate = selectorInput.candidates[0];
    assert.equal(supportCandidate.host_signals.support_host, true);
  });

  it('candidates[] preferred_host from isApprovedHost', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext());
    const razerCandidate = selectorInput.candidates.find((c) => c.host === 'razer.com');
    assert.ok(razerCandidate);
    // WHY: razer.com is in approvedRootDomains → preferred_host true
    assert.equal(razerCandidate.host_signals.preferred_host, true);
  });

  it('candidates[] identity_signals computed', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext());
    const c = selectorInput.candidates[0];
    // Title/snippet contain 'Razer' and 'Viper V3 Pro'
    assert.equal(c.identity_signals.brand_match, true);
    assert.equal(c.identity_signals.model_match, true);
  });

  it('candidates[] surface_flags computed', () => {
    const ctx = makeBaseContext({
      candidateRows: [
        makeCandidateRow({
          url: 'https://razer.com/spec.pdf',
          host: 'razer.com',
          title: 'Razer Viper V3 Pro Spec Sheet',
          doc_kind_guess: 'spec_pdf',
        }),
      ],
    });
    const { selectorInput } = buildSerpSelectorInput(ctx);
    assert.equal(selectorInput.candidates[0].surface_flags.is_pdf, true);
  });

  it('candidates[] history_flags from frontierDb', () => {
    const ctx = makeBaseContext({
      frontierDb: makeFrontierDb({
        isDomainDead: (host) => host === 'razer.com',
      }),
    });
    const { selectorInput } = buildSerpSelectorInput(ctx);
    const c = selectorInput.candidates.find((c) => c.host === 'razer.com');
    assert.equal(c.history_flags.dead_domain, true);
  });

  it('candidates[] query_hits from queryMetaByQuery', () => {
    const { selectorInput } = buildSerpSelectorInput(makeBaseContext());
    const c = selectorInput.candidates[0];
    assert.ok(Array.isArray(c.query_hits));
    assert.ok(c.query_hits.length >= 1);
    assert.ok(Array.isArray(c.query_hits[0].target_fields));
  });

  it('pinned rows get priority slots before cap', () => {
    // Create many non-pinned + one pinned row at the end
    const rows = [];
    for (let i = 0; i < SERP_SELECTOR_MAX_CANDIDATES + 5; i++) {
      rows.push(makeCandidateRow({
        url: `https://unknown${i}.com/page`,
        host: `unknown${i}.com`,
        title: `Page ${i}`,
        approvedDomain: false,
        tier: 4,
        tierName: 'unknown',
        role: '',
      }));
    }
    // Add a pinned row (official host)
    rows.push(makeCandidateRow({
      url: 'https://razer.com/pinned-product',
      host: 'razer.com',
      title: 'Razer Viper V3 Pro - Official',
      approvedDomain: true,
    }));

    const ctx = makeBaseContext({ candidateRows: rows });
    const { selectorInput } = buildSerpSelectorInput(ctx);
    const sentIds = selectorInput.candidates.map((c) => c.id);
    // Pinned row must be in the sent set despite being added after cap
    const pinnedSent = selectorInput.candidates.some((c) => c.url.includes('pinned-product'));
    assert.ok(pinnedSent, 'Pinned row must bypass normal cap ordering');
  });

  it('total including priority hard-capped at ABSOLUTE_MAX', () => {
    // Create more pinned rows than ABSOLUTE_MAX
    const rows = [];
    for (let i = 0; i < SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES + 10; i++) {
      rows.push(makeCandidateRow({
        url: `https://razer.com/page-${i}`,
        host: 'razer.com',
        title: `Razer Page ${i}`,
        approvedDomain: true,
        seen_in_queries: ['q1', 'q2'], // multi-query → priority
      }));
    }
    const ctx = makeBaseContext({ candidateRows: rows });
    const { selectorInput } = buildSerpSelectorInput(ctx);
    assert.ok(
      selectorInput.candidates.length <= SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES,
      `Sent ${selectorInput.candidates.length} candidates, expected <= ${SERP_SELECTOR_ABSOLUTE_MAX_CANDIDATES}`,
    );
  });

  it('overflow candidates returned with ids and reason', () => {
    const rows = [];
    for (let i = 0; i < SERP_SELECTOR_MAX_CANDIDATES + 5; i++) {
      rows.push(makeCandidateRow({
        url: `https://unknown${i}.com/page`,
        host: `unknown${i}.com`,
        title: `Page ${i}`,
        approvedDomain: false,
        tier: 4,
      }));
    }
    const ctx = makeBaseContext({ candidateRows: rows });
    const { overflowRows } = buildSerpSelectorInput(ctx);
    assert.ok(overflowRows.length > 0, 'Expected overflow rows when candidateRows > cap');
  });

  it('title/snippet truncation', () => {
    const longTitle = 'A'.repeat(SERP_SELECTOR_TITLE_MAX_CHARS + 50);
    const longSnippet = 'B'.repeat(SERP_SELECTOR_SNIPPET_MAX_CHARS + 50);
    const ctx = makeBaseContext({
      candidateRows: [makeCandidateRow({ title: longTitle, snippet: longSnippet })],
    });
    const { selectorInput } = buildSerpSelectorInput(ctx);
    assert.ok(selectorInput.candidates[0].title.length <= SERP_SELECTOR_TITLE_MAX_CHARS);
    assert.ok(selectorInput.candidates[0].snippet.length <= SERP_SELECTOR_SNIPPET_MAX_CHARS);
  });

  it('empty candidateRows', () => {
    const ctx = makeBaseContext({ candidateRows: [] });
    const { selectorInput, candidateMap, overflowRows } = buildSerpSelectorInput(ctx);
    assert.deepEqual(selectorInput.candidates, []);
    assert.equal(candidateMap.size, 0);
    assert.deepEqual(overflowRows, []);
  });
});

// ---------------------------------------------------------------------------
// validateSelectorOutput
// ---------------------------------------------------------------------------

function makeValidOutput(candidateIds) {
  const approved = candidateIds.slice(0, 1);
  const candidate = candidateIds.slice(1, 2);
  const reject = candidateIds.slice(2);
  const kept = [...approved, ...candidate];
  return {
    schema_version: 'serp_selector_output.v1',
    keep_ids: kept,
    approved_ids: approved,
    candidate_ids: candidate,
    reject_ids: reject,
    results: candidateIds.map((id, i) => ({
      id,
      decision: approved.includes(id) ? 'approved' : candidate.includes(id) ? 'candidate' : 'reject',
      score: approved.includes(id) ? 0.9 : candidate.includes(id) ? 0.6 : 0.1,
      confidence: 'high',
      fetch_rank: approved.includes(id) ? 1 : candidate.includes(id) ? 2 : null,
      page_type: 'product_page',
      authority_bucket: 'official',
      reason_code: 'exact_official_product',
      reason: 'Official product page',
    })),
    summary: {
      input_count: candidateIds.length,
      approved_count: approved.length,
      candidate_count: candidate.length,
      reject_count: reject.length,
    },
  };
}

describe('validateSelectorOutput', () => {
  const ids = ['c_0', 'c_1', 'c_2'];

  it('valid output with keeps → valid=true', () => {
    const result = validateSelectorOutput({
      selectorOutput: makeValidOutput(ids),
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, true);
  });

  it('valid all-reject (keep_ids empty, results full) → valid=true', () => {
    const output = {
      schema_version: 'serp_selector_output.v1',
      keep_ids: [],
      approved_ids: [],
      candidate_ids: [],
      reject_ids: ids,
      results: ids.map((id) => ({
        id,
        decision: 'reject',
        score: 0.1,
        confidence: 'low',
        fetch_rank: null,
        page_type: 'unknown',
        authority_bucket: 'unknown',
        reason_code: 'low_value_surface',
        reason: 'Junk',
      })),
      summary: { input_count: 3, approved_count: 0, candidate_count: 0, reject_count: 3 },
    };
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, true);
  });

  it('missing results array → valid=false', () => {
    const result = validateSelectorOutput({
      selectorOutput: { keep_ids: [], approved_ids: [], candidate_ids: [], reject_ids: [] },
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
    assert.ok(result.reason);
  });

  it('results.length !== candidateIds.length → valid=false', () => {
    const output = makeValidOutput(ids);
    output.results = output.results.slice(0, 1); // Only 1 result for 3 candidates
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('unknown ID in results → valid=false', () => {
    const output = makeValidOutput(ids);
    output.results[0].id = 'UNKNOWN_ID';
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('duplicate ID in results → valid=false', () => {
    const output = makeValidOutput(ids);
    output.results[1].id = output.results[0].id;
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('invalid decision enum → valid=false', () => {
    const output = makeValidOutput(ids);
    output.results[0].decision = 'maybe';
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('approved_ids !== results where decision=approved → valid=false', () => {
    const output = makeValidOutput(ids);
    // Swap: approved_ids says c_0, but results say c_1 is approved
    output.approved_ids = ['c_1'];
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('approved_ids + candidate_ids !== keep_ids → valid=false', () => {
    const output = makeValidOutput(ids);
    output.keep_ids = ['c_0']; // Missing c_1 which is candidate
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('ID in both approved_ids and reject_ids → valid=false', () => {
    const output = makeValidOutput(ids);
    output.reject_ids = [...output.reject_ids, output.approved_ids[0]];
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('non-contiguous fetch_rank → valid=false', () => {
    const output = makeValidOutput(ids);
    // Set ranks to 1 and 3 (gap at 2)
    const kept = output.results.filter((r) => r.decision !== 'reject');
    if (kept.length >= 2) {
      kept[0].fetch_rank = 1;
      kept[1].fetch_rank = 3;
    }
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('null fetch_rank on kept row → valid=false', () => {
    const output = makeValidOutput(ids);
    const kept = output.results.find((r) => r.decision === 'approved');
    kept.fetch_rank = null;
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('non-null fetch_rank on rejected row → valid=false', () => {
    const output = makeValidOutput(ids);
    const rejected = output.results.find((r) => r.decision === 'reject');
    if (rejected) {
      rejected.fetch_rank = 99;
    }
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 60,
    });
    assert.equal(result.valid, false);
  });

  it('keep_ids.length > max_total_keep → valid=false', () => {
    // All 3 kept, but max_total_keep = 1
    const output = {
      ...makeValidOutput(ids),
      keep_ids: ids,
      approved_ids: ids,
      candidate_ids: [],
      reject_ids: [],
    };
    output.results = ids.map((id, i) => ({
      id,
      decision: 'approved',
      score: 0.9,
      confidence: 'high',
      fetch_rank: i + 1,
      page_type: 'product_page',
      authority_bucket: 'official',
      reason_code: 'exact_official_product',
      reason: 'test',
    }));
    const result = validateSelectorOutput({
      selectorOutput: output,
      candidateIds: ids,
      maxTotalKeep: 1,
    });
    assert.equal(result.valid, false);
  });
});

// ---------------------------------------------------------------------------
// adaptSerpSelectorOutput
// ---------------------------------------------------------------------------

describe('adaptSerpSelectorOutput', () => {
  function makeAdapterContext() {
    const candidateMap = new Map([
      ['c_0', makeCandidateRow({ url: 'https://razer.com/product', approvedDomain: true })],
      ['c_1', makeCandidateRow({ url: 'https://rtings.com/review', host: 'rtings.com', approvedDomain: true })],
      ['c_2', makeCandidateRow({ url: 'https://unknown.com/page', host: 'unknown.com', approvedDomain: false })],
    ]);
    const selectorOutput = makeValidOutput(['c_0', 'c_1', 'c_2']);
    return { selectorOutput, candidateMap, overflowRows: [] };
  }

  it('approved decisions in selected array', () => {
    const { selected } = adaptSerpSelectorOutput(makeAdapterContext());
    const approvedRows = selected.filter((r) => r.approval_bucket === 'approved');
    assert.ok(approvedRows.length >= 1);
  });

  it('candidate decisions in selected array', () => {
    const { selected } = adaptSerpSelectorOutput(makeAdapterContext());
    const candidateRows = selected.filter((r) => r.approval_bucket === 'candidate');
    assert.ok(candidateRows.length >= 1);
  });

  it('reject decisions in notSelected', () => {
    const { notSelected } = adaptSerpSelectorOutput(makeAdapterContext());
    assert.ok(notSelected.length >= 1);
  });

  it('every selected has downstream fields', () => {
    const { selected } = adaptSerpSelectorOutput(makeAdapterContext());
    for (const row of selected) {
      assert.ok('identity_prelim' in row, 'missing identity_prelim');
      assert.ok('host_trust_class' in row, 'missing host_trust_class');
      assert.ok('doc_kind_guess' in row, 'missing doc_kind_guess');
      assert.ok('primary_lane' in row, 'missing primary_lane');
      assert.ok('triage_disposition' in row, 'missing triage_disposition');
      assert.ok('approval_bucket' in row, 'missing approval_bucket');
      assert.ok('selection_priority' in row, 'missing selection_priority');
      assert.ok('score' in row, 'missing score');
      assert.equal(row.triage_enriched, true);
      assert.equal(row.triage_schema_version, 2);
    }
  });

  it('approvedDomain preserved from original row', () => {
    const { selected } = adaptSerpSelectorOutput(makeAdapterContext());
    // c_0 has approvedDomain=true, c_1 has approvedDomain=true
    for (const row of selected) {
      assert.equal(typeof row.approvedDomain, 'boolean');
    }
  });

  it('score normalized 0-1 to 0-100', () => {
    const { selected } = adaptSerpSelectorOutput(makeAdapterContext());
    const approvedRow = selected.find((r) => r.approval_bucket === 'approved');
    assert.ok(approvedRow.score >= 0 && approvedRow.score <= 100);
  });

  it('score_source is llm_selector', () => {
    const { selected } = adaptSerpSelectorOutput(makeAdapterContext());
    assert.equal(selected[0].score_source, 'llm_selector');
  });

  it('score_breakdown includes score_source', () => {
    const { selected } = adaptSerpSelectorOutput(makeAdapterContext());
    assert.equal(selected[0].score_breakdown.score_source, 'llm_selector');
  });

  it('fetch_rank ordering', () => {
    const { selected } = adaptSerpSelectorOutput(makeAdapterContext());
    for (let i = 1; i < selected.length; i++) {
      assert.ok(
        (selected[i]._fetch_rank || 0) >= (selected[i - 1]._fetch_rank || 0),
        'Selected array must be ordered by fetch_rank ascending',
      );
    }
  });

  it('authority_bucket to host_trust_class mapping', () => {
    const mapping = {
      official: 'official',
      support: 'support',
      validated_registry: 'trusted_specdb',
      trusted_review: 'trusted_review',
      trusted_database: 'trusted_specdb',
      retailer: 'retailer',
      community: 'community',
      unknown: 'unknown',
    };
    for (const [bucket, expected] of Object.entries(mapping)) {
      const ctx = makeAdapterContext();
      ctx.selectorOutput.results[0].authority_bucket = bucket;
      const { selected } = adaptSerpSelectorOutput(ctx);
      const row = selected.find((r) => r.url === ctx.candidateMap.get('c_0').url);
      assert.equal(row.host_trust_class, expected, `${bucket} should map to ${expected}`);
    }
  });

  it('laneStats has _compatibility flag', () => {
    const { laneStats } = adaptSerpSelectorOutput(makeAdapterContext());
    assert.equal(laneStats._compatibility, true);
  });

  it('empty keep_ids → empty selected, all in notSelected', () => {
    const ctx = makeAdapterContext();
    ctx.selectorOutput.keep_ids = [];
    ctx.selectorOutput.approved_ids = [];
    ctx.selectorOutput.candidate_ids = [];
    ctx.selectorOutput.reject_ids = ['c_0', 'c_1', 'c_2'];
    ctx.selectorOutput.results = ctx.selectorOutput.results.map((r) => ({
      ...r,
      decision: 'reject',
      fetch_rank: null,
    }));
    const { selected, notSelected } = adaptSerpSelectorOutput(ctx);
    assert.equal(selected.length, 0);
    assert.equal(notSelected.length, 3);
  });

  it('overflow rows in notSelected with selector_input_capped', () => {
    const ctx = makeAdapterContext();
    ctx.overflowRows = [
      makeCandidateRow({ url: 'https://overflow1.com/page', host: 'overflow1.com' }),
    ];
    const { notSelected } = adaptSerpSelectorOutput(ctx);
    const overflowInNotSelected = notSelected.filter(
      (r) => r.triage_disposition === 'selector_input_capped',
    );
    assert.ok(overflowInNotSelected.length >= 1);
  });
});
