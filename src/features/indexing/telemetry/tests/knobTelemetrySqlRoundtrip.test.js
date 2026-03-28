// WHY: Contract test — SQL insert → read → computeKnobSnapshots applies redaction + sort.

import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import { SpecDb } from '../../../../db/specDb.js';
import { computeKnobSnapshots } from '../knobTelemetryCapture.js';

function createHarness() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

describe('knobSnapshots SQL → computeKnobSnapshots', () => {
  it('empty table returns empty array', () => {
    const specDb = createHarness();
    const rows = specDb.getKnobSnapshots('mouse');
    const result = computeKnobSnapshots(rows);
    deepStrictEqual(result, []);
  });

  it('roundtrip preserves entries and applies redaction', () => {
    const specDb = createHarness();
    const entries = [
      { knob: 'headless', config_value: 'true', default_value: 'true', effective_value: 'true', match: true },
      { knob: 'OPENAI_API_KEY', config_value: 'sk-secret', default_value: '', effective_value: 'sk-secret', match: false },
    ];
    specDb.insertKnobSnapshot({ category: 'mouse', run_id: 'r1', ts: '2026-01-01T00:00:00Z', mismatch_count: 1, total_knobs: 2, entries });

    const rows = specDb.getKnobSnapshots('mouse');
    const result = computeKnobSnapshots(rows);
    strictEqual(result.length, 1);
    strictEqual(result[0].mismatch_count, 1);
    strictEqual(result[0].entries[0].config_value, 'true');
    strictEqual(result[0].entries[1].config_value, '***REDACTED***');
    strictEqual(result[0].entries[1].effective_value, '***REDACTED***');
  });

  it('sorts by ts ascending', () => {
    const specDb = createHarness();
    specDb.insertKnobSnapshot({ category: 'mouse', run_id: 'r2', ts: '2026-01-02T00:00:00Z', mismatch_count: 0, total_knobs: 1, entries: [] });
    specDb.insertKnobSnapshot({ category: 'mouse', run_id: 'r1', ts: '2026-01-01T00:00:00Z', mismatch_count: 1, total_knobs: 1, entries: [] });

    const rows = specDb.getKnobSnapshots('mouse');
    const result = computeKnobSnapshots(rows);
    strictEqual(result.length, 2);
    strictEqual(result[0].run_id, 'r1');
    strictEqual(result[1].run_id, 'r2');
  });
});
