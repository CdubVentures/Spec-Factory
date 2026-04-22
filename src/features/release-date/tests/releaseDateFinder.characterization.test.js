/**
 * releaseDateFinder — characterization (golden-master) tests.
 *
 * Locks byte-identical behavior before the orchestrator is extracted into
 * src/core/finder/variantScalarFieldProducer.js. Any drift in:
 *   - candidateEntry key order
 *   - run.response key order
 *   - publisher submit argument shape (metadata keys, sourceMeta, etc.)
 *   - two-phase onLlmCallComplete emission (pre-call ping, post-call full)
 *   - publisher/LLM error handling (graceful, non-fatal)
 *   - rejected_by_gate + rejection_reasons flow
 *   - loop_id presence (loop mode only) and single-id per loop call
 *   - getCompiledRules invocation count
 * MUST fail a test here, so the extraction cannot silently regress.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runReleaseDateFinder, runReleaseDateFinderLoop } from '../releaseDateFinder.js';
import { readReleaseDates } from '../releaseDateStore.js';

const TMP = path.join(os.tmpdir(), `rdf-char-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');
const CATEGORY_ROOT = path.join(TMP, 'category_authority');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

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

function makeSpecDbStub({
  finderStore,
  variants = DEFAULT_VARIANTS,
  category = 'mouse',
  onReplaceEvidence = null,
  throwOnReplaceEvidence = false,
  compiledRulesCounter = null,
} = {}) {
  const submittedCandidates = [];
  const evidenceByCandidateId = new Map();
  return {
    category,
    getFinderStore: () => finderStore,
    getProduct: () => null,
    getCompiledRules: () => {
      if (compiledRulesCounter) compiledRulesCounter.count++;
      return COMPILED_FIELD_RULES;
    },
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
    insertFieldCandidate: (entry) => { submittedCandidates.push(entry); },
    getFieldCandidateBySourceId: (pid, fk, sid) => ({
      id: submittedCandidates.findIndex(c => c.sourceId === sid) + 1,
      variant_id: submittedCandidates.find(c => c.sourceId === sid)?.variantId ?? null,
    }),
    getFieldCandidateBySourceIdAndVariant: (pid, fk, sid, vid) => {
      const idx = submittedCandidates.findIndex(c => c.sourceId === sid && (c.variantId || null) === (vid || null));
      if (idx < 0) return null;
      return { id: idx + 1, variant_id: submittedCandidates[idx].variantId ?? null };
    },
    getFieldCandidatesByProductAndField: () => [],
    getFieldCandidatesByValue: () => [],
    getFieldCandidate: () => null,
    upsertFieldCandidate: () => {},
    getResolvedFieldCandidate: () => null,
    markFieldCandidateResolved: () => {},
    demoteResolvedCandidates: () => {},
    publishCandidate: () => {},
    replaceFieldCandidateEvidence: (candidateId, refs) => {
      if (throwOnReplaceEvidence) throw new Error('simulated publisher failure');
      if (onReplaceEvidence) onReplaceEvidence(candidateId, refs);
      evidenceByCandidateId.set(Number(candidateId), Array.isArray(refs) ? refs.length : 0);
    },
    countFieldCandidateEvidenceByCandidateId: (candidateId) => (
      evidenceByCandidateId.get(Number(candidateId)) || 0
    ),
    _submittedCandidates: submittedCandidates,
  };
}

const PRODUCT = {
  product_id: 'rdf-char-001',
  category: 'mouse',
  brand: 'TestBrand',
  model: 'TestModel X',
  base_model: 'TestModel',
  variant: 'wireless',
};

const GOOD_LLM_RESPONSE = {
  result: {
    release_date: '2024-03-15',
    confidence: 92,
    unknown_reason: '',
    evidence_refs: [
      { url: 'https://mfr.example.com', tier: 'tier1', confidence: 95 },
      { url: 'https://news.example.com', tier: 'tier2', confidence: 80 },
    ],
    discovery_log: { urls_checked: ['https://mfr.example.com'], queries_run: ['testmodel x release date'], notes: [] },
  },
  usage: null,
};

// ──────────────────────────────────────────────────────────────
// Key-order locks
// ──────────────────────────────────────────────────────────────

describe('RDF characterization — key-order locks', () => {
  before(() => { fs.mkdirSync(PRODUCT_ROOT, { recursive: true }); });
  after(() => cleanup(TMP));

  it('candidateEntry key order is locked', async () => {
    const pid = 'rdf-char-candentry-keys';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
    });

    const result = await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    assert.equal(result.candidates.length, 1);
    const candidateEntry = result.candidates[0];

    // Exact key order — locked.
    assert.deepEqual(
      Object.keys(candidateEntry),
      ['variant_id', 'variant_key', 'variant_label', 'variant_type', 'value', 'confidence', 'unknown_reason', 'sources', 'ran_at'],
      'candidateEntry key order must not drift',
    );
  });

  it('run.response key order is locked (single-run has no loop_id)', async () => {
    const pid = 'rdf-char-response-keys';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
    });

    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.runs.length, 1);
    const responseKeys = Object.keys(doc.runs[0].response);
    assert.deepEqual(
      responseKeys,
      ['started_at', 'duration_ms', 'variant_id', 'variant_key', 'variant_label', 'release_date', 'confidence', 'unknown_reason', 'evidence_refs', 'discovery_log'],
      'run.response key order must not drift (single-run excludes loop_id)',
    );
  });

  it('run.response in loop mode appends loop_id as last key', async () => {
    const pid = 'rdf-char-response-keys-loop';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub({ perVariantAttemptBudget: '1' });
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
    });

    await runReleaseDateFinderLoop({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    const responseKeys = Object.keys(doc.runs[0].response);
    assert.deepEqual(
      responseKeys,
      ['started_at', 'duration_ms', 'variant_id', 'variant_key', 'variant_label', 'release_date', 'confidence', 'unknown_reason', 'evidence_refs', 'discovery_log', 'loop_id'],
      'loop mode appends loop_id as the final key',
    );
  });

  it('sources[] element key order is locked ({url, tier, confidence})', async () => {
    const pid = 'rdf-char-sources-keys';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
    });

    const result = await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    const source = result.candidates[0].sources[0];
    assert.deepEqual(Object.keys(source), ['url', 'tier', 'confidence']);
    assert.equal(typeof source.url, 'string');
    assert.equal(typeof source.tier, 'string');
    assert.equal(typeof source.confidence, 'number');
  });
});

// ──────────────────────────────────────────────────────────────
// Publisher submit shape lock (load-bearing — frontend & publisher depend on this)
// ──────────────────────────────────────────────────────────────

describe('RDF characterization — publisher submit shape', () => {
  before(() => { fs.mkdirSync(PRODUCT_ROOT, { recursive: true }); });
  after(() => cleanup(TMP));

  it('submitCandidate receives exact argument shape (fieldKey, sourceMeta, metadata, variantId)', async () => {
    const pid = 'rdf-char-submit-shape';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
    });

    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    assert.equal(specDb._submittedCandidates.length, 1);
    const submitted = specDb._submittedCandidates[0];

    // Top-level fields passed into insertFieldCandidate by the publisher
    assert.equal(submitted.fieldKey, 'release_date');
    assert.equal(submitted.value, '2024-03-15');
    assert.equal(submitted.confidence, 92);
    assert.equal(submitted.sourceType, 'release_date_finder');
    assert.equal(submitted.variantId, 'v_black');

    // Metadata must carry EXACTLY the feature-specific keys (lands in metadataJson on insert)
    const metadata = submitted.metadataJson || {};
    const mdKeys = Object.keys(metadata).sort();
    assert.deepEqual(
      mdKeys,
      ['evidence_refs', 'llm_access_mode', 'llm_effort_level', 'llm_thinking', 'llm_web_search', 'variant_key', 'variant_label', 'variant_type'].sort(),
      'publisher metadata keys are the locked contract',
    );

    // evidence_refs flows through unchanged
    assert.equal(Array.isArray(metadata.evidence_refs), true);
    assert.equal(metadata.evidence_refs.length, 2);
    assert.equal(metadata.evidence_refs[0].url, 'https://mfr.example.com');
    assert.equal(metadata.evidence_refs[0].tier, 'tier1');
    assert.equal(metadata.evidence_refs[0].confidence, 95);
    assert.equal(metadata.variant_key, 'color:black');
    assert.equal(metadata.variant_label, 'Black');
    assert.equal(metadata.variant_type, 'color');
  });
});

// ──────────────────────────────────────────────────────────────
// Two-phase onLlmCallComplete emission (drives operations tracker)
// ──────────────────────────────────────────────────────────────

describe('RDF characterization — streaming hooks', () => {
  before(() => { fs.mkdirSync(PRODUCT_ROOT, { recursive: true }); });
  after(() => cleanup(TMP));

  it('onLlmCallComplete fires twice per variant: pre-call (response:null), post-call (full)', async () => {
    const pid = 'rdf-char-llm-complete-two-phase';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
    });

    const calls = [];
    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      onLlmCallComplete: (c) => calls.push({
        hasResponse: c.response !== null,
        label: c.label,
        variant: c.variant,
        hasPrompt: !!(c.prompt?.system && c.prompt?.user),
      }),
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    // Exactly two emissions per variant: pre-call null, post-call full
    assert.equal(calls.length, 2, 'expected two emissions for one variant');
    assert.equal(calls[0].hasResponse, false, 'first emission is the pre-call ping (response:null)');
    assert.equal(calls[0].label, 'Discovery');
    assert.equal(calls[0].variant, 'Black');
    assert.equal(calls[0].hasPrompt, true);
    assert.equal(calls[1].hasResponse, true, 'second emission has the full response payload');
    assert.equal(calls[1].label, 'Discovery');
    assert.equal(calls[1].variant, 'Black');
  });
});

// ──────────────────────────────────────────────────────────────
// Error handling — publisher throw, LLM throw (graceful, non-fatal)
// ──────────────────────────────────────────────────────────────

describe('RDF characterization — error paths', () => {
  before(() => { fs.mkdirSync(PRODUCT_ROOT, { recursive: true }); });
  after(() => cleanup(TMP));

  it('publisher throw sets publisher_error on the candidate and the function still resolves', async () => {
    const pid = 'rdf-char-publisher-throw';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
      throwOnReplaceEvidence: true,
    });

    const result = await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    assert.equal(result.rejected, false, 'publisher throw must NOT propagate');
    assert.equal(result.candidates.length, 1, 'candidate still produced');
    const cand = result.candidates[0];
    assert.ok('publisher_error' in cand, 'publisher_error must be set on the candidate');
    assert.match(cand.publisher_error, /simulated publisher failure/);

    // Run is still persisted for audit
    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc.runs.length, 1, 'run persisted even when publisher throws');
  });

  it('LLM throw yields no candidate for that variant; other variants still process', async () => {
    const pid = 'rdf-char-llm-throw';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    let i = 0;
    const result = await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => {
        if (i++ === 0) throw new Error('boom');
        return GOOD_LLM_RESPONSE;
      },
    });

    // One variant fails (no candidate), one succeeds
    assert.equal(result.rejected, false);
    assert.equal(result.candidates.length, 1, 'only the succeeding variant produced a candidate');
  });
});

// ──────────────────────────────────────────────────────────────
// Compiled rules read-once guarantee
// ──────────────────────────────────────────────────────────────

describe('RDF characterization — compiled rules snapshot', () => {
  before(() => { fs.mkdirSync(PRODUCT_ROOT, { recursive: true }); });
  after(() => cleanup(TMP));

  it('getCompiledRules is invoked exactly once per run (not per variant)', async () => {
    const pid = 'rdf-char-compiled-once';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const counter = { count: 0 };
    const specDb = makeSpecDbStub({ finderStore: fs_.store, compiledRulesCounter: counter });

    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    assert.equal(counter.count, 1, 'compiled rules must be a once-per-run snapshot');
  });
});

// ──────────────────────────────────────────────────────────────
// Loop semantics — loop_id grouping, _loop metadata on results
// ──────────────────────────────────────────────────────────────

describe('RDF characterization — loop id semantics', () => {
  before(() => { fs.mkdirSync(PRODUCT_ROOT, { recursive: true }); });
  after(() => cleanup(TMP));

  it('all runs within a single loop call share one loop_id', async () => {
    const pid = 'rdf-char-loop-id-shared';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub({ perVariantAttemptBudget: '3' });
    const specDb = makeSpecDbStub({ finderStore: fs_.store });

    const LOW = {
      result: {
        release_date: '2024', confidence: 40, unknown_reason: '',
        evidence_refs: [{ url: 'https://x.example.com', tier: 'tier3', confidence: 50 }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      },
      usage: null,
    };

    const res = await runReleaseDateFinderLoop({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => LOW,
    });

    assert.ok(res.loopId, 'result carries loopId');

    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    const loopIds = new Set(doc.runs.map((r) => r.response?.loop_id).filter(Boolean));
    assert.equal(loopIds.size, 1, 'all runs in the call share exactly one loop_id');
    assert.equal([...loopIds][0], res.loopId, 'the loop_id on runs matches the returned loopId');
  });

  it('single-run mode does not emit loop_id on response', async () => {
    const pid = 'rdf-char-no-loop-id-in-single';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
    });

    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal('loop_id' in doc.runs[0].response, false, 'single-run must not include loop_id');
  });
});

// ──────────────────────────────────────────────────────────────
// Run response top-level key lock
// ──────────────────────────────────────────────────────────────

describe('RDF characterization — run result top-level shape', () => {
  before(() => { fs.mkdirSync(PRODUCT_ROOT, { recursive: true }); });
  after(() => cleanup(TMP));

  it('runReleaseDateFinder returns exact top-level keys on success', async () => {
    const pid = 'rdf-char-toplevel-success';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub();
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
    });

    const result = await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    assert.deepEqual(
      Object.keys(result).sort(),
      ['candidates', 'errors', 'fallbackUsed', 'rejected', 'variants_processed'].sort(),
    );
  });

  it('runReleaseDateFinder early-reject returns only { rejected, rejections, candidates }', async () => {
    const pid = 'rdf-char-toplevel-reject';
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

    assert.deepEqual(
      Object.keys(result).sort(),
      ['candidates', 'rejected', 'rejections'].sort(),
      'early-reject carries exactly { rejected, rejections, candidates }',
    );
  });

  it('runReleaseDateFinderLoop appends loopId to the top-level result', async () => {
    const pid = 'rdf-char-toplevel-loop';
    writeProductJson(pid);
    const fs_ = makeFinderStoreStub({ perVariantAttemptBudget: '1' });
    const specDb = makeSpecDbStub({
      finderStore: fs_.store,
      variants: [DEFAULT_VARIANTS[0]],
    });

    const result = await runReleaseDateFinderLoop({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb,
      config: { categoryAuthorityRoot: CATEGORY_ROOT },
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => GOOD_LLM_RESPONSE,
    });

    assert.deepEqual(
      Object.keys(result).sort(),
      ['candidates', 'errors', 'fallbackUsed', 'loopId', 'rejected', 'variants_processed'].sort(),
    );
    assert.equal(typeof result.loopId, 'string');
    assert.ok(result.loopId.length > 0);
  });
});
