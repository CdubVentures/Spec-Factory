import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { appendCostLedgerEntry } from '../costLedger.js';

function makeEntry(overrides = {}) {
  return {
    ts: '2026-03-27T10:00:00.000Z',
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    category: 'mouse',
    productId: 'mouse-test',
    runId: 'run-parity-001',
    round: 0,
    prompt_tokens: 500,
    completion_tokens: 200,
    cached_prompt_tokens: 0,
    total_tokens: 700,
    cost_usd: 0.00042,
    reason: 'extract',
    host: 'example.com',
    url_count: 1,
    evidence_chars: 1200,
    estimated_usage: false,
    ...overrides,
  };
}

function makeTmpConfig() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'billing-parity-'));
  return { config: { specDbDir: tmpDir }, tmpDir };
}

test('appendCostLedgerEntry writes to SQL when appDb is provided', async () => {
  const inserted = [];
  const appDb = {
    insertBillingEntry(entry) { inserted.push(entry); },
  };
  const { config, tmpDir } = makeTmpConfig();

  try {
    await appendCostLedgerEntry({ config, entry: makeEntry(), appDb });

    assert.equal(inserted.length, 1, 'insertBillingEntry should be called once');
    const row = inserted[0];
    assert.equal(row.ts, '2026-03-27T10:00:00.000Z');
    assert.equal(row.month, '2026-03');
    assert.equal(row.day, '2026-03-27');
    assert.equal(row.provider, 'deepseek');
    assert.equal(row.model, 'deepseek-reasoner');
    assert.equal(row.category, 'mouse');
    assert.equal(row.product_id, 'mouse-test');
    assert.equal(row.run_id, 'run-parity-001');
    assert.equal(row.prompt_tokens, 500);
    assert.equal(row.completion_tokens, 200);
    assert.equal(row.cost_usd, 0.00042);
    assert.equal(row.reason, 'extract');
    assert.equal(row.estimated_usage, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('appendCostLedgerEntry writes JSONL alongside SQL', async () => {
  const appDb = { insertBillingEntry() {} };
  const { config, tmpDir } = makeTmpConfig();

  try {
    await appendCostLedgerEntry({ config, entry: makeEntry(), appDb });

    const ledgerDir = path.join(tmpDir, 'global', 'billing', 'ledger');
    const jsonlPath = path.join(ledgerDir, '2026-03.jsonl');
    assert.ok(fs.existsSync(jsonlPath), 'JSONL file should exist');
    const content = fs.readFileSync(jsonlPath, 'utf8').trim();
    const parsed = JSON.parse(content);
    assert.equal(parsed.provider, 'deepseek');
    assert.equal(parsed.productId, 'mouse-test');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('appendCostLedgerEntry writes JSONL even without appDb', async () => {
  const { config, tmpDir } = makeTmpConfig();

  try {
    const result = await appendCostLedgerEntry({ config, entry: makeEntry(), appDb: null });

    assert.ok(result.entry, 'normalized entry should still be returned');
    const ledgerDir = path.join(tmpDir, 'global', 'billing', 'ledger');
    const jsonlPath = path.join(ledgerDir, '2026-03.jsonl');
    assert.ok(fs.existsSync(jsonlPath), 'JSONL should be written even without appDb');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
