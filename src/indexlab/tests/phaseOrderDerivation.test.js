// WHY: Contract test for PHASE_ORDER derivation from pipeline registry.
// Verifies the derived order matches the known 15-entry sequence and
// that the forward-only guard in setPhaseCursor still works.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_ORDER } from '../../features/indexing/pipeline/orchestration/pipelinePhaseRegistry.js';
import { setPhaseCursor } from '../runtimeBridgeStageLifecycle.js';

const EXPECTED_ORDER = [
  'phase_00_bootstrap',
  'phase_01_needset',
  'phase_02_brand_resolver', 'phase_02_search',
  'phase_03_search_profile',
  'phase_04_search_planner',
  'phase_05_query_journey', 'phase_05_fetch',
  'phase_06_search_results', 'phase_06_parse', 'phase_06_index',
  'phase_07_serp_selector', 'phase_07_prime_sources',
  'phase_08_domain_classifier',
  'phase_09_crawl',
];

describe('PHASE_ORDER derivation from pipeline registry', () => {
  it('derived order matches the canonical 15-entry sequence', () => {
    assert.deepEqual(PHASE_ORDER, EXPECTED_ORDER);
  });

  it('forward-only guard rejects backward cursor moves', () => {
    const state = { phaseCursor: 'phase_04_search_planner' };
    assert.equal(setPhaseCursor(state, 'phase_01_needset'), false,
      'must reject backward move');
    assert.equal(state.phaseCursor, 'phase_04_search_planner',
      'cursor must not change on rejected move');
  });

  it('forward-only guard accepts forward cursor moves', () => {
    const state = { phaseCursor: 'phase_04_search_planner' };
    assert.equal(setPhaseCursor(state, 'phase_07_serp_selector'), true);
    assert.equal(state.phaseCursor, 'phase_07_serp_selector');
  });

  it('stage sub-cursors are interleaved after their parent phase', () => {
    const brandIdx = PHASE_ORDER.indexOf('phase_02_brand_resolver');
    const searchIdx = PHASE_ORDER.indexOf('phase_02_search');
    assert.ok(searchIdx > brandIdx, 'phase_02_search must follow phase_02_brand_resolver');

    const journeyIdx = PHASE_ORDER.indexOf('phase_05_query_journey');
    const fetchIdx = PHASE_ORDER.indexOf('phase_05_fetch');
    assert.ok(fetchIdx > journeyIdx, 'phase_05_fetch must follow phase_05_query_journey');

    const resultsIdx = PHASE_ORDER.indexOf('phase_06_search_results');
    const parseIdx = PHASE_ORDER.indexOf('phase_06_parse');
    const indexIdx = PHASE_ORDER.indexOf('phase_06_index');
    assert.ok(parseIdx > resultsIdx, 'phase_06_parse must follow phase_06_search_results');
    assert.ok(indexIdx > parseIdx, 'phase_06_index must follow phase_06_parse');

    const serpIdx = PHASE_ORDER.indexOf('phase_07_serp_selector');
    const primeIdx = PHASE_ORDER.indexOf('phase_07_prime_sources');
    assert.ok(primeIdx > serpIdx, 'phase_07_prime_sources must follow phase_07_serp_selector');
  });
});
