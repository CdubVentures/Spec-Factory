import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateEnumCandidate,
  applyEnumSharedLaneState,
  applyEnumSharedLaneWithResolvedConfidence,
  upsertEnumListValueAndFetch,
  resolveEnumPreAffectedProductIds,
  sanitizeExistingAcceptedCandidateId,
  resolveEnumRequiredCandidate,
  applyEnumSuggestionStatusByAction,
} from '../src/features/review/api/enumMutationRoutes.js';

import {
  normalizeEnumToken,
  hasMeaningfulEnumValue,
  dedupeEnumValues,
  readEnumConsistencyFormatHint,
} from '../src/features/review/api/reviewRoutes.js';

// --- validateEnumCandidate ---

test('validateEnumCandidate returns mismatch when field_key differs', () => {
  const result = validateEnumCandidate({
    candidateRow: { field_key: 'sensor', value: 'PAW3950' },
    candidateId: 'c1',
    field: 'connection',
    resolvedValue: '2.4GHz',
    isMeaningfulValue: () => true,
    normalizeLower: (v) => v.toLowerCase(),
    valueMismatchMessage: 'mismatch',
  });
  assert.equal(result.error, 'candidate_context_mismatch');
});

test('validateEnumCandidate returns value mismatch when values differ', () => {
  const result = validateEnumCandidate({
    candidateRow: { field_key: 'connection', value: 'USB' },
    candidateId: 'c1',
    field: 'connection',
    resolvedValue: '2.4GHz',
    isMeaningfulValue: () => true,
    normalizeLower: (v) => v.toLowerCase(),
    valueMismatchMessage: 'values differ',
  });
  assert.equal(result.error, 'candidate_value_mismatch');
});

test('validateEnumCandidate allows mismatch when allowValueMismatch is true', () => {
  const result = validateEnumCandidate({
    candidateRow: { field_key: 'connection', value: 'USB' },
    candidateId: 'c1',
    field: 'connection',
    resolvedValue: '2.4GHz',
    isMeaningfulValue: () => true,
    normalizeLower: (v) => v.toLowerCase(),
    valueMismatchMessage: 'values differ',
    allowValueMismatch: true,
  });
  assert.equal(result, null);
});

test('validateEnumCandidate returns null when values match', () => {
  const result = validateEnumCandidate({
    candidateRow: { field_key: 'connection', value: '2.4GHz' },
    candidateId: 'c1',
    field: 'connection',
    resolvedValue: '2.4GHz',
    isMeaningfulValue: () => true,
    normalizeLower: (v) => v.toLowerCase(),
    valueMismatchMessage: 'mismatch',
  });
  assert.equal(result, null);
});

// --- applyEnumSharedLaneState ---

test('applyEnumSharedLaneState delegates to applySharedLaneState with enum_key target', () => {
  const calls = {};
  applyEnumSharedLaneState({
    runtimeSpecDb: {},
    applySharedLaneState: (args) => { calls.lane = args; return { id: 1 }; },
    category: 'mouse',
    field: 'connection',
    normalizedValue: '2.4ghz',
    listValueRow: { id: 10, list_id: 3 },
    selectedCandidateId: 'c1',
    selectedValue: '2.4GHz',
    confidenceScore: 0.95,
    laneAction: 'accept',
    nowIso: '2026-01-01T00:00:00Z',
  });
  assert.equal(calls.lane.targetKind, 'enum_key');
  assert.equal(calls.lane.fieldKey, 'connection');
  assert.equal(calls.lane.enumValueNorm, '2.4ghz');
  assert.equal(calls.lane.listValueId, 10);
  assert.equal(calls.lane.enumListId, 3);
  assert.equal(calls.lane.laneAction, 'accept');
});

