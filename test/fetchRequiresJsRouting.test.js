import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSourceFetchPhase } from '../src/features/indexing/orchestration/execution/runSourceFetchPhase.js';

function noopGate() {
  return { run: ({ task }) => task() };
}

function makeContext(sourceOverrides = {}, configOverrides = {}) {
  let capturedMode = '';
  return {
    capturedMode: () => capturedMode,
    args: {
      workerId: 'w1',
      source: { url: 'https://example.com/page', host: 'example.com', ...sourceOverrides },
      sourceHost: sourceOverrides.host || 'example.com',
      hostBudgetRow: { started_count: 0, completed_count: 0, outcome_counts: {} },
      fetcher: null,
      fetcherMode: 'http',
      fetchModeOverride: '',
      fetchWithModeFn: async (_source, mode) => {
        capturedMode = mode;
        return { status: 200, html: '<html>ok</html>', ok: true };
      },
      config: { sourceFetchWrapperAttempts: 1, ...configOverrides },
      logger: null,
      fetchHostConcurrencyGate: noopGate(),
      runWithRetryFn: async (task) => task(),
      classifyFetchOutcomeFn: () => 'ok',
      bumpHostOutcomeFn: () => {},
      applyHostBudgetBackoffFn: () => {},
      resolveHostBudgetStateFn: () => ({ score: 100, state: 'open' }),
      toIntFn: (v, fb) => Number(v || fb),
    }
  };
}

// ---------------------------------------------------------------------------
// RJ-01: requires_js=true host goes straight to playwright
// ---------------------------------------------------------------------------
describe('RJ-01: requires_js=true host uses playwright', () => {
  it('uses playwright mode for requires_js source', async () => {
    const ctx = makeContext({ requires_js: true });
    await runSourceFetchPhase(ctx.args);
    assert.equal(ctx.capturedMode(), 'playwright');
  });
});

// ---------------------------------------------------------------------------
// RJ-02: requires_js=false host uses static (http) fetcher mode
// ---------------------------------------------------------------------------
describe('RJ-02: requires_js=false host uses configured default mode', () => {
  it('uses http mode when fetcherMode=http and requires_js=false', async () => {
    const ctx = makeContext({ requires_js: false });
    ctx.args.fetcherMode = 'http';
    await runSourceFetchPhase(ctx.args);
    assert.equal(ctx.capturedMode(), 'http');
  });
});

// ---------------------------------------------------------------------------
// RJ-03: requires_js unset defaults to fetcherMode
// ---------------------------------------------------------------------------
describe('RJ-03: requires_js unset uses fetcherMode default', () => {
  it('uses fetcherMode when requires_js is not set', async () => {
    const ctx = makeContext({});
    ctx.args.fetcherMode = 'http';
    await runSourceFetchPhase(ctx.args);
    assert.equal(ctx.capturedMode(), 'http');
  });
});

// ---------------------------------------------------------------------------
// RJ-04: crawlConfig.method=playwright triggers playwright mode
// ---------------------------------------------------------------------------
describe('RJ-04: crawlConfig.method=playwright triggers playwright', () => {
  it('uses playwright when crawlConfig.method=playwright', async () => {
    const ctx = makeContext({
      crawlConfig: { method: 'playwright', rate_limit_ms: 3000 }
    });
    ctx.args.fetcherMode = 'http';
    await runSourceFetchPhase(ctx.args);
    assert.equal(ctx.capturedMode(), 'playwright');
  });
});

// ---------------------------------------------------------------------------
// RJ-05: fetchModeOverride takes precedence over requires_js
// ---------------------------------------------------------------------------
describe('RJ-05: fetchModeOverride takes precedence', () => {
  it('override wins even if requires_js=true', async () => {
    const ctx = makeContext({ requires_js: true });
    ctx.args.fetchModeOverride = 'crawlee';
    await runSourceFetchPhase(ctx.args);
    assert.equal(ctx.capturedMode(), 'crawlee');
  });
});

// ---------------------------------------------------------------------------
// RJ-06: Logs correct fetcher_kind for requires_js source
// ---------------------------------------------------------------------------
describe('RJ-06: Correct fetcher_kind logged for requires_js source', () => {
  it('logs playwright for requires_js source', async () => {
    const logs = [];
    const ctx = makeContext({ requires_js: true });
    ctx.args.logger = {
      info: (event, data) => logs.push({ event, ...data }),
      warn: () => {},
      error: () => {},
    };
    await runSourceFetchPhase(ctx.args);
    const startLog = logs.find((l) => l.event === 'source_fetch_started');
    assert.ok(startLog, 'source_fetch_started log emitted');
    assert.equal(startLog.fetcher_kind, 'playwright');
  });
});
