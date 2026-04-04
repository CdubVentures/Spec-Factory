function createSqlStatement(overrides = {}) {
  return {
    get: () => null,
    run: () => ({ changes: 1 }),
    all: () => [],
    ...overrides,
  };
}

export function makeSqlDb(overrides = {}) {
  return {
    prepare: () => createSqlStatement(),
    transaction: (fn) => fn,
    ...overrides,
  };
}

export function makeSeededRuntimeSpecDb(overrides = {}) {
  return {
    isSeeded: () => true,
    category: 'mouse',
    db: makeSqlDb(),
    getKeyReviewState: () => null,
    upsertReview: () => {},
    updateKeyReviewAiConfirm: () => {},
    updateKeyReviewUserAccept: () => {},
    insertKeyReviewAudit: () => {},
    upsertComponentValue: () => ({}),
    clearComponentValueAcceptedCandidate: () => {},
    insertAlias: () => {},
    updateAliasesOverridden: () => {},
    getListValueByFieldAndValue: () => null,
    upsertListValue: () => {},
    renameListValueById: () => [],
    deleteListValueById: () => {},
    getProductsByListValueId: () => [],
    ...overrides,
  };
}

function makeJsonResponder(calls) {
  return (_res, status, body) => {
    const response = { status, body };
    calls.responses.push(response);
    return response;
  };
}

export function makeItemRouteHarness(overrides = {}) {
  const calls = { responses: [] };
  const context = {
    storage: {},
    config: {},
    readJsonBody: async () => ({}),
    jsonRes: makeJsonResponder(calls),
    getSpecDb: () => makeSeededRuntimeSpecDb(),
    resolveGridFieldStateForMutation: () => ({
      row: {
        id: 1,
        product_id: 'mouse-foo-bar',
        field_key: 'weight',
      },
    }),
    setOverrideFromCandidate: async () => ({ candidate_id: 'ref_c1', value: '85g' }),
    setManualOverride: async ({ value }) => ({ value }),
    syncPrimaryLaneAcceptFromItemSelection: () => {},
    resolveKeyReviewForLaneMutation: () => ({
      stateRow: {
        id: 1,
        target_kind: 'grid_key',
        item_identifier: 'mouse-foo-bar',
        field_key: 'weight',
        item_field_state_id: 1,
      },
    }),
    markPrimaryLaneReviewedInItemState: () => {},
    syncItemFieldStateFromPrimaryLaneAccept: () => {},
    isMeaningfulValue: (value) => value != null && String(value).trim() !== '',
    propagateSharedLaneDecision: async () => {},
    broadcastWs: () => {},
    ...overrides,
  };
  return { calls, context };
}

export function makeComponentMutationContext(overrides = {}) {
  return {
    componentType: 'sensor',
    componentName: 'PMW3360',
    componentMaker: 'PixArt',
    property: 'dpi',
    componentValueId: 1,
    componentIdentityId: 5,
    componentValueRow: {
      id: 1,
      property_key: 'dpi',
      value: '16000',
      confidence: 0.9,
      variance_policy: null,
      needs_review: 0,
      constraints: '[]',
    },
    ...overrides,
  };
}

export function makeComponentRouteHarness(overrides = {}) {
  const calls = { responses: [], cacheDeletes: [] };
  const context = {
    readJsonBody: async () => ({}),
    jsonRes: makeJsonResponder(calls),
    getSpecDbReady: async () => makeSeededRuntimeSpecDb(),
    resolveComponentMutationContext: () => makeComponentMutationContext(),
    isMeaningfulValue: (value) => value != null && String(value).trim() !== '',
    normalizeLower: (value) => String(value || '').trim().toLowerCase(),
    buildComponentIdentifier: (type, name, maker) => `${type}::${name}::${maker}`,
    applySharedLaneState: () => ({}),
    cascadeComponentChange: async () => {},
    outputRoot: 'out',
    storage: {},
    loadQueueState: async () => ({ state: { products: {} } }),
    saveQueueState: async () => ({ ok: true }),
    remapPendingComponentReviewItemsForNameChange: async () => {},
    specDbCache: { delete: (category) => { calls.cacheDeletes.push(category); } },
    broadcastWs: () => {},
    ...overrides,
  };
  return { calls, context };
}

export function makeEnumMutationContext(overrides = {}) {
  return {
    field: 'lighting',
    value: 'RGB LED',
    oldValue: 'RGB Led',
    listValueId: 11,
    enumListId: 4,
    ...overrides,
  };
}

export function makeEnumRouteHarness(overrides = {}) {
  const calls = { responses: [], cacheDeletes: [] };
  const context = {
    readJsonBody: async () => ({}),
    jsonRes: makeJsonResponder(calls),
    getSpecDbReady: async () => makeSeededRuntimeSpecDb(),
    resolveEnumMutationContext: () => makeEnumMutationContext(),
    isMeaningfulValue: (value) => value != null && String(value).trim() !== '',
    normalizeLower: (value) => String(value || '').trim().toLowerCase(),
    applySharedLaneState: () => ({}),
    specDbCache: { delete: (category) => { calls.cacheDeletes.push(category); } },
    storage: {},
    outputRoot: 'out',
    cascadeEnumChange: async () => {},
    loadQueueState: async () => ({ state: { products: {} } }),
    saveQueueState: async () => ({ ok: true }),
    isReviewFieldPathEnabled: async () => true,
    broadcastWs: () => {},
    ...overrides,
  };
  return { calls, context };
}