test('applyEnumSharedLaneState handles null listValueRow', () => {
  const calls = {};
  applyEnumSharedLaneState({
    runtimeSpecDb: {},
    applySharedLaneState: (args) => { calls.lane = args; },
    category: 'mouse',
    field: 'connection',
    normalizedValue: '2.4ghz',
    listValueRow: null,
    selectedCandidateId: null,
    selectedValue: '2.4GHz',
    confidenceScore: 1.0,
    laneAction: 'confirm',
    nowIso: '2026-01-01T00:00:00Z',
  });
  assert.equal(calls.lane.listValueId, null);
  assert.equal(calls.lane.enumListId, null);
});

// --- applyEnumSharedLaneWithResolvedConfidence ---

test('applyEnumSharedLaneWithResolvedConfidence resolves confidence from candidate', () => {
  const calls = {};
  applyEnumSharedLaneWithResolvedConfidence({
    runtimeSpecDb: { getCandidateById: () => ({ score: 0.88 }) },
    applySharedLaneState: (args) => { calls.lane = args; },
    category: 'mouse',
    field: 'connection',
    normalizedValue: '2.4ghz',
    listValueRow: { id: 10, list_id: 3 },
    selectedCandidateId: 'c1',
    selectedValue: '2.4GHz',
    laneAction: 'accept',
    nowIso: '2026-01-01T00:00:00Z',
  });
  assert.equal(calls.lane.confidenceScore, 0.88);
});

test('applyEnumSharedLaneWithResolvedConfidence uses fallback when no candidate', () => {
  const calls = {};
  applyEnumSharedLaneWithResolvedConfidence({
    runtimeSpecDb: { getCandidateById: () => null },
    applySharedLaneState: (args) => { calls.lane = args; },
    category: 'mouse',
    field: 'connection',
    normalizedValue: '2.4ghz',
    listValueRow: { id: 10, list_id: 3 },
    selectedCandidateId: null,
    selectedValue: '2.4GHz',
    laneAction: 'accept',
    nowIso: '2026-01-01T00:00:00Z',
    fallbackConfidence: 0.5,
  });
  assert.equal(calls.lane.confidenceScore, 0.5);
});

// --- upsertEnumListValueAndFetch ---

test('upsertEnumListValueAndFetch calls upsertListValue and returns fetched row', () => {
  const calls = {};
  const listRow = { id: 10, value: '2.4GHz', field_key: 'connection' };
  const runtimeSpecDb = {
    upsertListValue: (args) => { calls.upsert = args; },
    getListValueByFieldAndValue: () => listRow,
  };
  const result = upsertEnumListValueAndFetch({
    runtimeSpecDb,
    field: 'connection',
    value: '2.4GHz',
    normalizedValue: '2.4ghz',
    upsertValues: { source: 'pipeline', needsReview: false },
  });
  assert.deepEqual(result, listRow);
  assert.equal(calls.upsert.fieldKey, 'connection');
  assert.equal(calls.upsert.value, '2.4GHz');
  assert.equal(calls.upsert.source, 'pipeline');
});

// --- resolveEnumPreAffectedProductIds ---

test('resolveEnumPreAffectedProductIds returns product ids from listValueId', () => {
  const runtimeSpecDb = {
    getProductsByListValueId: () => [
      { product_id: 'p1' },
      { product_id: 'p2' },
      { product_id: 'p1' },
    ],
  };
  const result = resolveEnumPreAffectedProductIds(runtimeSpecDb, 10);
  assert.deepEqual(result, ['p1', 'p2']);
});

test('resolveEnumPreAffectedProductIds returns empty array on error', () => {
  const runtimeSpecDb = {
    getProductsByListValueId: () => { throw new Error('boom'); },
  };
  const result = resolveEnumPreAffectedProductIds(runtimeSpecDb, 10);
  assert.deepEqual(result, []);
});

test('resolveEnumPreAffectedProductIds returns empty for null rows', () => {
  const runtimeSpecDb = {
    getProductsByListValueId: () => null,
  };
  const result = resolveEnumPreAffectedProductIds(runtimeSpecDb, 10);
  assert.deepEqual(result, []);
});

// --- sanitizeExistingAcceptedCandidateId ---

