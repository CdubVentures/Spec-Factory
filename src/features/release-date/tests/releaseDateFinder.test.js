/**
 * releaseDateFinder — orchestrator boundary tests.
 *
 * Stubs specDb (variants + finder store + field candidate store) and injects
 * LLM responses via _callLlmOverride. Verifies:
 *   - publisher candidate submitted only when confidence >= minConfidence
 *     and evidence present and release_date not 'unk'
 *   - JSON + SQL state persisted per variant even on unknown/low-conf responses
 *   - no_cef_data / unknown_variant rejections
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runReleaseDateFinder } from '../releaseDateFinder.js';
import { readReleaseDates } from '../releaseDateStore.js';

const TMP = path.join(os.tmpdir(), `rdf-orch-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');
const CATEGORY_ROOT = path.join(TMP, 'category_authority');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

function writeFieldRules(category = 'mouse') {
  const dir = path.join(CATEGORY_ROOT, category, 'generated');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'field_rules.json'), JSON.stringify({
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
  }));
}

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

function makeFinderStoreStub() {
  const upserts = [];
  const runs = [];
  return {
    store: {
      getSetting: (k) => (k === 'minConfidence' ? '70' : ''),
      upsert: (row) => { upserts.push(row); },
      insertRun: (row) => { runs.push(row); },
    },
    upserts,
    runs,
  };
}

function makeSpecDbStub({ finderStore, variants = DEFAULT_VARIANTS, category = 'mouse' } = {}) {
  const submittedCandidates = [];
  return {
    category,
    getFinderStore: () => finderStore,
    getProduct: () => null,
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
    // submitCandidate machinery
    insertFieldCandidate: (entry) => { submittedCandidates.push(entry); },
    getFieldCandidateBySourceId: (pid, fk, sid) => ({ id: submittedCandidates.findIndex(c => c.sourceId === sid) + 1 }),
    getFieldCandidatesByProductAndField: () => [],
    // Publisher auto-publish needs these
    getResolvedFieldCandidate: () => null,
    publishCandidate: () => {},
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

describe('runReleaseDateFinder', () => {
  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    writeFieldRules('mouse');
  });

  after(() => cleanup(TMP));

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
          evidence: [{ source_url: 'https://mfr.example.com', source_type: 'manufacturer', tier: 'tier1', excerpt: 'Released March 15, 2024' }],
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

  it('low confidence: below minConfidence → no publisher submission, candidate marked', async () => {
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
          confidence: 40, // below default minConfidence of 70
          unknown_reason: '',
          evidence: [{ source_url: 'https://example.com', source_type: 'review', tier: 'tier3', excerpt: 'Launched sometime in 2024' }],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      }),
    });

    assert.equal(specDb._submittedCandidates.length, 0, 'low-confidence values must NOT submit candidates');

    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    for (const c of doc.selected.candidates) {
      assert.equal(c.value, '2024');
      assert.equal(c.below_confidence, true, 'below_confidence flag set');
    }
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
          evidence: [{ source_url: 'x', source_type: 'manufacturer', tier: 'tier1', excerpt: 'date' }],
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
