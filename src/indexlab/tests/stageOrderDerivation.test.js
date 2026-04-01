// WHY: Contract test for PHASE_ORDER derivation from pipeline registry.
// Verifies the derived order matches the known 15-entry sequence and
// that the forward-only guard in setStageCursor still works.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE_ORDER } from '../../features/indexing/pipeline/orchestration/pipelinePhaseRegistry.js';
import { setStageCursor } from '../runtimeBridgeStageLifecycle.js';

const EXPECTED_ORDER = [
  'stage:bootstrap',
  'stage:needset',
  'stage:brand-resolver', 'stage:search',
  'stage:search-profile',
  'stage:search-planner',
  'stage:query-journey', 'stage:fetch',
  'stage:search-results', 'stage:parse', 'stage:index',
  'stage:serp-selector', 'stage:prime-sources',
  'stage:domain-classifier',
  'stage:crawl',
  'stage:finalize',
];

describe('PHASE_ORDER derivation from pipeline registry', () => {
  it('derived order matches the canonical 16-entry sequence', () => {
    assert.deepEqual(PHASE_ORDER, EXPECTED_ORDER);
  });

  it('forward-only guard rejects backward cursor moves', () => {
    const state = { stageCursor: 'stage:search-planner' };
    assert.equal(setStageCursor(state, 'stage:needset'), false,
      'must reject backward move');
    assert.equal(state.stageCursor, 'stage:search-planner',
      'cursor must not change on rejected move');
  });

  it('forward-only guard accepts forward cursor moves', () => {
    const state = { stageCursor: 'stage:search-planner' };
    assert.equal(setStageCursor(state, 'stage:serp-selector'), true);
    assert.equal(state.stageCursor, 'stage:serp-selector');
  });

  it('stage sub-cursors are interleaved after their parent phase', () => {
    const brandIdx = PHASE_ORDER.indexOf('stage:brand-resolver');
    const searchIdx = PHASE_ORDER.indexOf('stage:search');
    assert.ok(searchIdx > brandIdx, 'stage:search must follow stage:brand-resolver');

    const journeyIdx = PHASE_ORDER.indexOf('stage:query-journey');
    const fetchIdx = PHASE_ORDER.indexOf('stage:fetch');
    assert.ok(fetchIdx > journeyIdx, 'stage:fetch must follow stage:query-journey');

    const resultsIdx = PHASE_ORDER.indexOf('stage:search-results');
    const parseIdx = PHASE_ORDER.indexOf('stage:parse');
    const indexIdx = PHASE_ORDER.indexOf('stage:index');
    assert.ok(parseIdx > resultsIdx, 'stage:parse must follow stage:search-results');
    assert.ok(indexIdx > parseIdx, 'stage:index must follow stage:parse');

    const serpIdx = PHASE_ORDER.indexOf('stage:serp-selector');
    const primeIdx = PHASE_ORDER.indexOf('stage:prime-sources');
    assert.ok(primeIdx > serpIdx, 'stage:prime-sources must follow stage:serp-selector');
  });
});
