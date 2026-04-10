import test from 'node:test';
import assert from 'node:assert/strict';
import { callLlmProvider } from '../llmClient.js';

test('callLlmProvider redacts API key from logged and thrown errors', async () => {
  const secret = 'sk-test-secret';
  const originalFetch = global.fetch;
  const warnings = [];
  global.fetch = async () => ({
    ok: false,
    status: 500,
    async text() {
      return `upstream failure with key=${secret}`;
    }
  });

  try {
    await assert.rejects(
      () =>
        callLlmProvider({
          model: 'test-model',
          system: 'system',
          user: 'user',
          jsonSchema: {
            type: 'object',
            properties: {},
            required: []
          },
          apiKey: secret,
          baseUrl: 'https://api.openai.com',
          logger: {
            warn(event, payload) {
              warnings.push({ event, payload });
            }
          }
        }),
      /redacted|OpenAI API error/
    );
  } finally {
    global.fetch = originalFetch;
  }

  assert.ok(warnings.length >= 1);
  assert.ok(warnings.some((row) => row.event === 'llm_call_failed'));
  for (const warning of warnings) {
    assert.equal(String(warning.payload.message).includes(secret), false);
  }
});

// ---------------------------------------------------------------------------
// rawTextMode
// ---------------------------------------------------------------------------

function mockFetchOk(content) {
  return async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        choices: [{ message: { content } }],
        model: 'test-model',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      });
    },
  });
}

test('rawTextMode true returns raw content string, not parsed JSON', async () => {
  const originalFetch = global.fetch;
  const rawContent = 'Here are the research findings: 5 editions found, 7 colors.';
  global.fetch = mockFetchOk(rawContent);

  try {
    const result = await callLlmProvider({
      model: 'test-model',
      system: 'system',
      user: 'user',
      jsonSchema: null,
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com',
      rawTextMode: true,
    });
    assert.equal(typeof result, 'string');
    assert.equal(result, rawContent);
  } finally {
    global.fetch = originalFetch;
  }
});

test('rawTextMode false (default) returns parsed JSON object', async () => {
  const originalFetch = global.fetch;
  const jsonContent = '{"editions": 5, "colors": 7}';
  global.fetch = mockFetchOk(jsonContent);

  try {
    const result = await callLlmProvider({
      model: 'test-model',
      system: 'system',
      user: 'user',
      jsonSchema: { type: 'object', properties: { editions: { type: 'number' }, colors: { type: 'number' } }, required: ['editions', 'colors'] },
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com',
    });
    assert.equal(typeof result, 'object');
    assert.deepEqual(result, { editions: 5, colors: 7 });
  } finally {
    global.fetch = originalFetch;
  }
});
