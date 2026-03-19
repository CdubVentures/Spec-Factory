import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQueryRows, planUberQueries } from '../src/research/queryPlanner.js';

function makeChatCompletionResponse(payload) {
  return {
    ok: true,
    async text() {
      return JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(payload)
            }
          }
        ]
      });
    }
  };
}

test('planUberQueries makes single LLM call and dedupes output', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const model = String(body?.model || '');
    calls.push(model);
    return makeChatCompletionResponse({
      queries: [
        'logitech g pro x superlight 2 specs',
        'logitech g pro x superlight 2 support',
        'logitech g pro x superlight 2 latency test',
        'logitech g pro x superlight 2 support'
      ]
    });
  };

  try {
    const result = await planUberQueries({
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.openai.com',
        llmProvider: 'openai',
        llmModelPlan: 'gpt-5-low',
        llmTimeoutMs: 5_000
      },
      identity: { brand: 'Logitech', model: 'G Pro X Superlight 2', variant: '' },
      missingFields: ['click_latency', 'sensor'],
      missingCriticalFields: ['click_latency'],
      baseQueries: ['logitech g pro x superlight 2 specs'],
      llmContext: {}
    });

    // WHY: Single planner call — one LLM call
    assert.equal(calls.length, 1);
    assert.ok(result.queries.includes('logitech g pro x superlight 2 support'));
    assert.ok(result.queries.includes('logitech g pro x superlight 2 latency test'));
    // Dedup: duplicate "support" query collapsed to 1
    assert.equal(
      result.queries.filter((q) => q === 'logitech g pro x superlight 2 support').length,
      1
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('planUberQueries includes missingCriticalFields in prompt payload', async () => {
  const originalFetch = global.fetch;
  let capturedPayload = null;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const messages = body?.messages || [];
    const userMsg = messages.find((m) => m.role === 'user');
    if (userMsg) capturedPayload = JSON.parse(userMsg.content);
    return makeChatCompletionResponse({ queries: ['test query'] });
  };

  try {
    await planUberQueries({
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.openai.com',
        llmProvider: 'openai',
        llmModelPlan: 'gpt-5-low',
        llmTimeoutMs: 5_000
      },
      identity: { brand: 'Razer', model: 'Viper V3 Pro', variant: '' },
      missingFields: ['click_latency', 'sensor', 'weight'],
      missingCriticalFields: ['click_latency', 'sensor'],
      baseQueries: [],
      llmContext: {}
    });

    assert.ok(capturedPayload, 'payload captured');
    assert.deepEqual(capturedPayload.missing_critical_fields, ['click_latency', 'sensor']);
    assert.ok(capturedPayload.identity_lock.brand === 'Razer');
  } finally {
    global.fetch = originalFetch;
  }
});

test('planUberQueries uses reason search_planner', async () => {
  const originalFetch = global.fetch;
  let capturedBody = null;
  global.fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body || '{}'));
    return makeChatCompletionResponse({ queries: ['test'] });
  };

  try {
    await planUberQueries({
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.openai.com',
        llmProvider: 'openai',
        llmModelPlan: 'gpt-5-low',
        llmTimeoutMs: 5_000
      },
      identity: { brand: 'Razer', model: 'Viper V3 Pro' },
      missingFields: ['weight'],
      baseQueries: [],
      llmContext: {}
    });

    const systemMsg = capturedBody?.messages?.find((m) => m.role === 'system');
    assert.ok(systemMsg?.content?.includes('NEVER put domain names'), 'system prompt includes domain name ban');
  } finally {
    global.fetch = originalFetch;
  }
});

test('normalizeQueryRows converts flat string array to structured rows with empty target_fields', () => {
  const result = normalizeQueryRows(['q1', 'q2']);
  assert.deepEqual(result, [
    { query: 'q1', target_fields: [] },
    { query: 'q2', target_fields: [] }
  ]);
});

test('normalizeQueryRows preserves structured rows with target_fields', () => {
  const result = normalizeQueryRows([
    { query: 'q1', target_fields: ['dpi', 'sensor'] },
    { query: 'q2', target_fields: [] }
  ]);
  assert.deepEqual(result, [
    { query: 'q1', target_fields: ['dpi', 'sensor'] },
    { query: 'q2', target_fields: [] }
  ]);
});

test('normalizeQueryRows handles mixed array of strings and objects', () => {
  const result = normalizeQueryRows([
    'plain query',
    { query: 'structured query', target_fields: ['weight'] }
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].query, 'plain query');
  assert.deepEqual(result[0].target_fields, []);
  assert.equal(result[1].query, 'structured query');
  assert.deepEqual(result[1].target_fields, ['weight']);
});
