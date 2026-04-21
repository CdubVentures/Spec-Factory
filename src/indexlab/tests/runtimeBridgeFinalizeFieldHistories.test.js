// WHY: Finalization helper for field_histories. At run end, we merge prior
// histories with this-run's provenance + queries via buildFieldHistories(),
// then persist as `run_artifacts.artifact_type='field_histories'`. This
// artifact feeds the next run's roundContext.previousFieldHistories (the
// tier-3 3a→3b→3c→3d progression driver).

import { describe, it } from 'node:test';
import { ok, strictEqual, deepStrictEqual } from 'node:assert';
import { SpecDb } from '../../db/specDb.js';
import { finalizeFieldHistories } from '../finalizeFieldHistories.js';

function makeDb() {
  return new SpecDb({ dbPath: ':memory:', category: 'mouse' });
}

function makeRunSummary(searchPlanQueries = []) {
  return {
    telemetry: {
      events: [
        { event: 'search_plan_generated', payload: { queries_generated: searchPlanQueries } },
      ],
    },
  };
}

describe('finalizeFieldHistories', () => {
  it('calls buildFieldHistories with prior + provenance + queries, upserts artifact, returns histories', () => {
    const specDb = makeDb();
    const priorHistories = {
      weight: { query_count: 2, existing_queries: ['old q1'], domains_tried: ['old.com'] },
    };
    const fieldProvenance = {
      weight: { evidence: [{ rootDomain: 'new.com', url: 'https://new.com/a' }] },
    };
    const searchPlanQueries = [
      { query: 'Cooler Master MM731 weight', target_fields: ['weight'] },
      { query: 'Cooler Master MM731 dpi', target_fields: ['dpi'] },
    ];

    const result = finalizeFieldHistories({
      specDb, runId: 'run-fin-1', productId: 'mouse-abc', category: 'mouse',
      fieldProvenance, priorFieldHistories: priorHistories,
      runSummary: makeRunSummary(searchPlanQueries),
      duplicatesSuppressed: 0,
    });

    // histories returned for weight must reflect query_count progression
    ok(result.weight, 'weight history present');
    strictEqual(result.weight.query_count, 3, 'prior 2 + 1 new query targeting weight = 3');
    // new domain accumulated
    ok(result.weight.domains_tried.includes('new.com'));
    ok(result.weight.domains_tried.includes('old.com'));
    // dpi is fresh this run
    ok(result.dpi, 'dpi history created');
    strictEqual(result.dpi.query_count, 1);

    // artifact persisted
    const artifact = specDb.getRunArtifact('run-fin-1', 'field_histories');
    ok(artifact, 'field_histories artifact persisted');
    strictEqual(artifact.artifact_type, 'field_histories');
    deepStrictEqual(artifact.payload, result);
  });

  it('idempotent upsert: calling twice on the same run_id updates (no duplicate rows)', () => {
    const specDb = makeDb();
    finalizeFieldHistories({
      specDb, runId: 'run-fin-2', productId: 'mouse-abc', category: 'mouse',
      fieldProvenance: {}, priorFieldHistories: {},
      runSummary: makeRunSummary([{ query: 'q1', target_fields: ['weight'] }]),
    });
    finalizeFieldHistories({
      specDb, runId: 'run-fin-2', productId: 'mouse-abc', category: 'mouse',
      fieldProvenance: {}, priorFieldHistories: {},
      runSummary: makeRunSummary([{ query: 'q1', target_fields: ['weight'] }, { query: 'q2', target_fields: ['weight'] }]),
    });
    const artifact = specDb.getRunArtifact('run-fin-2', 'field_histories');
    strictEqual(artifact.payload.weight.query_count, 2, 'second call overwrites with fresh count');
  });

  it('empty provenance + empty queries yields empty histories and no crash', () => {
    const specDb = makeDb();
    const result = finalizeFieldHistories({
      specDb, runId: 'run-fin-3', productId: 'mouse-abc', category: 'mouse',
      fieldProvenance: {}, priorFieldHistories: {},
      runSummary: { telemetry: { events: [] } },
    });
    deepStrictEqual(result, {});
    const artifact = specDb.getRunArtifact('run-fin-3', 'field_histories');
    ok(artifact, 'artifact still written even for empty histories (audit trail)');
    deepStrictEqual(artifact.payload, {});
  });

  it('no-ops when specDb is missing (graceful)', () => {
    const result = finalizeFieldHistories({
      specDb: null, runId: 'run-fin-4', productId: 'mouse-abc', category: 'mouse',
      fieldProvenance: {}, priorFieldHistories: {},
      runSummary: makeRunSummary([]),
    });
    deepStrictEqual(result, {});
  });

  it('reads enhancement_rows if queries_generated is missing (fallback)', () => {
    const specDb = makeDb();
    const runSummary = {
      telemetry: {
        events: [{
          event: 'search_plan_generated',
          payload: {
            enhancement_rows: [
              { query: 'q1', target_fields: ['weight'] },
              { query: 'q2', target_fields: ['weight'] },
            ],
          },
        }],
      },
    };
    const result = finalizeFieldHistories({
      specDb, runId: 'run-fin-5', productId: 'mouse-abc', category: 'mouse',
      fieldProvenance: {}, priorFieldHistories: {},
      runSummary,
    });
    strictEqual(result.weight.query_count, 2);
  });
});
