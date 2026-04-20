/**
 * releaseDateFinder — orchestrator boundary tests.
 *
 * Stubs specDb (variants + finder store + field candidate store) and injects
 * LLM responses via _callLlmOverride. Verifies:
 *   - publisher candidate submitted when evidence present and release_date not 'unk'
 *     (publisher's publishConfidenceThreshold is the single gate — no per-finder min)
 *   - LLM's overall confidence flows through verbatim to submitCandidate
 *   - JSON + SQL state persisted per variant even on unknown/low-conf responses
 *   - no_cef_data / unknown_variant rejections
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runReleaseDateFinder, runReleaseDateFinderLoop } from '../releaseDateFinder.js';
import { readReleaseDates } from '../releaseDateStore.js';

const TMP = path.join(os.tmpdir(), `rdf-orch-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');
const CATEGORY_ROOT = path.join(TMP, 'category_authority');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

// WHY: RDF now reads field rules via specDb.getCompiledRules() (SSOT). The test
// stub returns the same shape the compile pipeline produces.
const COMPILED_FIELD_RULES = {
  fields: {
    release_date: {
      key: 'release_date',
      contract: { type: 'date', shape: 'scalar', list_rules: {} },
      parse: { accepted_formats: ['YYYY-MM-DD', 'YYYY-MM', 'YYYY'] },
      enum_policy: 'open',
      enum: { policy: 'open', new_value_policy: { accept_if_evidence: true } },
      evidence: { min_evidence_refs: 1, tier_preference: ['tier1', 'tier2', 'tier3'] },
    },
  },
  known_values: {},
};

function writeProductJson(productId, category = 'mouse') {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
    product_id: productId, category, candidates: {}, fields: {},
  }));
}

const DEFAULT_VARIANTS = [
  { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color' },
  { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', variant_type: 'color' },
];

function makeFinderStoreStub(settings = {}) {
  const upserts = [];
  const runs = [];
  const resolved = { ...settings };
  return {
    store: {
      getSetting: (k) => (k in resolved ? String(resolved[k]) : ''),
      upsert: (row) => { upserts.push(row); },
      insertRun: (row) => { runs.push(row); },
    },
    upserts,
    runs,
  };
}

function makeSpecDbStub({ finderStore, variants = DEFAULT_VARIANTS, category = 'mouse' } = {}) {
  const submittedCandidates = [];
  // WHY: field_candidate_evidence projection — the publisher's evidence gate
  // (checkEvidenceGate) reads `countFieldCandidateEvidenceByCandidateId` to
  // decide if min_evidence_refs is satisfied. Simulate it here so
  // publishCandidate can actually reach 'published' in test runs; otherwise
  // every attempt would fail on below_evidence_refs regardless of confidence.
  const evidenceByCandidateId = new Map();
  return {
    category,
    getFinderStore: () => finderStore,
    getProduct: () => null,
    getCompiledRules: () => COMPILED_FIELD_RULES,
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
    // submitCandidate machinery
    insertFieldCandidate: (entry) => { submittedCandidates.push(entry); },
    getFieldCandidateBySourceId: (pid, fk, sid) => ({ id: submittedCandidates.findIndex(c => c.sourceId === sid) + 1, variant_id: submittedCandidates.find(c => c.sourceId === sid)?.variantId ?? null }),
    // WHY: submitCandidate looks up the freshly-inserted row by (sourceId, variantId)
    // to derive candidateId + evidence projection. Without this, the throw bubbles
    // to produceForVariant's catch → publishStatus='skipped' → loop never satisfies.
    getFieldCandidateBySourceIdAndVariant: (pid, fk, sid, vid) => {
      const idx = submittedCandidates.findIndex(c => c.sourceId === sid && (c.variantId || null) === (vid || null));
      if (idx < 0) return null;
      return { id: idx + 1, variant_id: submittedCandidates[idx].variantId ?? null };
    },
    getFieldCandidatesByProductAndField: () => [],
    getFieldCandidatesByValue: () => [],
    getFieldCandidate: () => null,
    upsertFieldCandidate: () => {},
    // Publisher auto-publish needs these
    getResolvedFieldCandidate: () => null,
    markFieldCandidateResolved: () => {},
    demoteResolvedCandidates: () => {},
    publishCandidate: () => {},
    // Evidence projection (submitCandidate → publisher evidence gate)
    replaceFieldCandidateEvidence: (candidateId, refs) => {
      evidenceByCandidateId.set(Number(candidateId), Array.isArray(refs) ? refs.length : 0);
    },
    countFieldCandidateEvidenceByCandidateId: (candidateId) => (
      evidenceByCandidateId.get(Number(candidateId)) || 0
    ),
    _submittedCandidates: submittedCandidates,
  };
}

const PRODUCT = {
  product_id: 'rdf-test-001',
  category: 'mouse',
  brand: 'TestBrand',
  model: 'TestModel X',
  base_model: 'TestModel',
  variant: 'wireless',
};

// WHY: RDF's per-variant runner uses a 1000ms stagger in production to space LLM
// bursts. Every test stubs the LLM, so the stagger is dead wait. Zero-out setTimeout
// delays only for the duration of these tests — `origSetTimeout(cb, 0)` preserves
// async ordering (microtask gap) without burning wall-clock.
const origSetTimeout = globalThis.setTimeout;
function installImmediateStaggerMock() {
  return mock.method(globalThis, 'setTimeout', (cb, _ms) => origSetTimeout(cb, 0));
}

describe('runReleaseDateFinder', () => {
  let staggerMock;
  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    staggerMock = installImmediateStaggerMock();
  });

  after(() => {
    staggerMock?.mock?.restore?.();
    cleanup(TMP);
  });

  it('happy path: valid date + evidence → candidate submitted + run persisted per variant', async () => {
    const pid = 'rdf-happy';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    const result = await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null,
      specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async (_args) => ({
        result: {
          release_date: '2024-03-15',
          confidence: 92,
          unknown_reason: '',
          evidence_refs: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
          discovery_log: { urls_checked: ['https://mfr.example.com'], queries_run: ['testmodel x release date'], notes: [] },
        },
        usage: null,
      }),
    });

    assert.equal(result.rejected, false);
    assert.equal(result.variants_processed, 2);
    assert.equal(result.candidates.length, 2, 'both variants produced candidates');

    // Publisher received candidates for BOTH variants
    assert.equal(specDb._submittedCandidates.length, 2, 'submitCandidate called per variant');
    const first = specDb._submittedCandidates[0];
    assert.equal(first.fieldKey, 'release_date');
    assert.equal(first.value, '2024-03-15');
    assert.equal(first.sourceType, 'release_date_finder');
    assert.ok(['v_black', 'v_white'].includes(first.variantId), 'variantId scoped');

    // JSON store persisted per variant
    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.runs.length, 2);
    assert.equal(doc.selected.candidates.length, 2);

    // SQL upserts fired per variant
    assert.ok(fs_.upserts.length >= 2);
    const last = fs_.upserts[fs_.upserts.length - 1];
    assert.equal(last.candidate_count, 2);
  });

  it('unknown response: release_date="unk" → no publisher submission, run still persisted', async () => {
    const pid = 'rdf-unknown';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({
        result: {
          release_date: 'unk',
          confidence: 0,
          unknown_reason: 'No sources cite a launch date',
          evidence: [],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      }),
    });

    assert.equal(specDb._submittedCandidates.length, 0, 'unknown responses must NOT submit candidates');

    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.runs.length, 2, 'runs persisted for audit');
    assert.equal(doc.selected.candidates.length, 2);
    for (const c of doc.selected.candidates) {
      assert.equal(c.value, '');
      assert.ok(c.unknown_reason.length > 0);
    }
  });

  it('low confidence values submit to the publisher (single SoT gate = publishConfidenceThreshold)', async () => {
    // WHY: RDF used to have its own minConfidence gate that blocked low-conf
    // LLM results from reaching the publisher. That's redundant with the
    // global publishConfidenceThreshold and was removed — now RDF submits
    // everything with a real date + evidence, and the publisher makes the
    // single gating decision. This test locks in the one-gate contract.
    const pid = 'rdf-low-conf';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({
        result: {
          release_date: '2024',
          confidence: 40, // LLM's overall confidence — trusted verbatim
          unknown_reason: '',
          evidence_refs: [{ url: 'https://example.com', tier: 'tier3', confidence: 50 }],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      }),
    });

    assert.ok(specDb._submittedCandidates.length > 0,
      'low-confidence values still reach the publisher — the publisher decides');

    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    for (const c of doc.selected.candidates) {
      assert.equal(c.value, '2024');
      assert.ok(!('below_confidence' in c),
        'below_confidence is no longer emitted — publisher owns the gate');
    }
  });

  it('LLM overall confidence flows through to submitCandidate verbatim (not overridden by max(per-source))', async () => {
    // WHY: The LLM is asked for an overall confidence number calibrated against
    // its cited evidence (via shared valueConfidencePromptFragment). The finder
    // must trust that number and pass it through to submitCandidate — the
    // publisher's threshold gate should see the LLM's honest assessment, not a
    // mechanically-derived max(per-source) that inflates past what the LLM
    // itself claimed. The rubric in the shared fragment is the guardrail.
    const pid = 'rdf-trust-llm-conf';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [{ variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color' }],
    });

    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({
        result: {
          release_date: '2024-06-01',
          // LLM says 75 — even though per-source evidence hits 95, the LLM is
          // being honest about its overall confidence (maybe the tier1 page was
          // ambiguous about launch vs announce). We trust the LLM's number.
          confidence: 75,
          unknown_reason: '',
          evidence_refs: [
            { url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 },
            { url: 'https://news.example.com', tier: 'tier2', confidence: 90 },
          ],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      }),
    });

    assert.equal(specDb._submittedCandidates.length, 1);
    assert.equal(
      specDb._submittedCandidates[0].confidence,
      75,
      'submitCandidate must receive the LLM overall confidence (75), not max(per-source) (95)',
    );
  });

  it('no variants → rejected with no_cef_data', async () => {
    const pid = 'rdf-no-cef';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore: fs_.store, variants: [] });

    const result = await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => { throw new Error('should not be called'); },
    });

    assert.equal(result.rejected, true);
    assert.equal(result.rejections[0].reason_code, 'no_cef_data');
  });

  it('unknown variant_key filter → rejected with unknown_variant', async () => {
    const pid = 'rdf-unknown-variant';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    const result = await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:nonexistent',
      _callLlmOverride: async () => { throw new Error('should not be called'); },
    });

    assert.equal(result.rejected, true);
    assert.equal(result.rejections[0].reason_code, 'unknown_variant');
  });

  it('variantKey filter runs only that variant', async () => {
    const pid = 'rdf-single-variant';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    const result = await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      _callLlmOverride: async () => ({
        result: {
          release_date: '2024-04-01', confidence: 85,
          evidence_refs: [{ url: 'https://x.example.com', tier: 'tier1', confidence: 90 }],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      }),
    });

    assert.equal(result.variants_processed, 1);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].variant_key, 'color:black');
    assert.equal(specDb._submittedCandidates.length, 1, 'submitCandidate called for one variant only');
  });

  it('no evidence → no publisher submission even when confidence is high', async () => {
    const pid = 'rdf-no-evidence';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({
        result: {
          release_date: '2024-03-15', confidence: 99,
          evidence: [], // empty — should NOT submit
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      }),
    });

    assert.equal(specDb._submittedCandidates.length, 0, 'no evidence → no candidate submission');
  });
});

/**
 * Loop orchestrator contract: retries per variant up to perVariantAttemptBudget,
 * stops early when the call reaches the publisher gate or LLM returned a
 * definitive unknown. Satisfaction predicate lives inside runReleaseDateFinderLoop.
 */
