import test from 'node:test';
import assert from 'node:assert/strict';
import { LlmProviderHealth, normalizeProviderBaseUrl } from '../providerHealth.js';
import { getProviderHealth, callLlmProvider } from '../llmClient.js';

// ---------------------------------------------------------------------------
// Phase 01 — Foundation Hardening: Provider Health Tests
// ---------------------------------------------------------------------------

// =========================================================================
// SECTION 1: Circuit breaker behavior
// =========================================================================

test('P01 health: new provider starts in closed state', () => {
  const health = new LlmProviderHealth();
  assert.equal(health.canRequest('openai'), true);
  const snap = health.snapshot('openai');
  assert.equal(snap.state, 'closed');
});

test('P01 health: default failure threshold tolerates PIF parallel bursts', () => {
  const health = new LlmProviderHealth();
  for (let i = 0; i < 299; i += 1) {
    health.recordFailure('openai', 'synthetic upstream failure');
  }
  assert.equal(health.canRequest('openai'), true);
  health.recordFailure('openai', 'synthetic upstream failure');
  assert.equal(health.canRequest('openai'), false);
});

test('P01 health: opens circuit after failure threshold', () => {
  const health = new LlmProviderHealth({ failureThreshold: 3 });
  health.recordFailure('openai', 'timeout');
  health.recordFailure('openai', 'timeout');
  assert.equal(health.canRequest('openai'), true);
  health.recordFailure('openai', 'timeout');
  assert.equal(health.canRequest('openai'), false);
  assert.equal(health.snapshot('openai').state, 'open');
});

test('P01 health: circuit resets on success', () => {
  const health = new LlmProviderHealth({ failureThreshold: 2 });
  health.recordFailure('openai', 'err');
  health.recordSuccess('openai');
  assert.equal(health.snapshot('openai').failure_count, 0);
  assert.equal(health.canRequest('openai'), true);
});

test('P01 health: half-open after openMs elapsed', () => {
  let now = 1000;
  const health = new LlmProviderHealth({
    failureThreshold: 1,
    openMs: 5000,
    now: () => now
  });
  health.recordFailure('deepseek', 'err');
  assert.equal(health.canRequest('deepseek'), false);
  now = 6001;
  assert.equal(health.canRequest('deepseek'), true);
  assert.equal(health.snapshot('deepseek').state, 'half_open');
});

test('P01 health: tracks multiple providers independently', () => {
  const health = new LlmProviderHealth({ failureThreshold: 2 });
  health.recordFailure('openai', 'err');
  health.recordFailure('openai', 'err');
  health.recordSuccess('deepseek');
  assert.equal(health.canRequest('openai'), false);
  assert.equal(health.canRequest('deepseek'), true);
});

test('P01 health: route identity isolates access mode, endpoint, and model', () => {
  const health = new LlmProviderHealth({ failureThreshold: 1 });
  const labWriter = {
    provider: 'lab-openai',
    accessMode: 'lab',
    baseUrl: 'http://localhost:5001',
    model: 'gpt-5.4-mini',
  };
  const labResearch = {
    provider: 'lab-openai',
    accessMode: 'lab',
    baseUrl: 'http://localhost:5001',
    model: 'gpt-5.5',
  };
  const apiWriter = {
    provider: 'openai',
    accessMode: 'api',
    baseUrl: 'https://api.openai.com',
    model: 'gpt-5.4-mini',
  };

  health.recordFailure(labWriter, 'timeout');

  assert.equal(health.canRequest(labWriter), false, 'failed lab writer route opens');
  assert.equal(health.canRequest(labResearch), true, 'same provider different model stays closed');
  assert.equal(health.canRequest(apiWriter), true, 'same model through API stays closed');
});

test('P01 health: snapshot all providers', () => {
  const health = new LlmProviderHealth();
  health.recordSuccess('openai');
  health.recordSuccess('deepseek');
  const all = health.snapshot();
  assert.ok(all.openai);
  assert.ok(all.deepseek);
  assert.equal(all.openai.success_count, 1);
});

// =========================================================================
// SECTION 2: Base URL normalization
// =========================================================================

test('P01 url: appends /v1 to api.openai.com', () => {
  assert.equal(normalizeProviderBaseUrl('https://api.openai.com'), 'https://api.openai.com/v1');
});

