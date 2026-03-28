// WHY: Contract test — SQL insert → read → pure aggregation produces correct prompt summary.

import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { SpecDb } from '../../../../../db/specDb.js';
import { computePromptIndexSummary } from '../createPromptIndex.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

describe('promptIndex SQL → computePromptIndexSummary', () => {
  it('empty table returns zeroed summary', () => {
    const specDb = createHarness();
    const rows = specDb.getPromptIndexByCategory('mouse');
    const summary = computePromptIndexSummary(rows);
    strictEqual(summary.total_calls, 0);
    strictEqual(summary.total_tokens, 0);
    strictEqual(summary.unique_versions, 0);
  });

  it('single row produces correct summary', () => {
    const specDb = createHarness();
    specDb.insertPromptIndexEntry({
      category: 'mouse', run_id: 'r1', prompt_version: 'extract',
      model: 'claude-haiku-4', token_count: 500, success: true,
      ts: '2026-01-01T00:00:00Z',
    });
    const rows = specDb.getPromptIndexByCategory('mouse');
    const summary = computePromptIndexSummary(rows);
    strictEqual(summary.total_calls, 1);
    strictEqual(summary.total_tokens, 500);
    strictEqual(summary.unique_versions, 1);
    strictEqual(summary.versions[0].version, 'extract');
    strictEqual(summary.versions[0].success_rate, 1);
  });

  it('multiple models produce correct model_breakdown', () => {
    const specDb = createHarness();
    specDb.insertPromptIndexEntry({ category: 'mouse', run_id: 'r1', prompt_version: 'extract', model: 'claude-haiku-4', token_count: 500, success: true, ts: '2026-01-01T00:00:00Z' });
    specDb.insertPromptIndexEntry({ category: 'mouse', run_id: 'r1', prompt_version: 'extract', model: 'claude-haiku-4', token_count: 300, success: true, ts: '2026-01-01T00:01:00Z' });
    specDb.insertPromptIndexEntry({ category: 'mouse', run_id: 'r1', prompt_version: 'serp', model: 'gpt-4o-mini', token_count: 1000, success: false, ts: '2026-01-01T00:02:00Z' });

    const rows = specDb.getPromptIndexByCategory('mouse');
    const summary = computePromptIndexSummary(rows);
    strictEqual(summary.total_calls, 3);
    strictEqual(summary.total_tokens, 1800);
    strictEqual(summary.unique_versions, 2);
    ok(summary.model_breakdown['claude-haiku-4']);
    strictEqual(summary.model_breakdown['claude-haiku-4'].call_count, 2);
    strictEqual(summary.model_breakdown['gpt-4o-mini'].call_count, 1);
  });
});
