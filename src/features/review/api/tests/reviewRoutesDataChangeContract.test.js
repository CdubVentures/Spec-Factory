import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { registerReviewRoutes } from '../reviewRoutes.js';

function makeReviewCtx(overrides = {}) {
  const ctx = {
    jsonRes: (_res, status, body) => ({ status, body }),
    readJsonBody: async () => ({}),
    toInt: (value, fallback = 0) => {
      const n = Number.parseInt(String(value ?? ''), 10);
      return Number.isFinite(n) ? n : fallback;
    },
    hasKnownValue: (value) => value !== null && value !== undefined && String(value).trim() !== '',
    config: {},
    storage: {},
    OUTPUT_ROOT: 'out',
    HELPER_ROOT: 'category_authority',
    path,
    fs: { mkdir: async () => {}, writeFile: async () => {} },
    getSpecDb: () => null,
    getSpecDbReady: async () => null,
    buildReviewLayout: async () => ({ fields: [] }),
    buildProductReviewPayload: async () => ({ fields: {}, metrics: { has_run: false } }),
    buildReviewQueue: async () => [],
    buildComponentReviewLayout: async () => ({ types: [] }),
    buildComponentReviewPayloads: async () => ({ items: [] }),
    buildEnumReviewPayloads: async () => ({ fields: [] }),
    readLatestArtifacts: async () => ({}),
    sessionCache: {
      getSessionRules: async () => ({ draftFieldOrder: [], draftFields: {}, cleanFieldOrder: [] }),
      invalidateSessionCache: () => {},
    },
    reviewLayoutByCategory: new Map(),
    broadcastWs: () => {},
    specDbCache: new Map(),
    findProductsReferencingComponent: async () => [],
    invalidateFieldRulesCache: () => {},
    safeReadJson: async () => ({ version: 1, items: [], updated_at: null }),
    slugify: (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    spawn: () => {
      const proc = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      process.nextTick(() => {
        proc.stdout.emit('data', 'ok');
        proc.emit('exit', 0);
      });
      return proc;
    },
    resolveGridFieldStateForMutation: () => ({ error: 'not_used' }),
    setOverrideFromCandidate: async () => ({}),
    setManualOverride: async () => ({}),
    syncPrimaryLaneAcceptFromItemSelection: () => {},
    resolveKeyReviewForLaneMutation: () => ({ error: 'not_used' }),
    markPrimaryLaneReviewedInItemState: () => {},
    syncItemFieldStateFromPrimaryLaneAccept: () => {},
    isMeaningfulValue: (value) => value !== null && value !== undefined && String(value).trim() !== '',
    propagateSharedLaneDecision: async () => {},
    resolveComponentMutationContext: () => ({ error: 'not_used' }),
    normalizeLower: (value) => String(value || '').trim().toLowerCase(),
    buildComponentIdentifier: (type, name, maker) => `${type}::${name}::${maker}`,
    applySharedLaneState: () => ({}),
    cascadeComponentChange: async () => {},
    remapPendingComponentReviewItemsForNameChange: async () => {},
    resolveEnumMutationContext: () => ({ error: 'not_used' }),
    cascadeEnumChange: async () => {},
    runEnumConsistencyReview: async () => ({ enabled: false, skipped_reason: 'not_stubbed', decisions: [] }),
    ensureGridKeyReviewState: () => {},
    patchCompiledComponentDb: async () => ({}),
  };
  return { ...ctx, ...overrides };
}

function makeMockEnumSpecDb() {
  const values = [
    {
      id: 11,
      list_id: 4,
      field_key: 'lighting',
      value: 'RGB LED',
      source: 'known_values',
      needs_review: 0,
      enum_policy: 'open_prefer_known',
      overridden: 0,
      accepted_candidate_id: null,
    },
    {
      id: 12,
      list_id: 4,
      field_key: 'lighting',
      value: 'Rgb Led',
      source: 'pipeline',
      needs_review: 1,
      enum_policy: 'open_prefer_known',
      overridden: 0,
      accepted_candidate_id: null,
    },
  ];
  return {
    isSeeded: () => true,
    getEnumList: (fieldKey) => (fieldKey === 'lighting' ? { id: 4, field_key: 'lighting' } : null),
    getListValues: (fieldKey) => (fieldKey === 'lighting' ? values.map((row) => ({ ...row })) : []),
    getListValueByFieldAndValue: (fieldKey, value) => {
      if (fieldKey !== 'lighting') return null;
      const token = String(value || '').trim().toLowerCase();
      return values.find((row) => String(row.value || '').trim().toLowerCase() === token) || null;
    },
    renameListValueById: (listValueId, newValue) => {
      const idx = values.findIndex((row) => row.id === listValueId);
      if (idx < 0) return [];
      values.splice(idx, 1);
      if (!values.some((row) => String(row.value || '').trim().toLowerCase() === String(newValue || '').trim().toLowerCase())) {
        values.push({
          id: listValueId,
          list_id: 4,
          field_key: 'lighting',
          value: String(newValue || '').trim(),
          source: 'known_values',
          needs_review: 0,
          enum_policy: 'open_prefer_known',
          overridden: 0,
          accepted_candidate_id: null,
        });
      }
      return ['p-a'];
    },
    upsertListValue: ({ fieldKey, value, normalizedValue, source, enumPolicy, acceptedCandidateId, needsReview, overridden }) => {
      if (fieldKey !== 'lighting') return;
      const token = String(value || '').trim().toLowerCase();
      const idx = values.findIndex((row) => String(row.value || '').trim().toLowerCase() === token);
      const next = {
        id: idx >= 0 ? values[idx].id : (Math.max(...values.map((row) => row.id), 10) + 1),
        list_id: 4,
        field_key: fieldKey,
        value,
        normalized_value: normalizedValue || token,
        source: source || 'pipeline',
        enum_policy: enumPolicy || 'open_prefer_known',
        accepted_candidate_id: acceptedCandidateId || null,
        needs_review: needsReview ? 1 : 0,
        overridden: overridden ? 1 : 0,
      };
      if (idx >= 0) values[idx] = next;
      else values.push(next);
    },
    _rows: values,
  };
}

test('review product route resolves identity through specDb when payload identity is stale', async () => {
  const handler = registerReviewRoutes(makeReviewCtx({
    getSpecDb: (category) => (category === 'mouse'
      ? {
          getProduct: (productId) => (productId === 'mouse-foo-bar'
            ? {
                id: 11,
                identifier: 'db_11',
                brand: 'Db Brand',
                model: 'Db Model',
                variant: 'Db Variant',
              }
            : null),
        }
      : null),
    buildProductReviewPayload: async () => ({
      identity: {
        id: 0,
        identifier: '',
        brand: 'Stale Brand',
        model: 'Stale Model',
        variant: 'Legacy',
      },
      fields: {},
      metrics: { has_run: false },
    }),
  }));

  const result = await handler(['review', 'mouse', 'product', 'mouse-foo-bar'], new URLSearchParams(), 'GET', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.identity.id, 11);
  assert.equal(result.body.identity.identifier, 'db_11');
  assert.equal(result.body.identity.brand, 'Db Brand');
  assert.equal(result.body.identity.model, 'Db Model');
  assert.equal(result.body.identity.variant, 'Db Variant');
});

test('review suggest emits typed data-change contract', async () => {
  const emitted = [];
  const handler = registerReviewRoutes(makeReviewCtx({
    readJsonBody: async () => ({
      type: 'enum',
      field: 'dpi',
      value: '1000',
    }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['review', 'mouse', 'suggest'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'review-suggest');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.categories, ['mouse']);
  assert.deepEqual(emitted[0].payload.domains, ['review', 'suggestions']);
});

test('enum consistency preview returns decisions without emitting data-change', async () => {
  const emitted = [];
  const specDb = makeMockEnumSpecDb();
  const handler = registerReviewRoutes(makeReviewCtx({
    readJsonBody: async () => ({ field: 'lighting', apply: false }),
    getSpecDbReady: async () => specDb,
    runEnumConsistencyReview: async () => ({
      enabled: true,
      decisions: [
        {
          value: 'Rgb Led',
          decision: 'map_to_existing',
          target_value: 'RGB LED',
          confidence: 0.93,
          reasoning: 'matches canonical casing',
        },
      ],
    }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['review-components', 'mouse', 'enum-consistency'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.apply, false);
  assert.equal(Array.isArray(result.body.decisions), true);
  assert.equal(result.body.decisions.length, 1);
  assert.equal(result.body.decisions[0].decision, 'map_to_existing');
  assert.equal(emitted.length, 0);
});

test('enum consistency apply emits typed data-change contract', async () => {
  const emitted = [];
  const specDb = makeMockEnumSpecDb();
  const handler = registerReviewRoutes(makeReviewCtx({
    readJsonBody: async () => ({ field: 'lighting', apply: true }),
    getSpecDbReady: async () => specDb,
    runEnumConsistencyReview: async () => ({
      enabled: true,
      decisions: [
        {
          value: 'Rgb Led',
          decision: 'map_to_existing',
          target_value: 'RGB LED',
          confidence: 0.93,
          reasoning: 'matches canonical casing',
        },
      ],
    }),
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['review-components', 'mouse', 'enum-consistency'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 200);
  assert.equal(result.body.apply, true);
  assert.equal(result.body.applied.mapped, 1);
  assert.equal(result.body.applied.changed, 1);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].channel, 'data-change');
  assert.equal(emitted[0].payload.type, 'data-change');
  assert.equal(emitted[0].payload.event, 'enum-consistency');
  assert.equal(emitted[0].payload.category, 'mouse');
  assert.deepEqual(emitted[0].payload.categories, ['mouse']);
  assert.deepEqual(emitted[0].payload.domains, ['enum', 'review']);
});

test('enum consistency skips when review consumer disables enum.additional_values', async () => {
  const emitted = [];
  const specDb = makeMockEnumSpecDb();
  const handler = registerReviewRoutes(makeReviewCtx({
    readJsonBody: async () => ({ field: 'lighting', apply: true }),
    getSpecDbReady: async () => specDb,
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {
          lighting: {
            enum: {
              policy: 'open_prefer_known',
              source: 'data_lists.lighting',
            },
            consumers: {
              'enum.additional_values': {
                review: false,
              },
            },
          },
        },
        draftFieldOrder: [],
        draftFields: {},
        cleanFieldOrder: [],
      }),
      invalidateSessionCache: () => {},
    },
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['review-components', 'mouse', 'enum-consistency'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 403);
  assert.equal(result.body?.error, 'review_consumer_disabled');
  assert.equal(emitted.length, 0);
});

test('enum override is blocked when review consumer disables enum.source', async () => {
  const emitted = [];
  const seededSpecDb = { isSeeded: () => true };
  const handler = registerReviewRoutes(makeReviewCtx({
    readJsonBody: async () => ({
      action: 'confirm',
      listValueId: 12,
      enumListId: 4,
      candidateId: 'cand-lighting',
    }),
    getSpecDbReady: async () => seededSpecDb,
    resolveEnumMutationContext: () => ({
      field: 'lighting',
      value: 'Rgb Led',
      oldValue: 'Rgb Led',
      listValueId: 12,
      enumListId: 4,
      error: null,
    }),
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {
          lighting: {
            enum: {
              policy: 'open_prefer_known',
              source: 'data_lists.lighting',
            },
            consumers: {
              'enum.source': {
                review: false,
              },
            },
          },
        },
        draftFieldOrder: [],
        draftFields: {},
        cleanFieldOrder: [],
      }),
      invalidateSessionCache: () => {},
    },
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['review-components', 'mouse', 'enum-override'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 403);
  assert.equal(result.body?.error, 'review_consumer_disabled');
  assert.equal(emitted.length, 0);
});

test('enum consistency skips when review consumer is disabled', async () => {
  const emitted = [];
  const specDb = makeMockEnumSpecDb();
  let llmInvoked = false;
  const handler = registerReviewRoutes(makeReviewCtx({
    readJsonBody: async () => ({ field: 'lighting', apply: true }),
    getSpecDbReady: async () => specDb,
    sessionCache: {
      getSessionRules: async () => ({
        mergedFields: {
          lighting: {
            consumers: {
              'enum.match.strategy': { review: false },
            },
          },
        },
      }),
      invalidateSessionCache: () => {},
    },
    runEnumConsistencyReview: async () => {
      llmInvoked = true;
      return {
        enabled: true,
        decisions: [],
      };
    },
    broadcastWs: (channel, payload) => emitted.push({ channel, payload }),
  }));

  const result = await handler(['review-components', 'mouse', 'enum-consistency'], new URLSearchParams(), 'POST', {}, {});
  assert.equal(result.status, 403);
  assert.equal(result.body?.error, 'review_consumer_disabled');
  assert.equal(llmInvoked, false);
  assert.equal(emitted.length, 0);
});
