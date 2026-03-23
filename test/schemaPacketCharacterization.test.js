/**
 * Characterization tests for indexingSchemaPackets.js helper functions.
 * Golden-master tests to lock current behavior before extraction.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// WHY: Import from the monolith. After extraction, these will come from
// the extracted modules via re-export — same import path, same behavior.
import {
  PHASE_IDS,
  phaseFromMethod,
  sourceSurfaceFromMethod,
  buildIndexingSchemaPackets,
} from '../src/indexlab/indexingSchemaPackets.js';

// ---------------------------------------------------------------------------
// PHASE_IDS
// ---------------------------------------------------------------------------

test('PHASE_IDS has 10 entries', () => {
  assert.equal(PHASE_IDS.length, 10);
});

test('PHASE_IDS first and last entries', () => {
  assert.equal(PHASE_IDS[0], 'phase_01_static_html');
  assert.equal(PHASE_IDS[9], 'phase_10_office_mixed_doc');
});

// ---------------------------------------------------------------------------
// phaseFromMethod
// ---------------------------------------------------------------------------

test('phaseFromMethod — empty/null defaults to phase_01', () => {
  assert.equal(phaseFromMethod(''), 'phase_01_static_html');
  assert.equal(phaseFromMethod(null), 'phase_01_static_html');
  assert.equal(phaseFromMethod(undefined), 'phase_01_static_html');
});

test('phaseFromMethod — html_spec_table → phase_04', () => {
  assert.equal(phaseFromMethod('html_spec_table'), 'phase_04_html_spec_table');
});

test('phaseFromMethod — json_ld → phase_05', () => {
  assert.equal(phaseFromMethod('json_ld'), 'phase_05_embedded_json');
});

test('phaseFromMethod — article → phase_03', () => {
  assert.equal(phaseFromMethod('article'), 'phase_03_main_article');
});

test('phaseFromMethod — pdf → phase_06', () => {
  assert.equal(phaseFromMethod('pdf'), 'phase_06_text_pdf');
});

test('phaseFromMethod — scanned_pdf_ocr → phase_07 (before generic pdf)', () => {
  assert.equal(phaseFromMethod('scanned_pdf_ocr'), 'phase_07_scanned_pdf_ocr');
});

test('phaseFromMethod — screenshot → phase_08', () => {
  assert.equal(phaseFromMethod('screenshot'), 'phase_08_image_ocr');
});

test('phaseFromMethod — graphql → phase_02', () => {
  assert.equal(phaseFromMethod('graphql'), 'phase_02_dynamic_js');
});

// ---------------------------------------------------------------------------
// sourceSurfaceFromMethod
// ---------------------------------------------------------------------------

test('sourceSurfaceFromMethod — empty defaults to static_dom', () => {
  assert.equal(sourceSurfaceFromMethod(''), 'static_dom');
});

test('sourceSurfaceFromMethod — ldjson → json_ld', () => {
  assert.equal(sourceSurfaceFromMethod('ldjson'), 'json_ld');
});

test('sourceSurfaceFromMethod — network_json → network_json', () => {
  assert.equal(sourceSurfaceFromMethod('network_json'), 'network_json');
});

test('sourceSurfaceFromMethod — article → main_article', () => {
  assert.equal(sourceSurfaceFromMethod('article'), 'main_article');
});

test('sourceSurfaceFromMethod — html_table → html_spec_table', () => {
  assert.equal(sourceSurfaceFromMethod('html_table'), 'html_spec_table');
});

test('sourceSurfaceFromMethod — pdf → pdf_text', () => {
  assert.equal(sourceSurfaceFromMethod('pdf'), 'pdf_text');
});

// ---------------------------------------------------------------------------
// buildIndexingSchemaPackets — golden master (minimal input → output shape)
// ---------------------------------------------------------------------------

function makeMinimalInput() {
  return {
    runId: 'run-char-001',
    category: 'mouse',
    productId: 'mouse-test',
    startMs: Date.now() - 5000,
    summary: {
      validated: false,
      validated_reason: 'BELOW_CONFIDENCE_THRESHOLD',
      confidence: 0.3,
      total_fields: 10,
      resolved_fields: 3,
    },
    categoryConfig: {
      category: 'mouse',
      fieldOrder: ['dpi', 'weight', 'sensor'],
      schema: { critical_fields: ['sensor'] },
      requiredFields: ['dpi', 'weight'],
    },
    sourceResults: [],
    normalized: { dpi: '26000', weight: '54g' },
    provenance: {},
    needSet: { fields: [] },
    phase08Extraction: null,
  };
}

test('buildIndexingSchemaPackets — returns sourceCollection, itemPacket, runMetaPacket', () => {
  const result = buildIndexingSchemaPackets(makeMinimalInput());
  assert.ok(result.sourceCollection, 'has sourceCollection');
  assert.ok(result.itemPacket, 'has itemPacket');
  assert.ok(result.runMetaPacket, 'has runMetaPacket');
});

test('buildIndexingSchemaPackets — sourceCollection has schema_version and packets', () => {
  const result = buildIndexingSchemaPackets(makeMinimalInput());
  assert.equal(result.sourceCollection.schema_version, '2026-02-20.source-indexing-extraction-packet.collection.v1');
  assert.ok(Array.isArray(result.sourceCollection.packets));
});

test('buildIndexingSchemaPackets — itemPacket has item_packet_id and field_key_map', () => {
  const result = buildIndexingSchemaPackets(makeMinimalInput());
  assert.ok(result.itemPacket.item_packet_id, 'has item_packet_id');
  assert.ok(result.itemPacket.field_key_map, 'has field_key_map');
});

test('buildIndexingSchemaPackets — runMetaPacket has quality_gates', () => {
  const result = buildIndexingSchemaPackets(makeMinimalInput());
  assert.ok(result.runMetaPacket.quality_gates, 'has quality_gates');
  assert.ok('coverage_gate_passed' in result.runMetaPacket.quality_gates);
  assert.ok('error_rate_gate_passed' in result.runMetaPacket.quality_gates);
  assert.ok('evidence_gate_passed' in result.runMetaPacket.quality_gates);
});

test('buildIndexingSchemaPackets — with one source, produces source packet', () => {
  const input = makeMinimalInput();
  input.sourceResults = [{
    url: 'https://razer.com/viper',
    host: 'razer.com',
    status: 200,
    candidates: [{ field: 'dpi', value: '26000', method: 'dom', confidence: 0.9 }],
    fieldCandidates: [{ field: 'dpi', value: '26000', method: 'dom', confidence: 0.9, evidenceRefs: ['s1'] }],
    identity: { match: true, score: 0.95 },
    tier: 1,
  }];
  const result = buildIndexingSchemaPackets(input);
  assert.equal(result.sourceCollection.packets.length, 1);
  assert.ok(result.sourceCollection.packets[0].source_packet_id);
});