test('sanitizeExistingAcceptedCandidateId returns null for missing accepted_candidate_id', () => {
  const result = sanitizeExistingAcceptedCandidateId({}, { accepted_candidate_id: '' });
  assert.equal(result, null);
});

test('sanitizeExistingAcceptedCandidateId returns null when candidate not found in DB', () => {
  const result = sanitizeExistingAcceptedCandidateId(
    { getCandidateById: () => null },
    { accepted_candidate_id: 'c1' },
  );
  assert.equal(result, null);
});

test('sanitizeExistingAcceptedCandidateId returns id when candidate exists', () => {
  const result = sanitizeExistingAcceptedCandidateId(
    { getCandidateById: () => ({ id: 'c1' }) },
    { accepted_candidate_id: 'c1' },
  );
  assert.equal(result, 'c1');
});

// --- resolveEnumRequiredCandidate ---

test('resolveEnumRequiredCandidate returns null for add action', () => {
  const result = resolveEnumRequiredCandidate({
    action: 'add',
    requestedCandidateId: null,
    requestedCandidateRow: null,
  });
  assert.equal(result, null);
});

test('resolveEnumRequiredCandidate returns null for remove action', () => {
  const result = resolveEnumRequiredCandidate({
    action: 'remove',
    requestedCandidateId: null,
    requestedCandidateRow: null,
  });
  assert.equal(result, null);
});

test('resolveEnumRequiredCandidate returns 400 when candidateId missing for accept', () => {
  const result = resolveEnumRequiredCandidate({
    action: 'accept',
    requestedCandidateId: null,
    requestedCandidateRow: null,
  });
  assert.equal(result.status, 400);
  assert.equal(result.payload.error, 'candidate_id_required');
});

test('resolveEnumRequiredCandidate returns 404 when candidate not found for confirm', () => {
  const result = resolveEnumRequiredCandidate({
    action: 'confirm',
    requestedCandidateId: 'c1',
    requestedCandidateRow: null,
  });
  assert.equal(result.status, 404);
  assert.equal(result.payload.error, 'candidate_not_found');
});

test('resolveEnumRequiredCandidate returns null when candidate found for accept', () => {
  const result = resolveEnumRequiredCandidate({
    action: 'accept',
    requestedCandidateId: 'c1',
    requestedCandidateRow: { id: 'c1' },
  });
  assert.equal(result, null);
});

// --- applyEnumSuggestionStatusByAction ---

