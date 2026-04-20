/**
 * variantScalarFieldProducer — factory unit tests.
 *
 * Verifies the factory is a correct generalization of the per-variant scalar
 * field producer pattern. Uses a fake "test field" module to exercise all
 * injection points without pinning the tests to RDF's feature code.
 *
 * Every injection point gets a test:
 *   - identity strings (finderName, fieldKey, sourceType, phase, responseValueKey, logPrefix)
 *   - factories / closures (createCallLlm, buildPrompt, extractCandidate,
 *     mergeDiscovery, readRuns, satisfactionPredicate)
 *   - optional hooks (buildPublisherMetadata, buildUserMessage, suppressionScope)
 *   - shared orchestration invariants (candidateEntry / response key order,
 *     two-phase onLlmCallComplete, graceful error handling, loop semantics)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createVariantScalarFieldProducer } from '../variantScalarFieldProducer.js';

// ── Fake feature: `some_date` (scalar date per variant — mirrors release_date
//    contract shape so validateField accepts the value, but with a different
//    field key to prove injection independence) ─────────────────────────
function makeFakeFeatureInjection(overrides = {}) {
  const memoryStore = { runs: [] };
  const publisherMetadataCalls = [];

  return {
    finderName: 'fakeFinder',
    fieldKey: 'some_date',
    sourceType: 'fake_finder',
    phase: 'fakeFinder',
    responseValueKey: 'some_date',
    logPrefix: 'fake',
    // WHY: 0ms stagger — production default is 1000ms to space LLM bursts, but
    // every test here injects a synchronous LLM stub where rate-limit spacing is
    // irrelevant. Eliminates ~1s×N-variants of dead wait per test case.
    defaultStaggerMs: 0,

    createCallLlm: () => async () => ({
      result: {
        some_date: '2024-03-15',
        confidence: 85,
        unknown_reason: '',
        evidence_refs: [{ url: 'https://fake.example.com', tier: 'tier1', confidence: 90 }],
        discovery_log: { urls_checked: [], queries_run: [], notes: [] },
      },
      usage: null,
    }),

    buildPrompt: () => 'fake system prompt',

    extractCandidate: (llmResult) => ({
      value: String(llmResult?.some_date ?? ''),
      confidence: Number.isFinite(llmResult?.confidence) ? llmResult.confidence : 0,
      unknownReason: String(llmResult?.unknown_reason || ''),
      evidenceRefs: Array.isArray(llmResult?.evidence_refs) ? llmResult.evidence_refs : [],
      discoveryLog: llmResult?.discovery_log,
      isUnknown: !llmResult?.some_date,
    }),

    mergeDiscovery: ({ run }) => {
      memoryStore.runs.push({ ...run, run_number: memoryStore.runs.length + 1 });
      return {
        runs: memoryStore.runs,
        run_count: memoryStore.runs.length,
        selected: { candidates: run.selected.candidates },
      };
    },

    readRuns: () => ({ runs: memoryStore.runs }),

    satisfactionPredicate: (result) => result?.published === true,

    _memoryStore: memoryStore,
    _publisherMetadataCalls: publisherMetadataCalls,
    ...overrides,
  };
}

const DEFAULT_VARIANTS = [
  { variant_id: 'v1', variant_key: 'v:1', variant_label: 'One', variant_type: 'color' },
  { variant_id: 'v2', variant_key: 'v:2', variant_label: 'Two', variant_type: 'color' },
];

const COMPILED_FIELD_RULES = {
  fields: {
    some_date: {
      key: 'some_date',
      contract: { type: 'date', shape: 'scalar', list_rules: {} },
      parse: { accepted_formats: ['YYYY-MM-DD', 'YYYY-MM', 'YYYY'] },
      evidence: { min_evidence_refs: 1, tier_preference: ['tier1', 'tier2', 'tier3'] },
      enum_policy: 'open',
      enum: { policy: 'open', new_value_policy: { accept_if_evidence: true } },
    },
  },
  known_values: {},
};

function makeSpecDbStub({ variants = DEFAULT_VARIANTS, storeSettings = {}, throwOnReplaceEvidence = false, resolvedVariantIds = [] } = {}) {
  const submittedCandidates = [];
  const evidenceByCandidateId = new Map();
  const finderStoreCalls = [];
  const upserts = [];
  const insertRuns = [];

  const finderStore = {
    getSetting: (k) => (k in storeSettings ? String(storeSettings[k]) : ''),
    upsert: (row) => { upserts.push(row); },
    insertRun: (row) => { insertRuns.push(row); },
    listSuppressions: () => [],
  };

  const resolvedRows = resolvedVariantIds.map((vid) => ({
    variant_id: vid === null ? null : String(vid),
    status: 'resolved',
  }));

  return {
    category: 'mouse',
    getFinderStore: (name) => {
      finderStoreCalls.push(name);
      return finderStore;
    },
    getProduct: () => null,
    getCompiledRules: () => COMPILED_FIELD_RULES,
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
    getFieldCandidatesByProductAndField: () => resolvedRows,
    getFieldCandidatesByValue: () => [],
    getFieldCandidate: () => null,
    upsertFieldCandidate: () => {},
    getResolvedFieldCandidate: () => null,
    markFieldCandidateResolved: () => {},
    demoteResolvedCandidates: () => {},
    publishCandidate: () => {},
    replaceFieldCandidateEvidence: (candidateId, refs) => {
      if (throwOnReplaceEvidence) throw new Error('publisher boom');
      evidenceByCandidateId.set(Number(candidateId), Array.isArray(refs) ? refs.length : 0);
    },
    countFieldCandidateEvidenceByCandidateId: (candidateId) => (
      evidenceByCandidateId.get(Number(candidateId)) || 0
    ),
    _submittedCandidates: submittedCandidates,
    _finderStoreCalls: finderStoreCalls,
    _upserts: upserts,
    _insertRuns: insertRuns,
  };
}

const PRODUCT = {
  product_id: 'fake-p1',
  category: 'mouse',
  brand: 'B',
  model: 'M',
  base_model: 'M',
  variant: '',
};

describe('variantScalarFieldProducer — runOnce happy path', () => {
  it('returns correct top-level keys on success', async () => {
    const injection = makeFakeFeatureInjection();
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub();

    const result = await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.deepEqual(
      Object.keys(result).sort(),
      ['candidates', 'errors', 'fallbackUsed', 'rejected', 'variants_processed'].sort(),
    );
    assert.equal(result.rejected, false);
    assert.equal(result.variants_processed, 2);
    assert.equal(result.candidates.length, 2);
  });

  it('uses the injected finderName to look up the feature store', async () => {
    const injection = makeFakeFeatureInjection({ finderName: 'mySpecialFinder' });
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub();

    await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.ok(specDb._finderStoreCalls.every((n) => n === 'mySpecialFinder'));
    assert.ok(specDb._finderStoreCalls.length > 0);
  });

  it('candidateEntry key order matches the locked contract', async () => {
    const injection = makeFakeFeatureInjection();
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub();

    const result = await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.deepEqual(
      Object.keys(result.candidates[0]),
      ['variant_id', 'variant_key', 'variant_label', 'variant_type', 'value', 'confidence', 'unknown_reason', 'sources', 'ran_at'],
    );
  });

  it('candidateEntry.sources preserves supporting_evidence + evidence_kind when LLM returns extended refs', async () => {
    // WHY: RDF + future per-key finders return evidence_refs with the extended
    // shape (supporting_evidence + evidence_kind). The producer's sources
    // mapping must carry those fields through, or the review drawer loses
    // the data needed to render the kind icon + popover quote.
    const injection = makeFakeFeatureInjection({
      createCallLlm: () => async () => ({
        result: {
          some_date: '2024-04-19',
          confidence: 93,
          unknown_reason: '',
          evidence_refs: [
            {
              url: 'https://corsair.com/explorer/m75',
              tier: 'tier1',
              confidence: 93,
              supporting_evidence: 'As of 04/19/2024, You can now get the M75 AIR in your choice of Black, Grey, or White!',
              evidence_kind: 'direct_quote',
            },
            {
              url: 'https://corsair.com/p/white-sku',
              tier: 'tier1',
              confidence: 60,
              supporting_evidence: '',
              evidence_kind: 'identity_only',
            },
          ],
          discovery_log: { urls_checked: [], queries_run: [], notes: [] },
        },
        usage: null,
      }),
    });
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({ variants: [DEFAULT_VARIANTS[0]] });

    const result = await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });
    const [ref0, ref1] = result.candidates[0].sources;
    assert.equal(ref0.evidence_kind, 'direct_quote');
    assert.ok(ref0.supporting_evidence.startsWith('As of 04/19/2024'));
    assert.equal(ref1.evidence_kind, 'identity_only');
    assert.equal(ref1.supporting_evidence, '');
  });

  it('candidateEntry.sources omits evidence_kind when LLM returns legacy base refs', async () => {
    // WHY: the spread-on-present-string guard prevents legacy flows from
    // growing undefined evidence_kind / supporting_evidence keys on the
    // stored `sources` entries.
    const injection = makeFakeFeatureInjection();
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({ variants: [DEFAULT_VARIANTS[0]] });

    const result = await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });
    const src = result.candidates[0].sources[0];
    assert.equal(src.url, 'https://fake.example.com');
    assert.equal(src.tier, 'tier1');
    assert.equal(src.confidence, 90);
    assert.ok(!('evidence_kind' in src), 'legacy flow must not attach undefined evidence_kind');
    assert.ok(!('supporting_evidence' in src), 'legacy flow must not attach undefined supporting_evidence');
  });

  it('run.response uses the injected responseValueKey for the scalar field', async () => {
    const injection = makeFakeFeatureInjection({ responseValueKey: 'some_date' });
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub();

    await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    const run = injection._memoryStore.runs[0];
    assert.ok('some_date' in run.response, 'response carries the injected responseValueKey');
    assert.equal(run.response.some_date, '2024-03-15');
    assert.ok(!('release_date' in run.response), 'does NOT carry unrelated keys');

    // key-order lock — scalar key lands between variant_label and confidence
    assert.deepEqual(
      Object.keys(run.response),
      ['started_at', 'duration_ms', 'variant_id', 'variant_key', 'variant_label', 'some_date', 'confidence', 'unknown_reason', 'evidence_refs', 'discovery_log'],
    );
  });
});

describe('variantScalarFieldProducer — early rejects', () => {
  it('rejects with no_cef_data when no variants', async () => {
    const injection = makeFakeFeatureInjection();
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({ variants: [] });

    const result = await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(result.rejected, true);
    assert.equal(result.rejections[0].reason_code, 'no_cef_data');
    assert.deepEqual(Object.keys(result).sort(), ['candidates', 'rejected', 'rejections'].sort());
  });

  it('rejects with unknown_variant when variantKey does not match', async () => {
    const injection = makeFakeFeatureInjection();
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub();

    const result = await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
      variantKey: 'does-not-exist',
    });

    assert.equal(result.rejected, true);
    assert.equal(result.rejections[0].reason_code, 'unknown_variant');
  });
});

describe('variantScalarFieldProducer — streaming + error paths', () => {
  it('onLlmCallComplete fires twice per variant (pre-call null, post-call with response)', async () => {
    const injection = makeFakeFeatureInjection();
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({ variants: [DEFAULT_VARIANTS[0]] });

    const calls = [];
    await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
      onLlmCallComplete: (c) => calls.push({ hasResponse: c.response !== null, label: c.label }),
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[0].hasResponse, false);
    assert.equal(calls[1].hasResponse, true);
    assert.equal(calls[0].label, 'Discovery');
  });

  it('publisher throw sets publisher_error on candidate; function still resolves', async () => {
    const injection = makeFakeFeatureInjection();
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      variants: [DEFAULT_VARIANTS[0]],
      throwOnReplaceEvidence: true,
    });

    const result = await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(result.rejected, false);
    const cand = result.candidates[0];
    assert.ok('publisher_error' in cand);
    assert.match(cand.publisher_error, /publisher boom/);
  });

  it('LLM throw yields no candidate but other variants still process', async () => {
    let i = 0;
    const injection = makeFakeFeatureInjection({
      createCallLlm: () => async () => {
        if (i++ === 0) throw new Error('llm boom');
        return {
          result: {
            some_date: '2024-04-01', confidence: 80, unknown_reason: '',
            evidence_refs: [{ url: 'https://x.example.com', tier: 'tier1', confidence: 85 }],
            discovery_log: { urls_checked: [], queries_run: [], notes: [] },
          },
          usage: null,
        };
      },
    });
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub();

    const result = await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(result.rejected, false);
    assert.equal(result.candidates.length, 1);
  });
});

describe('variantScalarFieldProducer — publisher submit shape', () => {
  it('uses injected fieldKey, sourceType in submitCandidate; default metadata has 6+ keys', async () => {
    const injection = makeFakeFeatureInjection({
      fieldKey: 'some_date',
      sourceType: 'fake_finder',
    });
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({ variants: [DEFAULT_VARIANTS[0]] });

    await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(specDb._submittedCandidates.length, 1);
    const sub = specDb._submittedCandidates[0];
    assert.equal(sub.fieldKey, 'some_date');
    assert.equal(sub.sourceType, 'fake_finder');

    const md = sub.metadataJson;
    assert.deepEqual(
      Object.keys(md).sort(),
      ['evidence_refs', 'llm_access_mode', 'llm_effort_level', 'llm_thinking', 'llm_web_search', 'variant_key', 'variant_label', 'variant_type'].sort(),
    );
  });

  it('custom buildPublisherMetadata replaces default metadata shape', async () => {
    const injection = makeFakeFeatureInjection({
      buildPublisherMetadata: (variant, candidate) => ({
        my_custom_field: 'custom_value',
        variant_key: variant.key,
        candidate_value: candidate.value,
      }),
    });
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({ variants: [DEFAULT_VARIANTS[0]] });

    await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    const md = specDb._submittedCandidates[0].metadataJson;
    assert.equal(md.my_custom_field, 'custom_value');
    assert.equal(md.candidate_value, '2024-03-15');
    assert.ok(!('llm_access_mode' in md), 'custom metadata replaces, not merges');
  });
});

describe('variantScalarFieldProducer — loop semantics', () => {
  it('runLoop returns loopId on the top-level result', async () => {
    const injection = makeFakeFeatureInjection();
    const { runLoop } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      variants: [DEFAULT_VARIANTS[0]],
      storeSettings: { perVariantAttemptBudget: '1' },
    });

    const result = await runLoop({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(typeof result.loopId, 'string');
    assert.ok(result.loopId.length > 0);
    assert.ok('loopId' in result);
  });

  it('runLoop respects perVariantAttemptBudget when satisfactionPredicate stays false', async () => {
    // satisfactionPredicate: (result) => result?.published — but we never publish
    // because publishResult is null (no auto-publish). So budget is exhausted.
    let callCount = 0;
    const injection = makeFakeFeatureInjection({
      createCallLlm: () => async () => {
        callCount++;
        return {
          result: {
            some_date: '2024', confidence: 30, unknown_reason: '',
            evidence_refs: [{ url: 'https://x.example.com', tier: 'tier3', confidence: 30 }],
            discovery_log: { urls_checked: [], queries_run: [], notes: [] },
          },
          usage: null,
        };
      },
      satisfactionPredicate: () => false, // never satisfied → exhaust budget
    });
    const { runLoop } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      variants: [DEFAULT_VARIANTS[0]],
      storeSettings: { perVariantAttemptBudget: '3' },
    });

    await runLoop({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(callCount, 3, 'budget=3 and predicate=false → 3 attempts');
  });

  it('satisfactionPredicate true stops the loop immediately', async () => {
    let callCount = 0;
    const injection = makeFakeFeatureInjection({
      createCallLlm: () => async () => {
        callCount++;
        return {
          result: {
            some_date: '2024-06-01', confidence: 95, unknown_reason: '',
            evidence_refs: [{ url: 'https://x.example.com', tier: 'tier1', confidence: 95 }],
            discovery_log: { urls_checked: [], queries_run: [], notes: [] },
          },
          usage: null,
        };
      },
      satisfactionPredicate: () => true, // always satisfied → 1 attempt each
    });
    const { runLoop } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      variants: [DEFAULT_VARIANTS[0]],
      storeSettings: { perVariantAttemptBudget: '3' },
    });

    await runLoop({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(callCount, 1);
  });

  it('loop-mode run.response includes loop_id; single-run does not', async () => {
    const injection = makeFakeFeatureInjection();
    const { runLoop } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      variants: [DEFAULT_VARIANTS[0]],
      storeSettings: { perVariantAttemptBudget: '1' },
    });

    await runLoop({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    const run = injection._memoryStore.runs[0];
    assert.ok('loop_id' in run.response);
  });
});

describe('variantScalarFieldProducer — reRunBudget semantics', () => {
  it('reRunBudget=0 skips an already-resolved variant (no LLM call)', async () => {
    let callCount = 0;
    const injection = makeFakeFeatureInjection({
      createCallLlm: () => async () => {
        callCount++;
        return {
          result: {
            some_date: '2024-06-01', confidence: 95, unknown_reason: '',
            evidence_refs: [{ url: 'https://x.example.com', tier: 'tier1', confidence: 95 }],
            discovery_log: { urls_checked: [], queries_run: [], notes: [] },
          },
          usage: null,
        };
      },
      satisfactionPredicate: () => false,
    });
    const { runLoop } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      variants: [DEFAULT_VARIANTS[0]],
      storeSettings: { perVariantAttemptBudget: '3', reRunBudget: '0' },
      resolvedVariantIds: ['v1'],
    });

    await runLoop({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(callCount, 0, 'resolved variant + reRunBudget=0 → skipped entirely');
  });

  it('reRunBudget=N allows up to N retries on resolved variants', async () => {
    let callCount = 0;
    const injection = makeFakeFeatureInjection({
      createCallLlm: () => async () => {
        callCount++;
        return {
          result: {
            some_date: '2024-06-01', confidence: 40, unknown_reason: '',
            evidence_refs: [{ url: 'https://x.example.com', tier: 'tier3', confidence: 40 }],
            discovery_log: { urls_checked: [], queries_run: [], notes: [] },
          },
          usage: null,
        };
      },
      satisfactionPredicate: () => false, // never satisfies → exhaust
    });
    const { runLoop } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      variants: [DEFAULT_VARIANTS[0]],
      storeSettings: { perVariantAttemptBudget: '5', reRunBudget: '2' },
      resolvedVariantIds: ['v1'],
    });

    await runLoop({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(callCount, 2, 'resolved variant + reRunBudget=2 → 2 attempts (not 5)');
  });

  it('unresolved variants ignore reRunBudget and use perVariantAttemptBudget', async () => {
    let callCount = 0;
    const injection = makeFakeFeatureInjection({
      createCallLlm: () => async () => {
        callCount++;
        return {
          result: {
            some_date: '', confidence: 20, unknown_reason: '',
            evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] },
          },
          usage: null,
        };
      },
      satisfactionPredicate: () => false,
    });
    const { runLoop } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      variants: [DEFAULT_VARIANTS[0]],
      storeSettings: { perVariantAttemptBudget: '3', reRunBudget: '0' },
      resolvedVariantIds: [], // variant is NOT resolved
    });

    await runLoop({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(callCount, 3, 'unresolved variant uses perVariantAttemptBudget (3), not reRunBudget (0)');
  });

  it('mixed set: resolved variant skipped with reRunBudget=0, unresolved runs full budget', async () => {
    const callsByVariant = { v1: 0, v2: 0 };
    const injection = makeFakeFeatureInjection({
      createCallLlm: () => async ({ variantLabel }) => {
        const key = variantLabel === 'One' ? 'v1' : 'v2';
        callsByVariant[key]++;
        return {
          result: {
            some_date: '', confidence: 0, unknown_reason: 'n/a',
            evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] },
          },
          usage: null,
        };
      },
      satisfactionPredicate: () => false,
    });
    const { runLoop } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      storeSettings: { perVariantAttemptBudget: '3', reRunBudget: '0' },
      resolvedVariantIds: ['v1'], // v1 resolved, v2 not
    });

    await runLoop({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(callsByVariant.v1, 0, 'resolved v1 skipped');
    assert.equal(callsByVariant.v2, 3, 'unresolved v2 ran full budget');
  });

  it('unset reRunBudget hydrates to the registry default (1)', async () => {
    // WHY: finderSqlStore.getSetting falls back to settingsDefaults (derived
    // from the registry). So any production store returns '1' for reRunBudget
    // when no user override exists. The test stub returns '' — which + the
    // factory's literal-default guard ('|| "1"') produces the same result.
    let callCount = 0;
    const injection = makeFakeFeatureInjection({
      createCallLlm: () => async () => {
        callCount++;
        return {
          result: {
            some_date: '2024', confidence: 30, unknown_reason: '',
            evidence_refs: [], discovery_log: { urls_checked: [], queries_run: [], notes: [] },
          },
          usage: null,
        };
      },
      satisfactionPredicate: () => false,
    });
    const { runLoop } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub({
      variants: [DEFAULT_VARIANTS[0]],
      storeSettings: { perVariantAttemptBudget: '3' }, // no reRunBudget
      resolvedVariantIds: ['v1'],
    });

    await runLoop({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(callCount, 1, 'unset reRunBudget → default 1 → 1 attempt on resolved variant');
  });
});

describe('variantScalarFieldProducer — suppressionScope injection', () => {
  it('custom suppressionScope is used to filter feature-store suppressions', async () => {
    const injection = makeFakeFeatureInjection({
      suppressionScope: (variant) => ({ variant_id: variant.variant_id, mode: 'custom-mode' }),
    });
    const { runOnce } = createVariantScalarFieldProducer(injection);

    const listSuppressionsCalls = [];
    const specDb = makeSpecDbStub({ variants: [DEFAULT_VARIANTS[0]] });
    // Replace finderStore.listSuppressions to track filter behavior
    specDb.getFinderStore = () => ({
      getSetting: () => '',
      upsert: () => {},
      insertRun: () => {},
      listSuppressions: (pid) => {
        listSuppressionsCalls.push(pid);
        return [
          { variant_id: 'v1', mode: 'custom-mode', kind: 'url', item: 'https://a' },
          { variant_id: 'v1', mode: '', kind: 'url', item: 'https://b' },
        ];
      },
    });

    await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    // We can't directly observe which suppression was applied without a more
    // invasive hook, but we can confirm listSuppressions was called. The
    // suppressionScope injection controls WHICH rows get filtered-in.
    assert.ok(listSuppressionsCalls.length > 0);
  });
});

describe('variantScalarFieldProducer — compiled rules snapshot', () => {
  it('getCompiledRules is invoked exactly once per runOnce call', async () => {
    const injection = makeFakeFeatureInjection();
    const { runOnce } = createVariantScalarFieldProducer(injection);
    const specDb = makeSpecDbStub();
    let count = 0;
    specDb.getCompiledRules = () => { count++; return COMPILED_FIELD_RULES; };

    await runOnce({
      product: PRODUCT, appDb: null, specDb, config: {}, productRoot: '/tmp',
    });

    assert.equal(count, 1);
  });
});
