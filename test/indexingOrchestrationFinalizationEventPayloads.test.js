import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinalizationEventPayloads } from '../src/features/indexing/orchestration/index.js';

test('buildFinalizationEventPayloads builds final needset/phase07/phase08/indexing-schema logger payloads', () => {
  const result = buildFinalizationEventPayloads({
    productId: 'mouse-product',
    runId: 'run_123',
    category: 'mouse',
    needSet: {
      total_fields: 40,
      identity: { state: 'locked' },
      summary: { total: 40, resolved: 36 },
      blockers: { missing: 2 },
      fields: [
        { field_key: 'weight_g', state: 'missing', need_score: 10 },
        { field_key: 'sensor', state: 'missing', need_score: 8 },
        { field_key: 'dpi', state: 'missing', need_score: 6 },
        { field_key: 'polling_rate', state: 'missing', need_score: 4 },
      ],
    },
    needSetRunKey: 'runs/r1/analysis/needset.json',
    phase07PrimeSources: {
      summary: {
        fields_attempted: 8,
        fields_with_hits: 6,
        fields_satisfied_min_refs: 5,
        refs_selected_total: 18,
        distinct_sources_selected: 9,
      },
      fields: [
        {
          field_key: 'weight_g',
          min_refs_required: 2,
          refs_selected: 2,
          min_refs_satisfied: true,
          distinct_sources_required: 2,
          distinct_sources_selected: 2,
          hits: [{ score: 0.77 }],
        },
      ],
    },
    phase07RunKey: 'runs/r1/analysis/phase07_retrieval.json',
    phase08Extraction: {
      summary: {
        batch_count: 2,
        batch_error_count: 1,
        schema_fail_rate: 0.4,
        raw_candidate_count: 10,
        accepted_candidate_count: 7,
        dangling_snippet_ref_count: 3,
        evidence_policy_violation_count: 1,
        min_refs_satisfied_count: 4,
        min_refs_total: 6,
      },
      field_contexts: {
        weight_g: {},
        battery_life: {},
      },
      prime_sources: {
        rows: [{}, {}, {}],
      },
    },
    phase08RunKey: 'runs/r1/analysis/phase08_extraction.json',
    indexingSchemaPackets: {
      sourceCollection: { source_packet_count: 11 },
    },
    sourcePacketsRunKey: 'runs/r1/analysis/source_indexing_extraction_packets.json',
    itemPacketRunKey: 'runs/r1/analysis/item_indexing_extraction_packet.json',
    runMetaPacketRunKey: 'runs/r1/analysis/run_meta_packet.json',
  });

  assert.equal(result.needsetComputedPayload.needset_size, 4);
  assert.equal(result.needsetComputedPayload.needset_key.endsWith('needset.json'), true);
  assert.equal(result.phase07PrimeSourcesBuiltPayload.fields_attempted, 8);
  assert.equal(result.phase07PrimeSourcesBuiltPayload.fields.length, 1);
  assert.equal(result.phase07PrimeSourcesBuiltPayload.fields[0].top_hit_score, 0.77);
  assert.equal(result.phase08ExtractionContextBuiltPayload.batch_count, 2);
  assert.equal(result.phase08ExtractionContextBuiltPayload.field_context_count, 2);
  assert.equal(result.phase08ExtractionContextBuiltPayload.prime_source_rows, 3);
  assert.equal(result.indexingSchemaPacketsWrittenPayload.source_packet_count, 11);
  assert.equal(result.indexingSchemaPacketsWrittenPayload.source_packets_key.endsWith('source_indexing_extraction_packets.json'), true);
});

