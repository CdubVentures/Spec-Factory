/**
 * RDF Prompt Preview — byte-identical parity with real-run snapshot.
 *
 * Mirrors colorEditionPreviewPrompt.test.js: the preview endpoint compiles the
 * exact prompt the next run would dispatch. This test drives the same stub
 * state through BOTH paths and asserts byte-equality for system + user.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runReleaseDateFinder as runReleaseDateFinderBase } from '../releaseDateFinder.js';
import { compileReleaseDateFinderPreviewPrompt } from '../releaseDateFinderPreviewPrompt.js';
import { readReleaseDates } from '../releaseDateStore.js';

const TMP = path.join(os.tmpdir(), `rdf-preview-test-${Date.now()}`);
const PRODUCT_ROOT = path.join(TMP, 'products');

const TEST_CONFIG = { evidenceVerificationEnabled: false };

const runReleaseDateFinder = (opts) => runReleaseDateFinderBase({ _staggerMsOverride: 0, ...opts });

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

const VARIANTS = [
  { variant_id: 'v_black', variant_key: 'color:black', variant_label: 'Black', variant_type: 'color' },
  { variant_id: 'v_white', variant_key: 'color:white', variant_label: 'White', variant_type: 'color' },
];

const PRODUCT = {
  product_id: 'rdf-preview-001',
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

function makeStubFinderStore(settings = {}, overrides = {}) {
  const upserts = [];
  const runs = [];
  return {
    store: {
      getSetting: (k) => (k in settings ? String(settings[k]) : ''),
      upsert: (row) => { upserts.push(row); },
      insertRun: (row) => { runs.push(row); },
      ...overrides,
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

describe('RDF prompt preview — parity with real-run snapshot', () => {
  before(() => {
    fs.mkdirSync(PRODUCT_ROOT, { recursive: true });
  });
  after(() => {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* */ }
  });

  it('preview system + user match captured real-run Discovery snapshot byte-for-byte', async () => {
    const pid = 'rdf-parity';
    writeProductJson(pid);
    const fs_ = makeStubFinderStore();
    const specDb = makeStubSpecDb({ finderStore: fs_.store });

    const preview = await compileReleaseDateFinderPreviewPrompt({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb, config: TEST_CONFIG, productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black' },
    });

    assert.equal(preview.finder, 'rdf');
    assert.equal(preview.mode, 'run');
    assert.equal(preview.prompts.length, 1);
    assert.equal(preview.prompts[0].label, 'release-date');

    const captured = [];
    await runReleaseDateFinder({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb, config: TEST_CONFIG, productRoot: PRODUCT_ROOT,
      variantKey: 'color:black',
      onLlmCallComplete: (info) => { captured.push(info); },
      _callLlmOverride: async () => ({
        result: {
          release_date: '2024-03-15',
          confidence: 90, unknown_reason: '',
          evidence_refs: [{ url: 'https://x', tier: 'tier1', confidence: 90 }],
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
    const pid = 'rdf-no-mut';
    writeProductJson(pid);
    const fs_ = makeStubFinderStore();
    const specDb = makeStubSpecDb({ finderStore: fs_.store });

    const jsonPathBefore = fs.existsSync(path.join(PRODUCT_ROOT, pid, 'release_date.json'));

    await compileReleaseDateFinderPreviewPrompt({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb, config: {}, productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black' },
    });

    assert.equal(fs_.upserts.length, 0, 'no SQL summary upserts');
    assert.equal(fs_.runs.length, 0, 'no SQL run inserts');
    assert.equal(specDb._submittedCandidates.length, 0, 'no publisher submissions');
    const jsonPathAfter = fs.existsSync(path.join(PRODUCT_ROOT, pid, 'release_date.json'));
    assert.equal(jsonPathAfter, jsonPathBefore, 'json file creation state unchanged');

    const doc = readReleaseDates({ productId: pid, productRoot: PRODUCT_ROOT });
    assert.equal(doc?.runs?.length ?? 0, 0, 'no runs persisted');
  });

  it('preview reads previous discovery from SQL before stale release_date.json history', async () => {
    const pid = 'rdf-preview-sql-history';
    writeProductJson(pid);
    fs.writeFileSync(path.join(PRODUCT_ROOT, pid, 'release_date.json'), JSON.stringify({
      product_id: pid,
      category: 'mouse',
      selected: { candidates: [] },
      run_count: 1,
      next_run_number: 2,
      runs: [{
        run_number: 1,
        response: {
          variant_id: 'v_black',
          variant_key: 'color:black',
          discovery_log: {
            urls_checked: ['https://json-stale.example/rdf'],
            queries_run: ['json stale rdf query'],
          },
        },
      }],
    }, null, 2));

    const fs_ = makeStubFinderStore(
      { urlHistoryEnabled: 'true', queryHistoryEnabled: 'true' },
      {
        get: () => ({ category: 'mouse', product_id: pid, run_count: 1, latest_ran_at: '2026-04-01T00:00:00Z' }),
        listRuns: () => [{
          run_number: 7,
          response: {
            variant_id: 'v_black',
            variant_key: 'color:black',
            discovery_log: {
              urls_checked: ['https://sql-current.example/rdf'],
              queries_run: ['sql current rdf query'],
            },
          },
        }],
      },
    );
    const specDb = makeStubSpecDb({ finderStore: fs_.store });

    const preview = await compileReleaseDateFinderPreviewPrompt({
      product: { ...PRODUCT, product_id: pid },
      appDb: null, specDb, config: {}, productRoot: PRODUCT_ROOT,
      body: { variant_key: 'color:black' },
    });

    assert.equal(preview.inputs_resolved.previous_urls_count, 1);
    assert.equal(preview.inputs_resolved.previous_queries_count, 1);
    assert.match(preview.prompts[0].system, /sql-current\.example\/rdf/);
    assert.doesNotMatch(preview.prompts[0].system, /json-stale\.example\/rdf/);
  });

  it('loop mode labels iter-1 and includes the iteration disclaimer note', async () => {
    const pid = 'rdf-loop-note';
    writeProductJson(pid);
    const fs_ = makeStubFinderStore();
    const specDb = makeStubSpecDb({ finderStore: fs_.store });

    const preview = await compileReleaseDateFinderPreviewPrompt({
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
    const pid = 'rdf-404';
    writeProductJson(pid);
    const fs_ = makeStubFinderStore();
    const specDb = makeStubSpecDb({ finderStore: fs_.store });

    await assert.rejects(
      () => compileReleaseDateFinderPreviewPrompt({
        product: { ...PRODUCT, product_id: pid },
        appDb: null, specDb, config: {}, productRoot: PRODUCT_ROOT,
        body: { variant_key: 'does-not-exist' },
      }),
      (err) => err.statusCode === 404,
    );
  });
});
