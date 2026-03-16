import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompletedPhase08BatchRow,
  buildPhase08ExtractionPayload,
  createEmptyPhase08,
  mergePhase08FieldContexts,
  mergePhase08PrimeRows
} from '../phase08Extraction.js';

test('createEmptyPhase08 returns the default extraction payload shape', () => {
  const result = createEmptyPhase08({ nowIso: '2026-03-11T00:00:00.000Z' });

  assert.deepEqual(result, {
    generated_at: '2026-03-11T00:00:00.000Z',
    summary: {
      batch_count: 0,
      batch_error_count: 0,
      schema_fail_rate: 0,
      raw_candidate_count: 0,
      accepted_candidate_count: 0,
      dangling_snippet_ref_count: 0,
      dangling_snippet_ref_rate: 0,
      evidence_policy_violation_count: 0,
      evidence_policy_violation_rate: 0,
      min_refs_satisfied_count: 0,
      min_refs_total: 0,
      min_refs_satisfied_rate: 0
    },
    batches: [],
    field_contexts: {},
    prime_sources: {
      rows: []
    }
  });
});

test('mergePhase08 helpers preserve first field context and dedupe prime rows', () => {
  const fieldContexts = mergePhase08FieldContexts(
    {
      sensor: { label: 'First sensor context' }
    },
    {
      sensor: { label: 'Second sensor context' },
      dpi: { label: 'DPI context' }
    }
  );
  const primeRows = mergePhase08PrimeRows(
    [{ field_key: 'sensor', snippet_id: 'ref-sensor', url: 'https://example.com/spec' }],
    [
      { field_key: 'sensor', snippet_id: 'ref-sensor', url: 'https://example.com/spec' },
      { field_key: 'dpi', snippet_id: 'ref-dpi', url: 'https://example.com/spec' }
    ]
  );

  assert.deepEqual(fieldContexts, {
    sensor: { label: 'First sensor context' },
    dpi: { label: 'DPI context' }
  });
  assert.deepEqual(primeRows, [
    { field_key: 'sensor', snippet_id: 'ref-sensor', url: 'https://example.com/spec' },
    { field_key: 'dpi', snippet_id: 'ref-dpi', url: 'https://example.com/spec' }
  ]);
});

test('buildCompletedPhase08BatchRow computes completed batch metrics from sanitized output', () => {
  const result = buildCompletedPhase08BatchRow({
    batchId: 'batch-1',
    routeReason: 'extract_batch:batch-1',
    model: 'fast-model',
    batchFields: ['sensor', 'weight'],
    promptEvidence: {
      snippets: [{ id: 'ref-sensor' }, { id: 'ref-weight' }],
      references: [{ id: 'ref-sensor' }, { id: 'ref-weight' }]
    },
    sanitized: {
      fieldCandidates: [
        {
          field: 'sensor',
          evidenceRefs: ['ref-sensor', 'ref-weight']
        },
        {
          field: 'weight',
          evidenceRefs: ['ref-weight']
        }
      ],
      metrics: {
        raw_candidate_count: 3,
        accepted_candidate_count: 2,
        dropped_missing_refs: 1,
        dropped_invalid_refs: 0,
        dropped_evidence_verifier: 0
      }
    },
    minEvidenceRefsByField: {
      sensor: 2,
      weight: 2
    },
    elapsedMs: 45
  });

  assert.deepEqual(result, {
    batch_id: 'batch-1',
    status: 'completed',
    route_reason: 'extract_batch:batch-1',
    model: 'fast-model',
    target_field_count: 2,
    snippet_count: 2,
    reference_count: 2,
    raw_candidate_count: 3,
    accepted_candidate_count: 2,
    dropped_missing_refs: 1,
    dropped_invalid_refs: 0,
    dropped_evidence_verifier: 0,
    min_refs_satisfied_count: 1,
    min_refs_total: 2,
    elapsed_ms: 45
  });
});

test('buildPhase08ExtractionPayload aggregates summary statistics and caps prime rows', () => {
  const primeRows = Array.from({ length: 130 }, (_, index) => ({
    field_key: `field-${index}`,
    snippet_id: `snippet-${index}`,
    url: `https://example.com/${index}`
  }));

  const result = buildPhase08ExtractionPayload({
    batchRows: [
      {
        status: 'completed',
        raw_candidate_count: 6,
        accepted_candidate_count: 4,
        dropped_invalid_refs: 1,
        dropped_missing_refs: 1,
        dropped_evidence_verifier: 0,
        min_refs_satisfied_count: 3,
        min_refs_total: 4
      },
      {
        status: 'failed',
        raw_candidate_count: 2,
        accepted_candidate_count: 0,
        dropped_invalid_refs: 0,
        dropped_missing_refs: 0,
        dropped_evidence_verifier: 1,
        min_refs_satisfied_count: 0,
        min_refs_total: 1
      }
    ],
    batchErrorCount: 1,
    fieldContexts: {
      sensor: { label: 'Sensor' }
    },
    primeRows,
    nowIso: '2026-03-11T01:02:03.000Z'
  });

  assert.equal(result.generated_at, '2026-03-11T01:02:03.000Z');
  assert.deepEqual(result.summary, {
    batch_count: 2,
    batch_error_count: 1,
    schema_fail_rate: 0.5,
    raw_candidate_count: 8,
    accepted_candidate_count: 4,
    dangling_snippet_ref_count: 1,
    dangling_snippet_ref_rate: 0.125,
    evidence_policy_violation_count: 3,
    evidence_policy_violation_rate: 0.375,
    min_refs_satisfied_count: 3,
    min_refs_total: 5,
    min_refs_satisfied_rate: 0.6
  });
  assert.equal(result.prime_sources.rows.length, 120);
  assert.deepEqual(result.field_contexts, {
    sensor: { label: 'Sensor' }
  });
});
