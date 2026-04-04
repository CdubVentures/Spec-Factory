import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { SpecDb } from '../../../../db/specDb.js';
import { rebuildLlmRouteMatrixFromJson } from '../../llmRouteMatrixReseed.js';

function makeSpecDb(category = 'mouse') {
  return new SpecDb({ dbPath: ':memory:', category });
}

function makeTmpHelperRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-matrix-reseed-'));
  return root;
}

function writeMatrixJson(helperRoot, category, data) {
  const dir = path.join(helperRoot, category, '_control_plane');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'llm_route_matrix.json'), JSON.stringify(data, null, 2));
}

function sampleCustomRows(category) {
  return [
    {
      category,
      scope: 'field',
      route_key: 'custom-route-1',
      required_level: 'identity',
      difficulty: 'hard',
      availability: 'always',
      effort: 10,
      effort_band: 'xhigh',
      model_ladder_today: 'custom-model-x',
      max_tokens: 8192,
      single_source_data: true,
      all_source_data: false,
      enable_websearch: true,
      all_sources_confidence_repatch: false,
      llm_output_min_evidence_refs_required: 2,
      insufficient_evidence_action: 'flag',
      scalar_linked_send: 'all',
      component_values_send: 'all',
      list_values_send: 'all',
    },
    {
      category,
      scope: 'component',
      route_key: 'custom-route-2',
      required_level: 'critical',
      difficulty: 'medium',
      availability: 'common',
      effort: 7,
      effort_band: 'high',
      model_ladder_today: 'custom-model-y',
      max_tokens: 4096,
      single_source_data: false,
      all_source_data: true,
      enable_websearch: false,
      all_sources_confidence_repatch: true,
      llm_output_min_evidence_refs_required: 1,
      insufficient_evidence_action: 'accept',
      scalar_linked_send: 'none',
      component_values_send: 'none',
      list_values_send: 'none',
    },
  ];
}

test('rebuildLlmRouteMatrixFromJson imports custom rows from JSON', () => {
  const helperRoot = makeTmpHelperRoot();
  const specDb = makeSpecDb('mouse');
  const customRows = sampleCustomRows('mouse');
  writeMatrixJson(helperRoot, 'mouse', { rows: customRows });

  const result = rebuildLlmRouteMatrixFromJson({ specDb, helperRoot });
  assert.equal(result.reseeded, 2);

  const rows = specDb.getLlmRouteMatrix();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].model_ladder_today, 'custom-model-x');
  assert.equal(rows[1].model_ladder_today, 'custom-model-y');

  specDb.close();
  fs.rmSync(helperRoot, { recursive: true, force: true });
});

test('rebuildLlmRouteMatrixFromJson skips when JSON has empty rows', () => {
  const helperRoot = makeTmpHelperRoot();
  const specDb = makeSpecDb('mouse');
  writeMatrixJson(helperRoot, 'mouse', { rows: [] });

  const result = rebuildLlmRouteMatrixFromJson({ specDb, helperRoot });
  assert.equal(result.reseeded, 0);

  // Defaults should generate on first access
  const rows = specDb.getLlmRouteMatrix();
  assert.ok(rows.length > 0, 'defaults should auto-generate');
  assert.notEqual(rows[0].model_ladder_today, 'custom-model-x');

  specDb.close();
  fs.rmSync(helperRoot, { recursive: true, force: true });
});

test('rebuildLlmRouteMatrixFromJson skips when no JSON file exists', () => {
  const helperRoot = makeTmpHelperRoot();
  const specDb = makeSpecDb('mouse');

  const result = rebuildLlmRouteMatrixFromJson({ specDb, helperRoot });
  assert.equal(result.reseeded, 0);

  specDb.close();
  fs.rmSync(helperRoot, { recursive: true, force: true });
});

test('rebuildLlmRouteMatrixFromJson skips when helperRoot is falsy', () => {
  const specDb = makeSpecDb('mouse');
  assert.deepEqual(rebuildLlmRouteMatrixFromJson({ specDb, helperRoot: null }), { reseeded: 0 });
  assert.deepEqual(rebuildLlmRouteMatrixFromJson({ specDb, helperRoot: '' }), { reseeded: 0 });
  specDb.close();
});

