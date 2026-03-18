import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stableSerialize,
  valueToken,
  hasKnownValue,
  clamp01,
  normalizeSourceToken,
  sourceLabelFromToken,
  sourceMethodFromToken,
  candidateSourceToken,
  ensureCandidateShape,
  buildSyntheticSelectedCandidate,
  sortCandidatesByScore,
  ensureTrackedStateCandidateInvariant,
  ensureEnumValueCandidateInvariant,
  isSharedLanePending,
  toSpecDbCandidate,
  appendAllSpecDbCandidates,
  hasActionableCandidate,
  shouldIncludeEnumValueEntry,
  normalizeCandidateSharedReviewStatus,
  reviewStatusToken,
  isReviewItemCandidateVisible,
} from '../src/review/candidateInfrastructure.js';

// ── valueToken / hasKnownValue ──────────────────────────────────────

test('valueToken normalizes scalars and objects', () => {
  assert.equal(valueToken(null), '');
  assert.equal(valueToken(undefined), '');
  assert.equal(valueToken('Hello'), 'hello');
  assert.equal(valueToken(42), '42');
  assert.equal(valueToken(true), 'true');
  assert.equal(valueToken({ b: 2, a: 1 }), '{a:1,b:2}');
  assert.equal(valueToken([3, 1]), '[3,1]');
});

test('hasKnownValue rejects unknowns', () => {
  const unknowns = [null, undefined, '', 'unk', 'unknown', 'n/a', 'null', 'UNK', 'Unknown', 'N/A'];
  for (const v of unknowns) {
    assert.equal(hasKnownValue(v), false, `hasKnownValue(${JSON.stringify(v)}) should be false`);
  }
  assert.equal(hasKnownValue('real'), true);
  assert.equal(hasKnownValue(0), true);
  assert.equal(hasKnownValue(false), true);
});

// ── clamp01 ─────────────────────────────────────────────────────────

test('clamp01 clamps to [0,1] with fallback', () => {
  assert.equal(clamp01(0.5), 0.5);
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01('0.7'), 0.7);
  assert.equal(clamp01(null, 0.3), 0.3);
  assert.equal(clamp01('bad', 0.4), 0.4);
  assert.equal(clamp01(undefined), 0);
});

// ── normalizeSourceToken ────────────────────────────────────────────