test('applyEnumSuggestionStatusByAction marks accepted for accept action', async () => {
  const calls = [];
  await applyEnumSuggestionStatusByAction({
    action: 'accept',
    markEnumSuggestionStatus: async (cat, field, val, status) => { calls.push({ cat, field, val, status }); },
    category: 'mouse',
    field: 'connection',
    value: '2.4GHz',
    priorValue: '',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, 'accepted');
  assert.equal(calls[0].val, '2.4GHz');
});

test('applyEnumSuggestionStatusByAction marks both current and prior for accept with rename', async () => {
  const calls = [];
  await applyEnumSuggestionStatusByAction({
    action: 'accept',
    markEnumSuggestionStatus: async (cat, field, val, status) => { calls.push({ val, status }); },
    category: 'mouse',
    field: 'connection',
    value: '2.4GHz',
    priorValue: 'Wireless',
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].val, '2.4GHz');
  assert.equal(calls[1].val, 'Wireless');
});

test('applyEnumSuggestionStatusByAction marks dismissed for remove action', async () => {
  const calls = [];
  await applyEnumSuggestionStatusByAction({
    action: 'remove',
    markEnumSuggestionStatus: async (cat, field, val, status) => { calls.push({ val, status }); },
    category: 'mouse',
    field: 'connection',
    value: '2.4GHz',
    priorValue: '',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, 'dismissed');
});

test('applyEnumSuggestionStatusByAction marks accepted for add action', async () => {
  const calls = [];
  await applyEnumSuggestionStatusByAction({
    action: 'add',
    markEnumSuggestionStatus: async (cat, field, val, status) => { calls.push({ val, status }); },
    category: 'mouse',
    field: 'connection',
    value: 'Bluetooth',
    priorValue: '',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].status, 'accepted');
});

test('applyEnumSuggestionStatusByAction does nothing for confirm action', async () => {
  const calls = [];
  await applyEnumSuggestionStatusByAction({
    action: 'confirm',
    markEnumSuggestionStatus: async (cat, field, val, status) => { calls.push({ val, status }); },
    category: 'mouse',
    field: 'connection',
    value: '2.4GHz',
    priorValue: '',
  });
  assert.equal(calls.length, 0);
});

test('applyEnumSuggestionStatusByAction swallows errors', async () => {
  await assert.doesNotReject(() =>
    applyEnumSuggestionStatusByAction({
      action: 'accept',
      markEnumSuggestionStatus: async () => { throw new Error('boom'); },
      category: 'mouse',
      field: 'connection',
      value: '2.4GHz',
      priorValue: '',
    }),
  );
});

// --- normalizeEnumToken (from reviewRoutes.js) ---

test('normalizeEnumToken trims and lowercases', () => {
  assert.equal(normalizeEnumToken('  Wireless  '), 'wireless');
});

test('normalizeEnumToken handles null/undefined', () => {
  assert.equal(normalizeEnumToken(null), '');
  assert.equal(normalizeEnumToken(undefined), '');
});

// --- hasMeaningfulEnumValue ---

test('hasMeaningfulEnumValue rejects known non-meaningful tokens', () => {
  assert.equal(hasMeaningfulEnumValue(''), false);
  assert.equal(hasMeaningfulEnumValue('unk'), false);
  assert.equal(hasMeaningfulEnumValue('unknown'), false);
  assert.equal(hasMeaningfulEnumValue('n/a'), false);
  assert.equal(hasMeaningfulEnumValue('null'), false);
  assert.equal(hasMeaningfulEnumValue('UNK'), false);
  assert.equal(hasMeaningfulEnumValue('UNKNOWN'), false);
});

test('hasMeaningfulEnumValue accepts valid values', () => {
  assert.equal(hasMeaningfulEnumValue('2.4GHz'), true);
  assert.equal(hasMeaningfulEnumValue('Wireless'), true);
  assert.equal(hasMeaningfulEnumValue('0'), true);
});

// --- dedupeEnumValues ---

test('dedupeEnumValues removes duplicates case-insensitively', () => {
  assert.deepEqual(dedupeEnumValues(['Wireless', 'wireless', '2.4GHz']), ['Wireless', '2.4GHz']);
});

test('dedupeEnumValues filters out non-meaningful values', () => {
  assert.deepEqual(dedupeEnumValues(['unk', '2.4GHz', '', null, 'unknown']), ['2.4GHz']);
});

test('dedupeEnumValues preserves first occurrence casing', () => {
  assert.deepEqual(dedupeEnumValues(['wireless', 'WIRELESS', 'Wireless']), ['wireless']);
});

test('dedupeEnumValues handles empty input', () => {
  assert.deepEqual(dedupeEnumValues([]), []);
  assert.deepEqual(dedupeEnumValues(), []);
});

// --- readEnumConsistencyFormatHint ---

test('readEnumConsistencyFormatHint reads from enum.match.format_hint', () => {
  assert.equal(readEnumConsistencyFormatHint({
    enum: { match: { format_hint: 'Title Case' } },
  }), 'Title Case');
});

test('readEnumConsistencyFormatHint falls back to enum_match_format_hint', () => {
  assert.equal(readEnumConsistencyFormatHint({
    enum_match_format_hint: 'lowercase',
  }), 'lowercase');
});

test('readEnumConsistencyFormatHint returns empty for no rule', () => {
  assert.equal(readEnumConsistencyFormatHint(), '');
  assert.equal(readEnumConsistencyFormatHint({}), '');
});
