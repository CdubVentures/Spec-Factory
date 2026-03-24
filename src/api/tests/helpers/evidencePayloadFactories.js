export function createNeedsetComputedEvent(overrides = {}) {
  return {
    event: 'needset_computed',
    needset_size: 25,
    total_fields: 60,
    ...overrides,
  };
}

export function createRunCompletedEvent(overrides = {}) {
  return {
    event: 'run_completed',
    confidence: 0.82,
    validated: true,
    missing_required_fields: ['weight', 'sensor'],
    critical_fields_below_pass_target: ['dpi'],
    ...overrides,
  };
}

export function createWrappedEvent(event, payload = {}) {
  return {
    event,
    payload,
  };
}

export function createInventory(overrides = {}) {
  return {
    documentCount: 5,
    chunkCount: 42,
    factCount: 10,
    uniqueHashes: 4,
    dedupeHits: 3,
    ...overrides,
  };
}

export function createDedupeEvent(overrides = {}) {
  return {
    dedupe_outcome: 'new',
    chunks_indexed: 8,
    ...overrides,
  };
}

export function createFtsResult(overrides = {}) {
  return {
    snippet_id: 'sn_abc',
    url: 'https://example.com',
    tier: 1,
    text: 'PAW3950 sensor used',
    rank: -5.2,
    ...overrides,
  };
}
