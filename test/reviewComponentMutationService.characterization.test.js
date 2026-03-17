import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateComponentPropertyCandidate,
  applyComponentSharedAcceptLane,
  runComponentIdentityUpdateTx,
  isIdentityPropertyKey,
  normalizeStringEntries,
  parseJsonArray,
  cascadeComponentMutation,
  respondMissingComponentIdentityId,
  buildComponentMutationContextArgs,
  resolveComponentIdentityMutationPlan,
} from '../src/api/reviewComponentMutationRoutes.js';

// --- validateComponentPropertyCandidate ---

test('validateComponentPropertyCandidate returns mismatch error when field_key differs', () => {
  const result = validateComponentPropertyCandidate({
    candidateRow: { field_key: 'dpi_max', value: '35000' },
    candidateId: 'c1',
    property: 'weight',
    resolvedValue: '49',
    isMeaningfulValue: () => true,
    normalizeLower: (v) => v.toLowerCase(),
    valueMismatchMessage: 'mismatch',
  });
  assert.equal(result.error, 'candidate_context_mismatch');
});

test('validateComponentPropertyCandidate returns value mismatch when values differ', () => {
  const result = validateComponentPropertyCandidate({
    candidateRow: { field_key: 'weight', value: '50' },
    candidateId: 'c1',
    property: 'weight',
    resolvedValue: '49',
    isMeaningfulValue: () => true,
    normalizeLower: (v) => v.toLowerCase(),
    valueMismatchMessage: 'values do not match',
  });
  assert.equal(result.error, 'candidate_value_mismatch');
  assert.equal(result.message, 'values do not match');
});

test('validateComponentPropertyCandidate returns null when candidate matches', () => {
  const result = validateComponentPropertyCandidate({
    candidateRow: { field_key: 'weight', value: '49' },
    candidateId: 'c1',
    property: 'weight',
    resolvedValue: '49',
    isMeaningfulValue: () => true,
    normalizeLower: (v) => v.toLowerCase(),
    valueMismatchMessage: 'mismatch',
  });
  assert.equal(result, null);
});

test('validateComponentPropertyCandidate allows empty candidate value', () => {
  const result = validateComponentPropertyCandidate({
    candidateRow: { field_key: 'weight', value: '' },
    candidateId: 'c1',
    property: 'weight',
    resolvedValue: '49',
    isMeaningfulValue: (v) => v !== '',
    normalizeLower: (v) => v.toLowerCase(),
    valueMismatchMessage: 'mismatch',
  });
  assert.equal(result, null);
});

// --- isIdentityPropertyKey ---

test('isIdentityPropertyKey recognizes identity keys', () => {
  assert.equal(isIdentityPropertyKey('__name'), true);
  assert.equal(isIdentityPropertyKey('__maker'), true);
  assert.equal(isIdentityPropertyKey('__links'), true);
  assert.equal(isIdentityPropertyKey('__aliases'), true);
});

test('isIdentityPropertyKey rejects non-identity keys', () => {
  assert.equal(isIdentityPropertyKey('weight'), false);
  assert.equal(isIdentityPropertyKey('dpi_max'), false);
  assert.equal(isIdentityPropertyKey(''), false);
  assert.equal(isIdentityPropertyKey(null), false);
  assert.equal(isIdentityPropertyKey(undefined), false);
});

// --- normalizeStringEntries ---

test('normalizeStringEntries normalizes array values', () => {
  assert.deepEqual(normalizeStringEntries(['  a ', 'b', '', null]), ['a', 'b']);
});

test('normalizeStringEntries wraps single value in array', () => {
  assert.deepEqual(normalizeStringEntries('hello'), ['hello']);
});

test('normalizeStringEntries filters empty/null values', () => {
  assert.deepEqual(normalizeStringEntries([null, undefined, '']), []);
});

// --- parseJsonArray ---

test('parseJsonArray parses valid JSON array', () => {
  assert.deepEqual(parseJsonArray('["a","b"]'), ['a', 'b']);
});

test('parseJsonArray returns empty array for null', () => {
  assert.deepEqual(parseJsonArray(null), []);
});

test('parseJsonArray returns empty array for invalid JSON', () => {
  assert.deepEqual(parseJsonArray('not-json'), []);
});

