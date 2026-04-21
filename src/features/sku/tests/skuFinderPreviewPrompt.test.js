/**
 * SKU Prompt Preview — byte-identical parity with real-run snapshot.
 * Mirrors releaseDateFinderPreviewPrompt.test.js with sku-specific fixtures.
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runSkuFinder } from '../skuFinder.js';
import { compileSkuFinderPreviewPrompt } from '../skuFinderPreviewPrompt.js';
import { readSkus } from '../skuStore.js';

const TMP = path.join(os.tmpdir(), `sku-preview-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');

const COMPILED_FIELD_RULES = {
  fields: {
    sku: {
      key: 'sku',
      contract: { type: 'string', shape: 'scalar', list_rules: {} },
      parse: {},
      enum_policy: 'open',
      enum: { policy: 'open', new_value_policy: { accept_if_evidence: true } },
      evidence: { min_evidence_refs: 1, tier_preference: ['tier1', 'tier2', 'tier3'] },
    },
  },
  known_values: {},
};

const VARIANTS = [
  { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color' },
  { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', variant_type: 'color' },
];

const PRODUCT = {
  product_id: 'sku-preview-001',
  category: 'mouse',
  brand: 'TestBrand',
  model: 'TestModel X',
  base_model: 'TestModel',
  variant: 'wireless',
};

function writeProductJson(productId) {
  const dir = path.join(PRODUCT_ROOT, productId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'product.json'), JSON.stringify({
    product_id: productId, category: 'mouse', candidates: {}, fields: {},
  }));
}

function makeStubFinderStore(settings = {}) {
  const upserts = [];
  const runs = [];
  return {
    store: {
      getSetting: (k) => (k in settings ? String(settings[k]) : ''),
      upsert: (row) => { upserts.push(row); },
      insertRun: (row) => { runs.push(row); },
      listSuppressions: () => [],
    },
    upserts, runs,
  };
}

function makeStubSpecDb({ finderStore, variants = VARIANTS } = {}) {
  const submittedCandidates = [];
  const evidenceByCandidateId = new Map();
  return {
    category: 'mouse',
    getFinderStore: () => finderStore,
    getProduct: () => null,
    getCompiledRules: () => COMPILED_FIELD_RULES,
    variants: {
      listActive: () => variants,
      listByProduct: () => variants,
    },
    insertFieldCandidate: (entry) => { submittedCandidates.push(entry); },
    getFieldCandidateBySourceId: (_pid, _fk, sid) => ({ id: submittedCandidates.findIndex(c => c.sourceId === sid) + 1, variant_id: submittedCandidates.find(c => c.sourceId === sid)?.variantId ?? null }),
    getFieldCandidateBySourceIdAndVariant: (_pid, _fk, sid, vid) => {
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
      evidenceByCandidateId.set(Number(candidateId), Array.isArray(refs) ? refs.length : 0);
    },
    countFieldCandidateEvidenceByCandidateId: (candidateId) => (
      evidenceByCandidateId.get(Number(candidateId)) || 0
    ),
    _submittedCandidates: submittedCandidates,
  };
}

const origSetTimeout = globalThis.setTimeout;
function installImmediateStaggerMock() {
  return mock.method(globalThis, 'setTimeout', (cb, _ms) => origSetTimeout(cb, 0));
}

describe('SKU prompt preview — parity with real-run snapshot', () => {
  let staggerMock;
  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    staggerMock = installImmediateStaggerMock();
  });
  after(() => {
    staggerMock?.mock?.restore?.();
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ }
  });

  it('preview system + user match captured real-run Discovery snapshot byte-for-byte', async () => {
    const pid = 'sku-parity';
    writeProductJson(pid);
    const fs_ = makeStubFinderStore();
    const specDb = makeStubSpecDb({ finderStore: fs_.store });

    const preview = await compileSkuFinderPreviewPrompt({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb, config: {}, productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black' },
    });

    assert.equal(preview.finder, 'sku');
    assert.equal(preview.mode, 'run');
    assert.equal(preview.prompts.length, 1);
    assert.equal(preview.prompts[0].label, 'sku');

    const captured = [];
    await runSkuFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb, config: {}, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      onLlmCallComplete: (info) => { captured.push(info); },
      _callLlmOverride: async () => ({
        result: {
          sku: 'TB-TMODEL-BLK',
          confidence: 90, unknown_reason: '',
          evidence_refs: [{ url: 'https://mfr', tier: 'tier1', confidence: 90 }],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      }),
    });

    const discoveryCall = captured.find((c) => c.label === 'Discovery' && c.response == null);
    assert.ok(discoveryCall, 'expected a pre-call Discovery onLlmCallComplete');

    assert.equal(preview.prompts[0].system, discoveryCall.prompt.system,
      'preview system prompt must match real-run Discovery system byte-for-byte');
    assert.equal(preview.prompts[0].user, discoveryCall.prompt.user,
      'preview user message must match real-run Discovery user byte-for-byte');
  });

  it('preview writes nothing to SQL / JSON / publisher', async () => {
    const pid = 'sku-no-mut';
    writeProductJson(pid);
    const fs_ = makeStubFinderStore();
    const specDb = makeStubSpecDb({ finderStore: fs_.store });

    const jsonBefore = fs.existsSync(path.join(PRODUCT_ROOT, pid, 'sku.json'));

    await compileSkuFinderPreviewPrompt({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb, config: {}, productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black' },
    });

    assert.equal(fs_.upserts.length, 0);
    assert.equal(fs_.runs.length, 0);
    assert.equal(specDb._submittedCandidates.length, 0);
    assert.equal(fs.existsSync(path.join(PRODUCT_ROOT, pid, 'sku.json')), jsonBefore);

    const doc = readSkus({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc?.runs?.length ?? 0, 0);
  });

  it('loop mode labels iter-1 and includes the iteration disclaimer note', async () => {
    const pid = 'sku-loop-note';
    writeProductJson(pid);
    const fs_ = makeStubFinderStore();
    const specDb = makeStubSpecDb({ finderStore: fs_.store });

    const preview = await compileSkuFinderPreviewPrompt({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb, config: {}, productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black', mode: 'loop' },
    });

    assert.equal(preview.mode, 'loop');
    assert.equal(preview.prompts.length, 1);
    assert.match(preview.prompts[0].label, /loop iter-1/);
    const hasDisclaimer = preview.prompts[0].notes.some((n) => /iteration 1 only/i.test(n));
    assert.ok(hasDisclaimer, 'loop mode notes must include the iteration-1 disclaimer');
  });

  it('unknown variant → 404', async () => {
    const pid = 'sku-404';
    writeProductJson(pid);
    const fs_ = makeStubFinderStore();
    const specDb = makeStubSpecDb({ finderStore: fs_.store });

    await assert.rejects(
      () => compileSkuFinderPreviewPrompt({
        product: { ...PRODUCT, product_id: pid },
        appDb: null, specDb, config: {}, productRoot: PRODUCT_ROOT,
        body: { variant_key: 'does-not-exist' },
      }),
      (err) => err.statusCode === 404,
    );
  });
});