test('hash-gated: skips reseed when file hash unchanged', () => {
  const helperRoot = makeTmpHelperRoot();
  const specDb = makeSpecDb('mouse');
  const customRows = sampleCustomRows('mouse');
  writeMatrixJson(helperRoot, 'mouse', { rows: customRows });

  const first = rebuildLlmRouteMatrixFromJson({ specDb, helperRoot });
  assert.equal(first.reseeded, 2);

  const second = rebuildLlmRouteMatrixFromJson({ specDb, helperRoot });
  assert.equal(second.reseeded, 0, 'should skip when hash unchanged');

  specDb.close();
  fs.rmSync(helperRoot, { recursive: true, force: true });
});

test('hash-gated: reseeds when file content changes', () => {
  const helperRoot = makeTmpHelperRoot();
  const specDb = makeSpecDb('mouse');
  const customRows = sampleCustomRows('mouse');
  writeMatrixJson(helperRoot, 'mouse', { rows: customRows });

  rebuildLlmRouteMatrixFromJson({ specDb, helperRoot });
  assert.equal(specDb.getLlmRouteMatrix().length, 2);

  writeMatrixJson(helperRoot, 'mouse', { rows: [customRows[0]] });
  const result = rebuildLlmRouteMatrixFromJson({ specDb, helperRoot });
  assert.equal(result.reseeded, 1);
  assert.equal(specDb.getLlmRouteMatrix().length, 1);

  specDb.close();
  fs.rmSync(helperRoot, { recursive: true, force: true });
});

test('empty rows JSON clears custom SQL rows and resets to defaults', () => {
  const helperRoot = makeTmpHelperRoot();
  const specDb = makeSpecDb('mouse');
  const customRows = sampleCustomRows('mouse');
  writeMatrixJson(helperRoot, 'mouse', { rows: customRows });
  rebuildLlmRouteMatrixFromJson({ specDb, helperRoot });
  assert.equal(specDb.getLlmRouteMatrix()[0].model_ladder_today, 'custom-model-x');

  writeMatrixJson(helperRoot, 'mouse', { rows: [] });
  const result = rebuildLlmRouteMatrixFromJson({ specDb, helperRoot });
  assert.equal(result.reseeded, 0);
  assert.equal(result.cleared, true, 'should report cleared');

  const rows = specDb.getLlmRouteMatrix();
  assert.ok(rows.length > 0, 'defaults should auto-generate on next access');
  assert.notEqual(rows[0].model_ladder_today, 'custom-model-x', 'custom model should be gone');

  specDb.close();
  fs.rmSync(helperRoot, { recursive: true, force: true });
});

test('round-trip: save custom rows → export → rebuild specDb → reseed → custom rows survive', () => {
  const helperRoot = makeTmpHelperRoot();
  const customRows = sampleCustomRows('mouse');

  // Phase 1: Save custom rows to first specDb + export to JSON
  const db1 = makeSpecDb('mouse');
  db1.saveLlmRouteMatrix(customRows);
  const saved = db1.getLlmRouteMatrix();
  writeMatrixJson(helperRoot, 'mouse', { rows: saved });
  db1.close();

  // Phase 2: Fresh specDb (simulates rebuild) + reseed from JSON
  const db2 = makeSpecDb('mouse');
  const result = rebuildLlmRouteMatrixFromJson({ specDb: db2, helperRoot });
  assert.equal(result.reseeded, saved.length);

  const rebuilt = db2.getLlmRouteMatrix();
  assert.equal(rebuilt.length, saved.length);
  assert.equal(rebuilt[0].model_ladder_today, 'custom-model-x');
  assert.equal(rebuilt[1].model_ladder_today, 'custom-model-y');
  assert.equal(rebuilt[0].max_tokens, 8192);
  assert.equal(rebuilt[1].max_tokens, 4096);

  db2.close();
  fs.rmSync(helperRoot, { recursive: true, force: true });
});