test('normalizeSourceToken maps source aliases', () => {
  const cases = [
    ['component_db', 'reference'],
    ['known_values', 'reference'],
    ['reference', 'reference'],
    ['pipeline', 'pipeline'],
    ['pipeline_extraction', 'pipeline'],
    ['specdb', 'specdb'],
    ['manual', 'user'],
    ['user', 'user'],
    ['', ''],
    [null, ''],
    ['other', 'other'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(normalizeSourceToken(input), expected, `normalizeSourceToken(${JSON.stringify(input)})`);
  }
});

test('sourceLabelFromToken returns display labels', () => {
  assert.equal(sourceLabelFromToken('reference'), 'Reference');
  assert.equal(sourceLabelFromToken('pipeline'), 'Pipeline');
  assert.equal(sourceLabelFromToken('pipeline', 'Custom'), 'Custom');
  assert.equal(sourceLabelFromToken('specdb'), 'SpecDb');
  assert.equal(sourceLabelFromToken('user'), 'user');
});

test('sourceMethodFromToken returns method strings', () => {
  assert.equal(sourceMethodFromToken('reference'), 'reference_data');
  assert.equal(sourceMethodFromToken('pipeline'), 'pipeline_extraction');
  assert.equal(sourceMethodFromToken('specdb'), 'specdb_lookup');
  assert.equal(sourceMethodFromToken('user'), 'manual_override');
  assert.equal(sourceMethodFromToken('other', 'fallback'), 'fallback');
});

// ── ensureTrackedStateCandidateInvariant (golden-master) ────────────

test('ensureTrackedStateCandidateInvariant mutates state with candidates', () => {
  const state = {
    source: 'pipeline',
    selected: { value: 'Pixart 3950', confidence: 0.8 },
    accepted_candidate_id: '',
    candidates: [
      { candidate_id: 'c1', value: 'Pixart 3950', score: 0.9, source_id: 'pipeline' },
    ],
    reason_codes: [],
  };

  ensureTrackedStateCandidateInvariant(state, { fallbackCandidateId: 'test' });

  assert.equal(state.candidates.length >= 1, true);
  assert.equal(state.candidate_count, state.candidates.length);
  assert.equal(state.selected.value, 'Pixart 3950');
  assert.equal(typeof state.selected.confidence, 'number');
  assert.equal(typeof state.selected.color, 'string');
});

test('ensureTrackedStateCandidateInvariant synthesizes missing accepted candidate', () => {
  const state = {
    source: 'pipeline',
    selected: { value: 'test-value', confidence: 0.7 },
    accepted_candidate_id: 'missing-id',
    candidates: [],
    reason_codes: [],
  };

  ensureTrackedStateCandidateInvariant(state, { fallbackCandidateId: 'fb' });

  const synth = state.candidates.find((c) => c.candidate_id === 'missing-id');
  assert.ok(synth, 'should synthesize accepted candidate');
  assert.equal(synth.is_synthetic_selected, true);
});

test('ensureTrackedStateCandidateInvariant user-driven path preserves selected', () => {
  const state = {
    source: 'user',
    overridden: true,
    selected: { value: 'manual-val', confidence: 0.9 },
    candidates: [
      { candidate_id: 'c1', value: 'manual-val', score: 0.9, source_id: 'user' },
    ],
    reason_codes: [],
  };

  ensureTrackedStateCandidateInvariant(state, { fallbackCandidateId: 'u' });
  assert.equal(state.selected.value, 'manual-val');
  assert.equal(typeof state.selected.color, 'string');
});

test('ensureTrackedStateCandidateInvariant is no-op for non-object', () => {
  ensureTrackedStateCandidateInvariant(null);
  ensureTrackedStateCandidateInvariant(undefined);
  ensureTrackedStateCandidateInvariant('string');
});

// ── ensureEnumValueCandidateInvariant (golden-master) ───────────────

test('ensureEnumValueCandidateInvariant mutates entry with candidates', () => {
  const entry = {
    value: 'wireless',
    source: 'pipeline',
    confidence: 0.6,
    candidates: [
      { candidate_id: 'e1', value: 'wireless', score: 0.8, source_id: 'pipeline' },
    ],
    needs_review: false,
  };

  ensureEnumValueCandidateInvariant(entry, { fieldKey: 'connection' });

  assert.equal(entry.candidates.length >= 1, true);
  assert.equal(typeof entry.confidence, 'number');
  assert.equal(typeof entry.color, 'string');
  assert.equal(entry.value, 'wireless');
});

test('ensureEnumValueCandidateInvariant user-driven path', () => {
  const entry = {
    value: 'manual-enum',
    source: 'user',
    overridden: true,
    confidence: 0.95,
    candidates: [],
    needs_review: true,
  };

  ensureEnumValueCandidateInvariant(entry, { fieldKey: 'shape' });
  assert.equal(entry.value, 'manual-enum');
  assert.equal(typeof entry.color, 'string');
});

test('ensureEnumValueCandidateInvariant is no-op for non-object', () => {
  ensureEnumValueCandidateInvariant(null);
  ensureEnumValueCandidateInvariant(undefined);
});

// ── isSharedLanePending ─────────────────────────────────────────────

test('isSharedLanePending returns expected states', () => {
  assert.equal(isSharedLanePending({ user_override_ai_shared: true }, true), false);
  assert.equal(isSharedLanePending({ ai_confirm_shared_status: 'confirmed' }), false);
  assert.equal(isSharedLanePending({ ai_confirm_shared_status: 'pending' }), true);
  assert.equal(isSharedLanePending({}, true), true);
  assert.equal(isSharedLanePending({}, false), false);
});

// ── toSpecDbCandidate ───────────────────────────────────────────────

test('toSpecDbCandidate builds candidate from row', () => {
  const row = { candidate_id: 'sdb1', value: 'PAW3950', score: 0.9, source_host: 'techpowerup.com', product_id: 'p1' };
  const candidate = toSpecDbCandidate(row, 'fallback');
  assert.equal(candidate.candidate_id, 'sdb1');
  assert.equal(candidate.value, 'PAW3950');
  assert.equal(candidate.source_id, 'specdb');
  assert.equal(candidate.source, 'techpowerup.com (p1)');
});

test('toSpecDbCandidate uses fallback id', () => {
  const candidate = toSpecDbCandidate({ value: 'x' }, 'fb');
  assert.equal(candidate.candidate_id, 'fb');
});

// ── appendAllSpecDbCandidates ───────────────────────────────────────

test('appendAllSpecDbCandidates deduplicates and skips empty values', () => {
  const target = [{ candidate_id: 'existing', value: 'a' }];
  const rows = [
    { candidate_id: 'existing', value: 'b' },
    { value: 'new-val' },
    { value: '' },
    { value: null },
  ];
  appendAllSpecDbCandidates(target, rows, 'prefix');
  assert.equal(target.length, 2);
  assert.equal(target[1].value, 'new-val');
});

// ── normalizeCandidateSharedReviewStatus ─────────────────────────────

test('normalizeCandidateSharedReviewStatus handles synthetic, review rows, and source tokens', () => {
  assert.equal(normalizeCandidateSharedReviewStatus({ is_synthetic_selected: true }), 'accepted');
  assert.equal(normalizeCandidateSharedReviewStatus({}, { ai_review_status: 'accepted' }), 'accepted');
  assert.equal(normalizeCandidateSharedReviewStatus({}, { ai_review_status: 'rejected' }), 'rejected');
  assert.equal(normalizeCandidateSharedReviewStatus({}, { ai_review_status: 'pending' }), 'pending');
  assert.equal(
    normalizeCandidateSharedReviewStatus({}, { ai_review_status: 'accepted', ai_reason: 'shared_accept' }),
    'pending'
  );
  assert.equal(normalizeCandidateSharedReviewStatus({ source_id: 'reference' }), 'accepted');
  assert.equal(normalizeCandidateSharedReviewStatus({ source_id: 'pipeline' }), 'pending');
});

// ── reviewStatusToken / isReviewItemCandidateVisible ─────────────────

test('isReviewItemCandidateVisible hides dismissed/ignored/rejected', () => {
  assert.equal(isReviewItemCandidateVisible({}), true);
  assert.equal(isReviewItemCandidateVisible({ status: 'confirmed' }), true);
  assert.equal(isReviewItemCandidateVisible({ status: 'dismissed' }), false);
  assert.equal(isReviewItemCandidateVisible({ status: 'ignored' }), false);
  assert.equal(isReviewItemCandidateVisible({ status: 'rejected' }), false);
});

// ── hasActionableCandidate ──────────────────────────────────────────

test('hasActionableCandidate requires non-synthetic with known value', () => {
  assert.equal(hasActionableCandidate([]), false);
  assert.equal(hasActionableCandidate([{ candidate_id: 'c1', value: 'x' }]), true);
  assert.equal(hasActionableCandidate([{ candidate_id: 'c1', value: 'x', is_synthetic_selected: true }]), false);
  assert.equal(hasActionableCandidate([{ candidate_id: '', value: 'x' }]), false);
  assert.equal(hasActionableCandidate([{ candidate_id: 'c1', value: 'unknown' }]), false);
});

// ── shouldIncludeEnumValueEntry ─────────────────────────────────────

test('shouldIncludeEnumValueEntry filters unlinked pipeline pending entries', () => {
  assert.equal(shouldIncludeEnumValueEntry(null), false);
  assert.equal(shouldIncludeEnumValueEntry({ value: 'x' }), true);
  assert.equal(shouldIncludeEnumValueEntry(
    { source: 'pipeline', needs_review: true, candidates: [{ candidate_id: 'c', value: 'v' }], linked_products: [] },
    { requireLinkedPendingPipeline: true }
  ), false);
  assert.equal(shouldIncludeEnumValueEntry(
    { source: 'pipeline', needs_review: true, candidates: [{ candidate_id: 'c', value: 'v' }], linked_products: ['p1'] },
    { requireLinkedPendingPipeline: true }
  ), true);
});
