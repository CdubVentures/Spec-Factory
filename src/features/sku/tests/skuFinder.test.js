/**
 * skuFinder — orchestrator smoke.
 *
 * Full orchestration is already covered by `src/core/finder/tests/
 * variantScalarFieldProducer.test.js` + `registerScalarFinder.test.js`. SKF just
 * wires the factory — so this file verifies the wiring end-to-end with stubs:
 *   - happy path: LLM returns MPN → candidate submitted to publisher
 *   - edge: no CEF variants → graceful rejection, no submits
 *
 * Uses `mock.method(globalThis, 'setTimeout', (cb, _ms) => origSetTimeout(cb, 0))`
 * to skip the production 1000ms stagger between variants — matches RDF's pattern.
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runSkuFinder } from '../skuFinder.js';
import { readSkus } from '../skuStore.js';

const TMP = path.join(os.tmpdir(), `skf-orch-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
}

const COMPILED_FIELD_RULES = {
  fields: {
    sku: {
      key: 'sku',
      contract: { type: 'string', shape: 'scalar', list_rules: {} },
      parse: { accepted_formats: [] },
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
    insertFieldCandidate: (entry) => { submittedCandidates.push(entry); },
    getFieldCandidateBySourceIdAndVariant: (pid, fk, sid, vid) => {
      const idx = submittedCandidates.findIndex(
        (c) => c.sourceId === sid && (c.variantId || null) === (vid || null),
      );
      if (idx < 0) return null;
      return { id: idx + 1, variant_id: submittedCandidates[idx].variantId ?? null };
    },
    getFieldCandidateBySourceId: () => null,
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

const PRODUCT = {
  product_id: 'skf-test-001',
  category: 'mouse',
  brand: 'Logitech',
  model: 'G502 HERO',
  base_model: 'G502',
  variant: 'wired',
};

const origSetTimeout = globalThis.setTimeout;
function installImmediateStaggerMock() {
  return mock.method(globalThis, 'setTimeout', (cb, _ms) => origSetTimeout(cb, 0));
}

describe('runSkuFinder — smoke', () => {
  let staggerMock;

  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
    staggerMock = installImmediateStaggerMock();
  });

  after(() => {
    staggerMock?.mock?.restore?.();
    cleanup(TMP);
  });

  it('happy path: LLM returns MPN → candidate submitted with extended evidence', async () => {
    writeProductJson(PRODUCT.product_id);
    const { store: finderStore, runs: finderRuns } = makeFinderStoreStub({ perVariantAttemptBudget: 1 });
    const specDb = makeSpecDbStub({ finderStore });

    const result = await runSkuFinder({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => ({
        result: {
          sku: 'G502-HERO-BLACK',
          confidence: 90,
          unknown_reason: '',
          evidence_refs: [{
            url: 'https://www.logitech.com/g502-hero-black',
            tier: 'tier1',
            confidence: 95,
            supporting_evidence: 'Part Number: G502-HERO-BLACK',
            evidence_kind: 'direct_quote',
          }],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      }),
    });

    assert.equal(result.rejected, false, 'should not be rejected');
    assert.equal(Array.isArray(result.candidates), true);
    assert.equal(result.candidates.length, 1);

    // WHY: The shared publisher normalizer lowercases scalar strings (see
    // `src/features/publisher/validation/checks/normalize.js`). The MPN
    // surfaces either uppercase (pre-normalize) or lowercase (post-normalize)
    // depending on which layer we inspect. Case-preservation for identifiers
    // is a Stage 1 architectural follow-up, not a Stage 2 concern. Smoke:
    // just verify the MPN round-trips in either case.
    assert.equal(
      result.candidates[0].value.toLowerCase(),
      'g502-hero-black',
      'MPN survives LLM → extractCandidate round-trip (case-insensitive)',
    );

    // Publisher received exactly one candidate scoped to the variant + field.
    assert.equal(specDb._submittedCandidates.length, 1);
    assert.equal(specDb._submittedCandidates[0].variantId, 'v_black');
    assert.equal(specDb._submittedCandidates[0].fieldKey, 'sku');

    // JSON store persisted the run.
    const persisted = readSkus({ productId: PRODUCT.product_id, productRoot: PRODUCT_ROOT });
    assert.ok(persisted);
    assert.equal(persisted.runs.length, 1);

    // SQL run insert captured the LLM response verbatim (pre-normalization).
    assert.equal(finderRuns.length, 1);
    assert.equal(finderRuns[0].response.sku, 'G502-HERO-BLACK');
  });

  it('edge: no CEF variants → graceful rejection, no publisher submits', async () => {
    writeProductJson(PRODUCT.product_id);
    const { store: finderStore } = makeFinderStoreStub({ perVariantAttemptBudget: 1 });
    const specDb = makeSpecDbStub({ finderStore, variants: [] });

    const result = await runSkuFinder({
      product: PRODUCT,
      appDb: null,
      specDb,
      config: {},
      productRoot: PRODUCT_ROOT,
      _callLlmOverride: async () => {
        throw new Error('LLM should not be called when no variants');
      },
    });

    assert.equal(result.rejected, true);
    assert.equal(result.rejections[0].reason_code, 'no_cef_data');
    assert.equal(specDb._submittedCandidates.length, 0);
  });
});
