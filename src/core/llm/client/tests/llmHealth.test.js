import test from 'node:test';
import assert from 'node:assert/strict';
import { runLlmHealthCheck } from '../healthCheck.js';

function makeMemoryStorage() {
  const map = new Map();
  return {
    map,
    resolveOutputKey(...parts) {
      return ['specs/outputs', ...parts].join('/');
    },
    async readTextOrNull(key) {
      const row = map.get(key);
      return row ? row.toString('utf8') : null;
    },
    async readJsonOrNull(key) {
      const row = map.get(key);
      return row ? JSON.parse(row.toString('utf8')) : null;
    },
    async writeObject(key, body) {
      map.set(key, Buffer.isBuffer(body) ? body : Buffer.from(body));
    }
  };
}

test('runLlmHealthCheck validates response and writes billing ledger', async () => {
  const storage = makeMemoryStorage();
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        model: 'deepseek-reasoner',
        usage: {
          prompt_tokens: 120,
          completion_tokens: 40,
          total_tokens: 160
        },
        choices: [
          {
            message: {
              content: JSON.stringify({
                ok: true,
                provider: 'deepseek',
                model: 'deepseek-reasoner',
                echo: 'hello',
                reasoning_used: true
              })
            }
          }
        ]
      });
    }
  });

  try {
    const result = await runLlmHealthCheck({
      storage,
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      config: {
        deepseekApiKey: 'ds-test',
        llmProvider: 'deepseek',
        llmBaseUrl: 'https://api.deepseek.com',
        llmReasoningMode: true,
        llmReasoningBudget: 2048,
        llmTimeoutMs: 5_000,
        llmCostInputPer1M: 0.28,
        llmCostOutputPer1M: 0.42,
        llmCostCachedInputPer1M: 0
      }
    });

    assert.equal(result.response_ok, true);
    assert.equal(result.response_json_valid, true);
    assert.equal(result.provider_resolved, 'deepseek');
    assert.equal(result.model, 'deepseek-reasoner');
    assert.equal(result.prompt_tokens > 0, true);
    assert.equal(result.cost_usd >= 0, true);

    // WHY: Step 17 — billing writes are SQL-only. healthCheck doesn't pass
    // specDb, so no billing persistence. Verify no NDJSON files created.
    const hasLedger = [...storage.map.keys()].some((key) => key.includes('_billing/ledger/'));
    assert.equal(hasLedger, false, 'no NDJSON billing files without specDb');
  } finally {
    global.fetch = originalFetch;
  }
});
