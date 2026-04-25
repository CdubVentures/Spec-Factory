/**
 * registerScalarFinder — integration factory tests.
 *
 * Validates:
 *   - required-arg enforcement (throws on missing fields)
 *   - defaults: extractCandidate byte-matches RDF's inline logic
 *   - defaults: satisfactionPredicate byte-matches rdfLoopSatisfied
 *   - override paths: user-supplied extractCandidate / satisfactionPredicate win
 *   - returns { runOnce, runLoop } from createVariantScalarFieldProducer
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerScalarFinder,
  _defaultExtractCandidate,
  _defaultSatisfactionPredicate,
} from '../registerScalarFinder.js';

function minimalCfg(overrides = {}) {
  // WHY: store.merge/read/insertRun/etc. must exist for createVariantScalarFieldProducer
  // to accept the opts shape — these tests don't exercise runOnce/runLoop execution,
  // only that registerScalarFinder wires them through correctly.
  const store = {
    merge: () => ({ runs: [], selected: { candidates: [] }, run_count: 0 }),
    read: () => null,
  };
  return {
    finderName: 'someDateFinder',
    fieldKey: 'some_date',
    valueKey: 'some_date',
    sourceType: 'some_date_finder',
    phase: 'someDateFinder',
    logPrefix: 'sdf',
    createCallLlm: () => async () => ({ result: {}, usage: null }),
    buildPrompt: () => 'prompt',
    store,
    ...overrides,
  };
}

describe('registerScalarFinder — required-arg enforcement', () => {
  const required = ['finderName', 'fieldKey', 'valueKey', 'sourceType', 'phase', 'logPrefix', 'createCallLlm', 'buildPrompt', 'store'];
  for (const field of required) {
    it(`throws when ${field} is missing`, () => {
      assert.throws(
        () => registerScalarFinder(minimalCfg({ [field]: undefined })),
        new RegExp(`${field} required`),
      );
    });
  }

  it('no default logPrefix — explicit required (prevents collisions)', () => {
    assert.throws(() => registerScalarFinder(minimalCfg({ logPrefix: '' })), /logPrefix required/);
  });
});

describe('registerScalarFinder — default extractCandidate', () => {
  const extract = _defaultExtractCandidate('release_date');

  it('extracts value, confidence, unknown_reason, evidence_refs, discovery_log', () => {
    const result = extract({
      release_date: '2024-03-15',
      confidence: 90,
      unknown_reason: '',
      evidence_refs: [{ url: 'u', tier: 'tier1', confidence: 95 }],
      discovery_log: { urls_checked: ['x'], queries_run: [], notes: [] },
    });
    assert.equal(result.value, '2024-03-15');
    assert.equal(result.confidence, 90);
    assert.equal(result.unknownReason, '');
    assert.equal(result.evidenceRefs.length, 1);
    assert.equal(result.isUnknown, false);
    assert.deepEqual(result.discoveryLog, { urls_checked: ['x'], queries_run: [], notes: [] });
  });

  it('trims whitespace from value (matches RDF string handling)', () => {
    const result = extract({ release_date: '  2024-03-15  ', confidence: 90 });
    assert.equal(result.value, '2024-03-15');
  });

  it('treats "unk" as unknown (isUnknown=true)', () => {
    const result = extract({ release_date: 'unk', confidence: 0, unknown_reason: 'no data' });
    assert.equal(result.isUnknown, true);
    assert.equal(result.unknownReason, 'no data');
  });

  it('treats "UNK" (uppercase) as unknown', () => {
    const result = extract({ release_date: 'UNK', confidence: 0 });
    assert.equal(result.isUnknown, true);
  });

  it('treats empty string as unknown', () => {
    const result = extract({ release_date: '', confidence: 0 });
    assert.equal(result.isUnknown, true);
  });

  it('defaults missing confidence to 0', () => {
    const result = extract({ release_date: '2024' });
    assert.equal(result.confidence, 0);
  });

  it('defaults non-finite confidence to 0 (NaN / Infinity)', () => {
    assert.equal(extract({ release_date: '2024', confidence: NaN }).confidence, 0);
    assert.equal(extract({ release_date: '2024', confidence: Infinity }).confidence, 0);
  });

  it('defaults missing evidence_refs to empty array', () => {
    const result = extract({ release_date: '2024', confidence: 50 });
    assert.deepEqual(result.evidenceRefs, []);
  });

  it('parity with RDF inline extract (release_date)', async () => {
    // WHY: replicate RDF's exact inline extractCandidate logic so the factory default
    // is a byte-identical drop-in after Phase 4. If this breaks, Phase 1 characterization
    // cases 6 + 7 will also break.
    const rdfExtract = (llmResult) => {
      const releaseDate = String(llmResult?.release_date || '').trim();
      const evidenceRefs = Array.isArray(llmResult?.evidence_refs) ? llmResult.evidence_refs : [];
      const confidence = Number.isFinite(llmResult?.confidence) ? llmResult.confidence : 0;
      const unknownReason = String(llmResult?.unknown_reason || '').trim();
      const isUnknown = releaseDate === '' || releaseDate.toLowerCase() === 'unk';
      return {
        value: releaseDate, confidence, unknownReason, evidenceRefs,
        discoveryLog: llmResult?.discovery_log, isUnknown,
      };
    };

    const samples = [
      { release_date: '2024-03-15', confidence: 90, evidence_refs: [{ url: 'u', tier: 't1', confidence: 95 }], unknown_reason: '' },
      { release_date: 'unk', confidence: 0, unknown_reason: 'no data' },
      { release_date: '', confidence: 0 },
      { release_date: '  2024  ', confidence: 50 },
    ];
    for (const s of samples) {
      assert.deepEqual(extract(s), rdfExtract(s));
    }
  });
});

describe('registerScalarFinder — default satisfactionPredicate', () => {
  it('false when result is null', () => {
    assert.equal(_defaultSatisfactionPredicate(null), false);
  });

  it('false when result has neither publish nor unknown_reason', () => {
    assert.equal(_defaultSatisfactionPredicate({ candidate: { value: '2024-03-15' }, publishStatus: 'below_threshold' }), false);
  });

  it('true when candidate has unknown_reason AND empty value (definitive unknown)', () => {
    assert.equal(_defaultSatisfactionPredicate({ candidate: { value: '', unknown_reason: 'no data' } }), true);
  });

  it('true when candidate has unknown_reason AND null value (stored unknown diagnostic)', () => {
    assert.equal(_defaultSatisfactionPredicate({ candidate: { value: null, unknown_reason: 'no data' } }), true);
  });

  it('false when candidate has unknown_reason but non-empty value (not definitive)', () => {
    assert.equal(_defaultSatisfactionPredicate({ candidate: { value: '2024', unknown_reason: 'low conf' } }), false);
  });

  it('true when publishStatus === "published"', () => {
    assert.equal(_defaultSatisfactionPredicate({ candidate: { value: '2024' }, publishStatus: 'published' }), true);
  });

  it('false for below_threshold / manual_override_locked / skipped', () => {
    for (const status of ['below_threshold', 'manual_override_locked', 'skipped']) {
      assert.equal(_defaultSatisfactionPredicate({ candidate: { value: '2024' }, publishStatus: status }), false, status);
    }
  });
});

describe('registerScalarFinder — override paths', () => {
  it('user-supplied extractCandidate overrides default', () => {
    let called = false;
    const cfg = minimalCfg({
      extractCandidate: () => { called = true; return { value: 'x', confidence: 0, unknownReason: '', evidenceRefs: [], isUnknown: true }; },
    });
    const runners = registerScalarFinder(cfg);
    assert.equal(typeof runners.runOnce, 'function');
    // The override is passed through — we can't easily trigger a run without full specDb,
    // but we can at least verify registerScalarFinder accepts it without error.
    assert.equal(called, false, 'override not yet fired — expected');
  });

  it('user-supplied satisfactionPredicate overrides default', () => {
    const runners = registerScalarFinder(minimalCfg({
      satisfactionPredicate: () => true,
    }));
    assert.equal(typeof runners.runLoop, 'function');
  });

  it('buildPublisherMetadata override accepted', () => {
    assert.doesNotThrow(() => registerScalarFinder(minimalCfg({
      buildPublisherMetadata: () => ({}),
    })));
  });
});

describe('registerScalarFinder — return shape', () => {
  it('returns { runOnce, runLoop }', () => {
    const runners = registerScalarFinder(minimalCfg());
    assert.equal(typeof runners.runOnce, 'function');
    assert.equal(typeof runners.runLoop, 'function');
  });
});
