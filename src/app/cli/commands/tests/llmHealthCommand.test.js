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

test('llm-health returns the normalized provider and model in its command payload', async () => {
  const commandLlmHealth = createLlmHealthCommand(createDeps({
    runLlmHealthCheck: async ({ provider, model }) => ({
      provider,
      model,
      ok: true,
      latency_ms: 123,
    }),
  }));

  const result = await commandLlmHealth(
    { mode: 'test' },
    { name: 'stub-storage' },
    { provider: 'OpenAI', model: 'gpt-5-mini' },
  );

  assert.deepEqual(result, {
    command: 'llm-health',
    provider: 'openai',
    model: 'gpt-5-mini',
    ok: true,
    latency_ms: 123,
  });
});

test('llm-health normalizes empty provider and model to blank strings', async () => {
  const commandLlmHealth = createLlmHealthCommand(createDeps({
    runLlmHealthCheck: async ({ provider, model }) => ({
      provider,
      model,
      ok: false,
    }),
  }));

  const result = await commandLlmHealth({}, {}, {
    provider: '   ',
    model: '   ',
  });

  assert.deepEqual(result, {
    command: 'llm-health',
    provider: '',
    model: '',
    ok: false,
  });
});
