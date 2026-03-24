import test from 'node:test';
import assert from 'node:assert/strict';

import { createLlmHealthCommand } from '../llmHealthCommand.js';

function createDeps(overrides = {}) {
  return {
    runLlmHealthCheck: async ({ storage, config, provider, model }) => ({
      storage_name: storage?.name || null,
      mode: config?.mode || null,
      provider,
      model,
      ok: true,
    }),
    ...overrides,
  };
}

test('llm-health forwards provider/model to health checker and returns payload', async () => {
  const calls = [];
  const commandLlmHealth = createLlmHealthCommand(createDeps({
    runLlmHealthCheck: async (payload) => {
      calls.push(payload);
      return {
        provider: payload.provider,
        model: payload.model,
        ok: true,
        latency_ms: 123,
      };
    },
  }));

  const config = { mode: 'test' };
  const storage = { name: 'stub-storage' };
  const result = await commandLlmHealth(config, storage, {
    provider: 'OpenAI',
    model: 'gpt-5-mini',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].config, config);
  assert.equal(calls[0].storage, storage);
  assert.equal(calls[0].provider, 'openai');
  assert.equal(calls[0].model, 'gpt-5-mini');

  assert.equal(result.command, 'llm-health');
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-5-mini');
  assert.equal(result.ok, true);
  assert.equal(result.latency_ms, 123);
});

test('llm-health normalizes empty provider/model to blank strings', async () => {
  const calls = [];
  const commandLlmHealth = createLlmHealthCommand(createDeps({
    runLlmHealthCheck: async (payload) => {
      calls.push(payload);
      return {
        provider: payload.provider,
        model: payload.model,
        ok: false,
      };
    },
  }));

  const result = await commandLlmHealth({}, {}, {
    provider: '   ',
    model: '   ',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, '');
  assert.equal(calls[0].model, '');
  assert.equal(result.command, 'llm-health');
  assert.equal(result.provider, '');
  assert.equal(result.model, '');
  assert.equal(result.ok, false);
});
