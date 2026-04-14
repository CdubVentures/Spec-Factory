import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

test('runLlmHealthCheck validates response and writes billing JSONL', async () => {
  const storage = makeMemoryStorage();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-health-'));
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
        specDbDir: tmpDir,
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

    // WHY: Health check now writes billing JSONL (dual-state mandate).
    const ledgerDir = path.join(tmpDir, 'global', 'billing', 'ledger');
    const month = new Date().toISOString().slice(0, 7);
    const jsonlPath = path.join(ledgerDir, `${month}.jsonl`);
    assert.ok(fs.existsSync(jsonlPath), 'JSONL billing file should be created for health check');
  } finally {
    global.fetch = originalFetch;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
