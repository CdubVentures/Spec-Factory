// WHY: Contract tests for the 4 telemetry index SQL tables.
// Verifies insert + read roundtrip, JSON column handling, and boolean coercion.

import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'node:assert';
import { SpecDb } from '../specDb.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

describe('telemetryIndexStore — knob_snapshots', () => {
  it('insert + read roundtrip preserves entries JSON', () => {
    const specDb = createHarness();
    const entries = [{ knob: 'stealthEnabled', match: true }, { knob: 'headless', match: false }];
    specDb.insertKnobSnapshot({ category: 'mouse', run_id: 'run-1', ts: '2026-03-28T00:00:00Z', mismatch_count: 1, total_knobs: 2, entries });

    const rows = specDb.getKnobSnapshots('mouse', 10);
    strictEqual(rows.length, 1);
    strictEqual(rows[0].run_id, 'run-1');
    strictEqual(rows[0].mismatch_count, 1);
    deepStrictEqual(rows[0].entries, entries);
  });
});

describe('telemetryIndexStore — query_index', () => {
  it('insert + read roundtrip preserves field_yield JSON', () => {
    const specDb = createHarness();
    specDb.insertQueryIndexEntry({ category: 'mouse', run_id: 'run-1', product_id: 'prod-1', query: 'razer viper', provider: 'searxng', result_count: 10, field_yield: ['weight', 'dpi'], ts: '2026-03-28T00:00:00Z' });

    const rows = specDb.getQueryIndexByCategory('mouse', 10);
    strictEqual(rows.length, 1);
    strictEqual(rows[0].query, 'razer viper');
    deepStrictEqual(rows[0].field_yield, ['weight', 'dpi']);
  });
});

describe('telemetryIndexStore — url_index', () => {
  it('insert + read roundtrip coerces fetch_success to boolean', () => {
    const specDb = createHarness();
    specDb.insertUrlIndexEntry({ category: 'mouse', run_id: 'run-1', url: 'https://example.com', host: 'example.com', tier: 't1', doc_kind: 'spec', fields_filled: ['weight'], fetch_success: true, ts: '2026-03-28T00:00:00Z' });

    const rows = specDb.getUrlIndexByCategory('mouse', 10);
    strictEqual(rows.length, 1);
    strictEqual(rows[0].fetch_success, true);
    deepStrictEqual(rows[0].fields_filled, ['weight']);
  });
});

describe('telemetryIndexStore — prompt_index', () => {
  it('insert + read roundtrip coerces success to boolean', () => {
    const specDb = createHarness();
    specDb.insertPromptIndexEntry({ category: 'mouse', run_id: 'run-1', prompt_version: 'extract', model: 'claude-haiku-4', token_count: 500, success: true, ts: '2026-03-28T00:00:00Z' });

    const rows = specDb.getPromptIndexByCategory('mouse', 10);
    strictEqual(rows.length, 1);
    strictEqual(rows[0].prompt_version, 'extract');
    strictEqual(rows[0].success, true);
    strictEqual(rows[0].token_count, 500);
  });
});
