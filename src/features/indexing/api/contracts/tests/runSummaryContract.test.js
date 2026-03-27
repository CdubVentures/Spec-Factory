// WHY: Contract test verifying run-summary.json shape constants are frozen,
// complete, and internally consistent. If a field is added to the serializer
// but not to the contract, these tests catch the drift.

import { describe, it } from 'node:test';
import { deepStrictEqual, ok, strictEqual } from 'node:assert';

import {
  RUN_SUMMARY_SCHEMA_VERSION,
  RUN_SUMMARY_META_SHAPE,
  RUN_SUMMARY_META_KEYS,
  RUN_SUMMARY_EVENT_SHAPE,
  RUN_SUMMARY_EVENT_KEYS,
  RUN_SUMMARY_LLM_AGG_SHAPE,
  RUN_SUMMARY_LLM_AGG_KEYS,
  RUN_SUMMARY_OBSERVABILITY_SHAPE,
  RUN_SUMMARY_OBSERVABILITY_KEYS,
  RUN_SUMMARY_TOP_KEYS,
  RUN_SUMMARY_TELEMETRY_KEYS,
} from '../runSummaryContract.js';

const sorted = (arr) => [...arr].sort();

describe('runSummaryContract — schema version', () => {
  it('schema_version is a positive integer', () => {
    strictEqual(typeof RUN_SUMMARY_SCHEMA_VERSION, 'number');
    ok(RUN_SUMMARY_SCHEMA_VERSION >= 1, 'schema_version >= 1');
    strictEqual(RUN_SUMMARY_SCHEMA_VERSION, Math.floor(RUN_SUMMARY_SCHEMA_VERSION), 'integer');
  });
});

describe('runSummaryContract — top-level envelope', () => {
  it('TOP_KEYS contains schema_version and telemetry', () => {
    deepStrictEqual(sorted(RUN_SUMMARY_TOP_KEYS), sorted(['schema_version', 'telemetry']));
  });

  it('TELEMETRY_KEYS contains meta, events, llm_agg, observability', () => {
    deepStrictEqual(
      sorted(RUN_SUMMARY_TELEMETRY_KEYS),
      sorted(['meta', 'events', 'llm_agg', 'observability'])
    );
  });
});

describe('runSummaryContract — meta shape', () => {
  it('shape is frozen', () => {
    ok(Object.isFrozen(RUN_SUMMARY_META_SHAPE), 'META_SHAPE must be frozen');
    ok(Object.isFrozen(RUN_SUMMARY_META_KEYS), 'META_KEYS must be frozen');
  });

  it('keys array matches shape keys', () => {
    deepStrictEqual(RUN_SUMMARY_META_KEYS, RUN_SUMMARY_META_SHAPE.map(s => s.key));
  });

  it('contains required run identity fields', () => {
    const keys = RUN_SUMMARY_META_KEYS;
    for (const required of ['run_id', 'category', 'product_id', 'status', 'started_at', 'ended_at']) {
      ok(keys.includes(required), `META_KEYS must include ${required}`);
    }
  });

  it('contains counter and stage fields', () => {
    const keys = RUN_SUMMARY_META_KEYS;
    for (const required of ['counters', 'stages', 'startup_ms', 'phase_cursor']) {
      ok(keys.includes(required), `META_KEYS must include ${required}`);
    }
  });

  it('contains identity fields', () => {
    const keys = RUN_SUMMARY_META_KEYS;
    for (const required of ['identity_fingerprint', 'identity_lock_status', 'dedupe_mode']) {
      ok(keys.includes(required), `META_KEYS must include ${required}`);
    }
  });

  it('every shape entry has key and coerce', () => {
    for (const entry of RUN_SUMMARY_META_SHAPE) {
      ok(typeof entry.key === 'string' && entry.key.length > 0, `entry must have non-empty key`);
      ok(typeof entry.coerce === 'string', `${entry.key} must have coerce`);
    }
  });
});

