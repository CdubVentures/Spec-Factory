import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PHASE_IDS, phaseFromMethod, sourceSurfaceFromMethod } from '../src/indexlab/indexingSchemaPackets.js';
import { loadBundledModule } from './helpers/loadBundledModule.js';

function createField({
  field = 'weight',
  method = '',
  confidence = 0,
  source_url = '',
} = {}) {
  return { field, value: 'v', method, confidence, source_url };
}

async function loadPhaseLineageHelpers() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/selectors/phaseLineageHelpers.ts', {
    prefix: 'phase-lineage-helpers-',
  });
}

describe('phase lineage helper contracts', () => {
  it('frontend phase registry stays aligned with backend phase ids and method routing', async () => {
    const { PHASE_REGISTRY, CROSS_CUTTING_METHODS } = await loadPhaseLineageHelpers();

    assert.deepEqual(PHASE_REGISTRY.map((phase) => phase.id), [...PHASE_IDS]);

    const methods = PHASE_REGISTRY.flatMap((phase) => phase.methods);
    assert.equal(methods.length, new Set(methods).size, 'phase methods should stay unique');
    assert.equal(CROSS_CUTTING_METHODS.length > 0, true, 'cross-cutting methods should be exported');

    for (const phase of PHASE_REGISTRY) {
      assert.equal(typeof phase.label, 'string');
      assert.equal(phase.label.trim().length > 0, true, `${phase.id} should expose a label`);
      for (const method of phase.methods) {
        if (method === 'adapter_api') {
          assert.equal(
            sourceSurfaceFromMethod(method),
            'network_json',
            'adapter_api should stay normalized onto the structured-meta source surface',
          );
          assert.equal(
            phase.id,
            'phase_05_embedded_json',
            'adapter_api should stay grouped under structured meta in the frontend lineage view',
          );
          continue;
        }

        assert.equal(
          phaseFromMethod(method),
          phase.id,
          `backend phaseFromMethod should resolve ${method} to ${phase.id}`,
        );
      }
    }
  });

  it('normalizes backend method aliases before bucketing fields', async () => {
    const { normalizePhaseMethod, computePhaseLineage } = await loadPhaseLineageHelpers();

    const cases = [
      ['spec_table_match', 'html_spec_table', 'phase_04_html_spec_table'],
      ['component_db_inference', 'static_dom', 'phase_01_static_html'],
      ['image_ocr_text', 'image_ocr', 'phase_08_image_ocr'],
      ['chart_script_config', 'chart_payload', 'phase_09_chart_graph'],
      ['readability', 'main_article', 'phase_03_main_article'],
      ['heuristic_fallback', 'main_article', 'phase_03_main_article'],
      ['article_text', 'main_article', 'phase_03_main_article'],
    ];

    for (const [input, normalized, phaseId] of cases) {
      assert.equal(normalizePhaseMethod(input), normalized);

      const phase = computePhaseLineage([
        createField({ method: input, confidence: 0.92, source_url: 'https://example.com/doc' }),
      ], []).find((row) => row.phase_id === phaseId);

      assert.equal(phase?.field_count, 1, `${input} should increment ${phaseId}`);
      assert.deepEqual(phase?.methods_used, [normalized]);
    }
  });

  it('aggregates counts, dedupes source urls, and isolates cross-cutting methods', async () => {
    const { computePhaseLineage } = await loadPhaseLineageHelpers();

    const result = computePhaseLineage([
      createField({ field: 'weight', method: 'json_ld', confidence: 0.8, source_url: 'https://a.com' }),
      createField({ field: 'dpi', method: 'embedded_state', confidence: 0.4, source_url: 'https://a.com' }),
      createField({ field: 'sensor', method: 'llm_extract', confidence: 0.95, source_url: 'https://a.com' }),
    ], []);

    const phase05 = result.find((row) => row.phase_id === 'phase_05_embedded_json');
    assert.equal(phase05?.field_count, 2);
    assert.equal(phase05?.doc_count, 1);
    assert.equal(phase05?.confidence_avg, 0.6);
    assert.deepEqual(phase05?.methods_used, ['embedded_state', 'json_ld']);

    const crossCutting = result.find((row) => row.phase_id === 'cross_cutting');
    assert.equal(crossCutting?.field_count, 1);
    assert.equal(crossCutting?.doc_count, 1);
    assert.deepEqual(crossCutting?.methods_used, ['llm_extract']);
    assert.equal(crossCutting?.phase_label, 'Post-Processing');
  });

  it('normalizes pre-existing lineage rows with backend aliases into canonical method lists', async () => {
    const { normalizePhaseLineagePhases } = await loadPhaseLineageHelpers();

    const [phase] = normalizePhaseLineagePhases([
      {
        phase_id: 'phase_03_main_article',
        phase_label: 'Article Text',
        doc_count: 1,
        field_count: 2,
        methods_used: ['readability', 'article_text', 'heuristic_fallback', 'main_article'],
        confidence_avg: 0.81,
      },
    ]);

    assert.deepEqual(phase.methods_used, ['main_article']);
    assert.equal(phase.field_count, 2);
    assert.equal(phase.doc_count, 1);
    assert.equal(phase.confidence_avg, 0.81);
  });
});