describe('runReleaseDateFinderLoop', () => {
  let staggerMock;
  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    staggerMock = installImmediateStaggerMock();
  });
  after(() => {
    staggerMock?.mock?.restore?.();
    cleanup(TMP);
  });

  const HIGH_CONF_RESPONSE = {
    result: {
      release_date: '2024-03-15',
      confidence: 92,
      unknown_reason: '',
      evidence_refs: [{ url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 }],
      discovery_log: { urls_checked: ['https://mfr.example.com'], queries_run: ['q'], notes: [] },
    },
    usage: null,
  };
  const LOW_CONF_RESPONSE = {
    result: {
      release_date: '2024',
      confidence: 40, // overall LLM self-claim (unused — publisher gates on per-source max)
      unknown_reason: '',
      evidence_refs: [{ url: 'https://x.example.com', tier: 'tier3', confidence: 50 }],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    },
    usage: null,
  };
  const UNKNOWN_DEFINITIVE_RESPONSE = {
    result: {
      release_date: 'unk',
      confidence: 0,
      unknown_reason: 'No sources cite a launch date',
      evidence_refs: [],
      discovery_log: { urls_checked: [], queries_run: [], notes: [] },
    },
    usage: null,
  };

  function makeCounterOverride(responsesByVariant) {
    // responsesByVariant: { [variantLabel]: [response1, response2, ...] }
    const counters = {};
    return async (args) => {
      const label = args.variantLabel;
      counters[label] = (counters[label] || 0) + 1;
      const list = responsesByVariant[label] || responsesByVariant._default || [];
      const idx = Math.min(counters[label] - 1, list.length - 1);
      return list[idx];
    };
  }

  it('budget=3 with low-conf first then high-conf second → stops at 2, publisher called once per variant', async () => {
    const pid = 'rdf-loop-lowthenhigh';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub({ perVariantAttemptBudget: '3' });
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    const counters = {};
    const llmOverride = async (args) => {
      const label = args.variantLabel;
      counters[label] = (counters[label] || 0) + 1;
      return counters[label] === 1 ? LOW_CONF_RESPONSE : HIGH_CONF_RESPONSE;
    };

    const result = await runReleaseDateFinderLoop({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: llmOverride,
    });

    assert.equal(result.rejected, false);
    // 2 variants × 2 attempts each (low → high) = 4 LLM calls
    assert.equal(counters['Black'], 2, 'Black retried once then satisfied');
    assert.equal(counters['White'], 2, 'White retried once then satisfied');
    // WHY: Every attempt reaches the publisher now (no local RDF gate) —
    // submitCandidate persists even below-threshold rows so the publisher
    // gate is the single SoT. The loop still stops the moment an attempt
    // actually publishes, so the LLM call count is unchanged (2 per variant).
    assert.equal(specDb._submittedCandidates.length, 4, 'every attempt writes to field_candidates; publisher decides');
    // Runs persisted for every attempt (audit trail)
    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.runs.length, 4, 'all 4 attempts persisted as runs');
    // Every run in this loop shares a loop_id
    const loopIds = new Set(doc.runs.map((r) => r.response?.loop_id).filter(Boolean));
    assert.equal(loopIds.size, 1, 'all runs in this loop call share one loop_id');
  });

  it('budget=3 with all low-conf → exhausts budget, 0 publisher submits', async () => {
    const pid = 'rdf-loop-all-low';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub({ perVariantAttemptBudget: '3' });
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    let callCount = 0;
    await runReleaseDateFinderLoop({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => { callCount++; return LOW_CONF_RESPONSE; },
    });

    // 2 variants × 3 attempts each = 6 calls (budget exhausted on every variant)
    assert.equal(callCount, 6);
    // WHY: All 6 low-conf attempts still write to field_candidates — the
    // publisher gate (publishConfidenceThreshold) is the one SoT that
    // separates "attempted" from "published". None of these will clear
    // the 0.7 default threshold (per-source max is 50 → 0.5 < 0.7), so
    // the loop retries until budget is exhausted without ever publishing.
    assert.equal(specDb._submittedCandidates.length, 6, 'every attempt writes a candidate; publisher rejects all');
    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.runs.length, 6, 'every attempt persisted');
  });

  it('first call returns unk with unknown_reason → stops at attempt 1 (definitive unknown)', async () => {
    const pid = 'rdf-loop-definitive-unk';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub({ perVariantAttemptBudget: '3' });
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    let callCount = 0;
    await runReleaseDateFinderLoop({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => { callCount++; return UNKNOWN_DEFINITIVE_RESPONSE; },
    });

    // 2 variants × 1 attempt each = 2 calls (no retry on definitive unknown)
    assert.equal(callCount, 2, 'definitive unknown short-circuits the loop');
    assert.equal(specDb._submittedCandidates.length, 0);
  });

  it('variantKey filter retries only the targeted variant', async () => {
    const pid = 'rdf-loop-single';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub({ perVariantAttemptBudget: '3' });
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    const counters = {};
    await runReleaseDateFinderLoop({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      _callLlmOverride: async (args) => {
        const label = args.variantLabel;
        counters[label] = (counters[label] || 0) + 1;
        return LOW_CONF_RESPONSE; // always unsatisfied → exhausts budget
      },
    });

    assert.equal(counters['Black'], 3, 'targeted variant hit budget');
    assert.equal(counters['White'], undefined, 'non-targeted variant untouched');
  });

  it('budget=1 behaves identically to single-call runReleaseDateFinder (regression guard)', async () => {
    const pid = 'rdf-loop-budget-one';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub({ perVariantAttemptBudget: '1' });
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    let callCount = 0;
    await runReleaseDateFinderLoop({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => { callCount++; return LOW_CONF_RESPONSE; },
    });

    // budget=1 → one call per variant, no retry
    assert.equal(callCount, 2);
  });
});