test('parseJsonArray returns empty array for empty string', () => {
  assert.deepEqual(parseJsonArray(''), []);
});

// --- cascadeComponentMutation ---

test('cascadeComponentMutation delegates to cascadeComponentChange', async () => {
  const calls = {};
  await cascadeComponentMutation({
    cascadeComponentChange: async (args) => { calls.cascade = args; },
    storage: { root: '/tmp' },
    outputRoot: '/out',
    category: 'mouse',
    loadQueueState: () => {},
    saveQueueState: () => {},
    runtimeSpecDb: { db: {} },
    componentType: 'sensor',
    componentName: 'PAW3950',
    componentMaker: 'PixArt',
    changedProperty: 'dpi_max',
    newValue: '35000',
    variancePolicy: 'authoritative',
    constraints: ['min:1000'],
  });
  assert.equal(calls.cascade.componentType, 'sensor');
  assert.equal(calls.cascade.componentName, 'PAW3950');
  assert.equal(calls.cascade.changedProperty, 'dpi_max');
  assert.equal(calls.cascade.newValue, '35000');
  assert.equal(calls.cascade.variancePolicy, 'authoritative');
});

// --- respondMissingComponentIdentityId ---

test('respondMissingComponentIdentityId returns false when id is present', () => {
  const result = respondMissingComponentIdentityId({
    respond: () => true,
    componentIdentityId: 42,
  });
  assert.equal(result, false);
});

test('respondMissingComponentIdentityId calls respond when id is missing', () => {
  const calls = {};
  const result = respondMissingComponentIdentityId({
    respond: (status, payload) => { calls.resp = { status, payload }; return true; },
    componentIdentityId: null,
  });
  assert.equal(result, true);
  assert.equal(calls.resp.status, 400);
  assert.equal(calls.resp.payload.error, 'component_identity_id_required');
});

test('respondMissingComponentIdentityId uses custom message', () => {
  const calls = {};
  respondMissingComponentIdentityId({
    respond: (status, payload) => { calls.resp = payload; return true; },
    componentIdentityId: 0,
    message: 'custom error',
  });
  assert.equal(calls.resp.message, 'custom error');
});

// --- buildComponentMutationContextArgs ---

test('buildComponentMutationContextArgs sets requireComponentValueId for non-identity properties', () => {
  const args = buildComponentMutationContextArgs({
    runtimeSpecDb: { db: {} },
    category: 'mouse',
    body: { property: 'dpi_max' },
  });
  assert.equal(args.length, 4);
  assert.equal(args[3].requireComponentValueId, true);
  assert.equal(args[3].requireComponentIdentityId, false);
});

test('buildComponentMutationContextArgs sets requireComponentIdentityId for identity properties', () => {
  const args = buildComponentMutationContextArgs({
    runtimeSpecDb: { db: {} },
    category: 'mouse',
    body: { property: '__name' },
  });
  assert.equal(args[3].requireComponentValueId, false);
  assert.equal(args[3].requireComponentIdentityId, true);
});

// --- resolveComponentIdentityMutationPlan ---

test('resolveComponentIdentityMutationPlan returns null for non-identity properties', () => {
  assert.equal(resolveComponentIdentityMutationPlan({
    property: 'dpi_max',
    value: '35000',
    componentType: 'sensor',
    name: 'PAW3950',
    componentMaker: 'PixArt',
  }), null);
});

test('resolveComponentIdentityMutationPlan rejects short name values', () => {
  const result = resolveComponentIdentityMutationPlan({
    property: '__name',
    value: 'X',
    componentType: 'sensor',
    name: 'PAW3950',
    componentMaker: 'PixArt',
  });
  assert.ok(result.errorPayload);
  assert.match(result.errorPayload.error, /name must be at least 2 characters/);
});

test('resolveComponentIdentityMutationPlan rejects short maker values', () => {
  const result = resolveComponentIdentityMutationPlan({
    property: '__maker',
    value: '',
    componentType: 'sensor',
    name: 'PAW3950',
    componentMaker: 'PixArt',
  });
  assert.ok(result.errorPayload);
  assert.match(result.errorPayload.error, /maker must be at least 2 characters/);
});