test('buildFinalizationEventPayloads projects Schema 4 panel data when present on needSet', () => {
  const bundles = [
    { key: 'sensor_performance', label: 'Sensor & Performance', priority: 'core', phase: 'now', fields: [{ key: 'sensor', state: 'missing', bucket: 'core' }] },
  ];
  const profileInfluence = {
    manufacturer_html: 2, manual_pdf: 0, support_docs: 1,
    review_lookup: 0, benchmark_lookup: 0, fallback_web: 1, targeted_single: 0,
    duplicates_suppressed: 1, focused_bundles: 1, targeted_exceptions: 0,
    total_queries: 4, trusted_host_share: 3, docs_manual_share: 0,
  };
  const deltas = [{ field: 'sensor', from: 'missing', to: 'satisfied' }];
  const result = buildFinalizationEventPayloads({
    productId: 'mouse-product',
    runId: 'run_123',
    category: 'mouse',
    needSet: {
      total_fields: 40,
      identity: { state: 'locked' },
      summary: { total: 40, resolved: 36 },
      blockers: { missing: 2 },
      fields: [
        { field_key: 'weight_g', state: 'missing' },
      ],
      bundles,
      profile_influence: profileInfluence,
      deltas,
      round: 1,
      round_mode: 'followup',
      schema_version: 'needset_planner_output.v2',
    },
    needSetRunKey: 'runs/r1/analysis/needset.json',
    phase07PrimeSources: {},
    phase07RunKey: '',
    phase08Extraction: {},
    phase08RunKey: '',
    indexingSchemaPackets: {},
    sourcePacketsRunKey: '',
    itemPacketRunKey: '',
    runMetaPacketRunKey: '',
  });

  const payload = result.needsetComputedPayload;
  assert.deepEqual(payload.bundles, bundles);
  assert.deepEqual(payload.profile_influence, profileInfluence);
  assert.deepEqual(payload.deltas, deltas);
  assert.equal(payload.round, 1);
  assert.equal(payload.round_mode, 'followup');
  assert.equal(payload.schema_version, 'needset_planner_output.v2');
});

test('buildFinalizationEventPayloads defaults Schema 4 fields when absent from needSet', () => {
  const result = buildFinalizationEventPayloads({
    productId: 'mouse-product',
    runId: 'run_123',
    category: 'mouse',
    needSet: { fields: [] },
    needSetRunKey: 'runs/r1/analysis/needset.json',
    phase07PrimeSources: {},
    phase07RunKey: '',
    phase08Extraction: {},
    phase08RunKey: '',
    indexingSchemaPackets: {},
    sourcePacketsRunKey: '',
    itemPacketRunKey: '',
    runMetaPacketRunKey: '',
  });

  const payload = result.needsetComputedPayload;
  assert.deepEqual(payload.bundles, []);
  assert.equal(payload.profile_influence, null);
  assert.deepEqual(payload.deltas, []);
  assert.equal(payload.round, 0);
  assert.equal(payload.round_mode, 'seed');
  assert.equal(payload.schema_version, null);
});

test('buildFinalizationEventPayloads applies safe defaults for absent arrays and optional sections', () => {
  const result = buildFinalizationEventPayloads({
    productId: 'mouse-product',
    runId: 'run_123',
    category: 'mouse',
    needSet: {},
    needSetRunKey: 'runs/r1/analysis/needset.json',
    phase07PrimeSources: {},
    phase07RunKey: 'runs/r1/analysis/phase07_retrieval.json',
    phase08Extraction: {},
    phase08RunKey: 'runs/r1/analysis/phase08_extraction.json',
    indexingSchemaPackets: {},
    sourcePacketsRunKey: 'runs/r1/analysis/source_indexing_extraction_packets.json',
    itemPacketRunKey: 'runs/r1/analysis/item_indexing_extraction_packet.json',
    runMetaPacketRunKey: 'runs/r1/analysis/run_meta_packet.json',
  });

  assert.equal(result.needsetComputedPayload.needset_size, 0);
  assert.deepEqual(result.needsetComputedPayload.top_fields, []);
  assert.deepEqual(result.phase07PrimeSourcesBuiltPayload.fields, []);
  assert.equal(result.phase08ExtractionContextBuiltPayload.field_context_count, 0);
  assert.equal(result.phase08ExtractionContextBuiltPayload.prime_source_rows, 0);
  assert.equal(result.indexingSchemaPacketsWrittenPayload.source_packet_count, 0);
});