test('P01 url: does not double-append /v1', () => {
  assert.equal(normalizeProviderBaseUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1');
});

test('P01 url: strips trailing slashes', () => {
  assert.equal(normalizeProviderBaseUrl('https://api.openai.com///'), 'https://api.openai.com/v1');
});

test('P01 url: does not modify deepseek URLs', () => {
  assert.equal(normalizeProviderBaseUrl('https://api.deepseek.com'), 'https://api.deepseek.com');
});

test('P01 url: appends /v1 to localhost', () => {
  assert.equal(normalizeProviderBaseUrl('http://localhost:8000'), 'http://localhost:8000/v1');
});

test('P01 url: handles empty string', () => {
  assert.equal(normalizeProviderBaseUrl(''), '');
});

// =========================================================================
// SECTION 3: callLlmProvider integration — getProviderHealth export
// =========================================================================

test('P01 integration: getProviderHealth returns LlmProviderHealth singleton', () => {
  const health = getProviderHealth();
  assert.ok(health instanceof LlmProviderHealth);
  assert.equal(typeof health.canRequest, 'function');
  assert.equal(typeof health.recordSuccess, 'function');
  assert.equal(typeof health.recordFailure, 'function');
  assert.equal(health.failureThreshold, 300);
});

test('P01 integration: getProviderHealth returns same instance on repeated calls', () => {
  const a = getProviderHealth();
  const b = getProviderHealth();
  assert.equal(a, b);
});

// =========================================================================
// SECTION 4: callLlmProvider providerHealth injection
// =========================================================================

test('P01 injection: callLlmProvider uses injected providerHealth instead of singleton', async () => {
  const injected = new LlmProviderHealth({ failureThreshold: 1 });
  const route = {
    provider: 'openai',
    accessMode: 'api',
    baseUrl: 'https://api.openai.com',
    model: 'test-model',
    apiKey: 'sk-test-fake'
  };
  injected.recordFailure(route, 'forced');

  // callLlmProvider should throw circuit-open using the injected health, not the singleton
  await assert.rejects(
    () => callLlmProvider({
      route,
      system: 'test',
      user: 'test',
      providerHealth: injected
    }),
    (err) => {
      assert.match(err.message, /circuit open/i);
      return true;
    }
  );

  // The module-level singleton should NOT have been affected
  const singleton = getProviderHealth();
  assert.equal(singleton.canRequest(route), true);
});

test('P01 injection: callLlmProvider falls back to singleton when providerHealth omitted', async (t) => {
  const originalFetch = globalThis.fetch;
  const singleton = getProviderHealth();
  const route = {
    provider: 'fallback-test-provider',
    accessMode: 'api',
    baseUrl: 'https://api.openai.com',
    model: 'test-model',
    apiKey: 'sk-test-fake'
  };
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: false,
      status: 401,
      async text() {
        return 'synthetic auth failure';
      }
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    singleton.recordSuccess(route);
  });
  // Without providerHealth param, the singleton is used — canRequest should return true
  // for a provider that hasn't failed on the singleton.
  // We can't fully call through (no real API), but we can verify the circuit check passes
  // by confirming the error is NOT about circuit-open but about the actual API call.
  await assert.rejects(
    () => callLlmProvider({
      route,
      system: 'test',
      user: 'test'
      // no providerHealth — should use singleton
    }),
    (err) => {
      // Should NOT be a circuit-open error (singleton has no failures for this provider)
      assert.doesNotMatch(err.message, /circuit open/i);
      assert.match(err.message, /401: synthetic auth failure/i);
      return true;
    }
  );
  assert.equal(fetchCalls, 1);
});

test('P01 injection: callLlmProvider does not count local abort as provider failure', async (t) => {
  const originalFetch = globalThis.fetch;
  const health = new LlmProviderHealth({ failureThreshold: 1 });
  const route = {
    provider: 'lab-openai',
    accessMode: 'lab',
    baseUrl: 'http://localhost:5001',
    model: 'gpt-5.5',
    apiKey: 'session'
  };
  globalThis.fetch = async () => {
    throw new Error('This operation was aborted');
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    () => callLlmProvider({
      route,
      system: 'test',
      user: 'test',
      providerHealth: health
    }),
    /This operation was aborted/
  );

  assert.equal(health.canRequest(route), true);
  assert.equal(health.snapshot(route).failure_count, 0);
});
