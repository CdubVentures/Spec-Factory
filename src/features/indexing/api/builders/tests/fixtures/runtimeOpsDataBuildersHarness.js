export function makeMeta(overrides = {}) {
  return {
    run_id: 'run-001',
    category: 'mouse',
    product_id: 'mouse-test-brand-model',
    started_at: '2026-02-20T00:00:00.000Z',
    ended_at: '2026-02-20T00:10:00.000Z',
    status: 'completed',
    round: 2,
    ...overrides,
  };
}

export function makeEvent(event, payload = {}, overrides = {}) {
  return {
    run_id: 'run-001',
    ts: '2026-02-20T00:01:00.000Z',
    event,
    payload,
    ...overrides,
  };
}