test('resolveComponentIdentityMutationPlan returns correct plan for __name', () => {
  const result = resolveComponentIdentityMutationPlan({
    property: '__name',
    value: 'PAW3395',
    componentType: 'sensor',
    name: 'PAW3950',
    componentMaker: 'PixArt',
  });
  assert.equal(result.nextName, 'PAW3395');
  assert.equal(result.nextMaker, 'PixArt');
  assert.equal(result.selectedValue, 'PAW3395');
  assert.equal(result.changedProperty, 'sensor');
  assert.equal(result.requiresNameRemap, true);
});

test('resolveComponentIdentityMutationPlan returns correct plan for __maker', () => {
  const result = resolveComponentIdentityMutationPlan({
    property: '__maker',
    value: 'Razer',
    componentType: 'sensor',
    name: 'PAW3950',
    componentMaker: 'PixArt',
  });
  assert.equal(result.nextName, 'PAW3950');
  assert.equal(result.nextMaker, 'Razer');
  assert.equal(result.selectedValue, 'Razer');
  assert.equal(result.changedProperty, 'sensor_brand');
  assert.equal(result.requiresNameRemap, false);
});

// --- applyComponentSharedAcceptLane ---

test('applyComponentSharedAcceptLane delegates to applySharedLaneState with resolved confidence', () => {
  const calls = {};
  applyComponentSharedAcceptLane({
    runtimeSpecDb: { getCandidateById: () => ({ score: 0.88 }) },
    applySharedLaneState: (args) => { calls.lane = args; return { id: 1 }; },
    category: 'mouse',
    propertyKey: 'dpi_max',
    componentIdentifier: 'sensor::PAW3950::PixArt',
    componentValueId: 42,
    selectedCandidateId: 'c1',
    selectedValue: '35000',
    nowIso: '2026-01-01T00:00:00Z',
    candidateRow: { score: 0.92 },
  });
  assert.equal(calls.lane.targetKind, 'component_key');
  assert.equal(calls.lane.fieldKey, 'dpi_max');
  assert.equal(calls.lane.laneAction, 'accept');
  assert.equal(calls.lane.selectedValue, '35000');
});

// --- runComponentIdentityUpdateTx ---

test('runComponentIdentityUpdateTx detects collision and merges', () => {
  const calls = {};
  const runtimeSpecDb = {
    category: 'mouse',
    mergeComponentIdentities: (args) => { calls.merge = args; },
    db: {
      transaction: (fn) => fn,
      prepare: (sql) => ({
        get: () => ({ id: 99 }),
        run: () => {},
      }),
    },
  };
  const result = runComponentIdentityUpdateTx({
    runtimeSpecDb,
    buildComponentIdentifier: (type, name, maker) => `${type}::${name}::${maker}`,
    componentType: 'sensor',
    currentName: 'PAW3950',
    currentMaker: 'PixArt',
    nextName: 'PAW3395',
    nextMaker: 'PixArt',
    componentIdentityId: 5,
    selectedSource: 'user',
  });
  assert.equal(result.merged, true);
  assert.equal(result.survivingId, 99);
  assert.ok(calls.merge);
});

test('runComponentIdentityUpdateTx performs rename when no collision', () => {
  const calls = { runs: [] };
  let queryCount = 0;
  const runtimeSpecDb = {
    category: 'mouse',
    db: {
      transaction: (fn) => fn,
      prepare: (sql) => ({
        get: () => { queryCount++; return queryCount === 1 ? null : undefined; },
        run: (...args) => { calls.runs.push({ sql: sql.trim(), args }); },
      }),
    },
  };
  const result = runComponentIdentityUpdateTx({
    runtimeSpecDb,
    buildComponentIdentifier: (type, name, maker) => `${type}::${name}::${maker}`,
    componentType: 'sensor',
    currentName: 'PAW3950',
    currentMaker: 'PixArt',
    nextName: 'PAW3395',
    nextMaker: 'PixArt',
    componentIdentityId: 5,
    selectedSource: 'user',
  });
  assert.equal(result.merged, false);
  assert.equal(result.oldComponentIdentifier, 'sensor::PAW3950::PixArt');
  assert.equal(result.newComponentIdentifier, 'sensor::PAW3395::PixArt');
  assert.ok(calls.runs.length >= 3);
});