describe('runSummaryContract — event shape', () => {
  it('shape is frozen', () => {
    ok(Object.isFrozen(RUN_SUMMARY_EVENT_SHAPE), 'EVENT_SHAPE must be frozen');
    ok(Object.isFrozen(RUN_SUMMARY_EVENT_KEYS), 'EVENT_KEYS must be frozen');
  });

  it('keys match bridge_events table columns', () => {
    deepStrictEqual(
      sorted(RUN_SUMMARY_EVENT_KEYS),
      sorted(['run_id', 'category', 'product_id', 'ts', 'stage', 'event', 'payload'])
    );
  });
});

describe('runSummaryContract — llm_agg shape', () => {
  it('shape is frozen', () => {
    ok(Object.isFrozen(RUN_SUMMARY_LLM_AGG_SHAPE), 'LLM_AGG_SHAPE must be frozen');
    ok(Object.isFrozen(RUN_SUMMARY_LLM_AGG_KEYS), 'LLM_AGG_KEYS must be frozen');
  });

  it('keys array matches shape keys', () => {
    deepStrictEqual(RUN_SUMMARY_LLM_AGG_KEYS, RUN_SUMMARY_LLM_AGG_SHAPE.map(s => s.key));
  });

  it('contains core LLM aggregate fields', () => {
    const keys = RUN_SUMMARY_LLM_AGG_KEYS;
    for (const required of ['total_calls', 'completed_calls', 'failed_calls', 'total_cost']) {
      ok(keys.includes(required), `LLM_AGG_KEYS must include ${required}`);
    }
  });

  it('contains token breakdown fields', () => {
    const keys = RUN_SUMMARY_LLM_AGG_KEYS;
    for (const required of ['total_prompt_tokens', 'total_completion_tokens']) {
      ok(keys.includes(required), `LLM_AGG_KEYS must include ${required}`);
    }
  });

  it('contains breakdown maps', () => {
    const keys = RUN_SUMMARY_LLM_AGG_KEYS;
    for (const required of ['calls_by_type', 'calls_by_model']) {
      ok(keys.includes(required), `LLM_AGG_KEYS must include ${required}`);
    }
  });
});

describe('runSummaryContract — observability shape', () => {
  it('shape is frozen', () => {
    ok(Object.isFrozen(RUN_SUMMARY_OBSERVABILITY_SHAPE), 'OBSERVABILITY_SHAPE must be frozen');
    ok(Object.isFrozen(RUN_SUMMARY_OBSERVABILITY_KEYS), 'OBSERVABILITY_KEYS must be frozen');
  });

  it('keys array matches shape keys', () => {
    deepStrictEqual(RUN_SUMMARY_OBSERVABILITY_KEYS, RUN_SUMMARY_OBSERVABILITY_SHAPE.map(s => s.key));
  });

  it('contains all bridge observability counters', () => {
    const keys = RUN_SUMMARY_OBSERVABILITY_KEYS;
    for (const required of [
      'search_finish_without_start', 'search_slot_reuse', 'search_unique_slots',
      'llm_missing_telemetry', 'llm_orphan_finish',
      'bridge_event_errors', 'bridge_finalize_errors',
    ]) {
      ok(keys.includes(required), `OBSERVABILITY_KEYS must include ${required}`);
    }
  });
});

describe('runSummaryContract — no duplicate keys', () => {
  for (const [name, shape] of [
    ['META', RUN_SUMMARY_META_SHAPE],
    ['EVENT', RUN_SUMMARY_EVENT_SHAPE],
    ['LLM_AGG', RUN_SUMMARY_LLM_AGG_SHAPE],
    ['OBSERVABILITY', RUN_SUMMARY_OBSERVABILITY_SHAPE],
  ]) {
    it(`${name}_SHAPE has no duplicate keys`, () => {
      const keys = shape.map(s => s.key);
      const unique = [...new Set(keys)];
      deepStrictEqual(keys.length, unique.length, `${name}_SHAPE has duplicate keys`);
    });
  }
});
