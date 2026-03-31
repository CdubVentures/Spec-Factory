import { describe, it } from 'node:test';
import { strictEqual, deepStrictEqual } from 'node:assert';
import {
  PIPELINE_STEPPER_STAGES,
  cursorToStageIndex,
  cursorSubProgress,
  resolveStageState,
} from '../pipelineStepperRegistry.ts';
import type { StepperStageState } from '../pipelineStepperRegistry.ts';

// WHY: Table-driven tests ensure every backend phase_cursor maps to exactly one macro-stage.
// Source of truth: src/features/indexing/pipeline/orchestration/pipelinePhaseRegistry.js

const CURSOR_TO_STAGE_TABLE: [string, number][] = [
  // Boot (index 0)
  ['phase_00_bootstrap', 0],
  // Discover (index 1)
  ['phase_01_needset', 1],
  ['phase_02_brand_resolver', 1],
  ['phase_02_search', 1],
  // Plan (index 2)
  ['phase_03_search_profile', 2],
  ['phase_04_search_planner', 2],
  // Search (index 3)
  ['phase_05_query_journey', 3],
  ['phase_05_fetch', 3],
  ['phase_06_search_results', 3],
  ['phase_06_parse', 3],
  ['phase_06_index', 3],
  // Select (index 4)
  ['phase_07_serp_selector', 4],
  ['phase_07_prime_sources', 4],
  ['phase_08_domain_classifier', 4],
  // Crawl (index 5)
  ['phase_09_crawl', 5],
  // Finalize (index 6)
  ['phase_10_finalize', 6],
];

describe('PIPELINE_STEPPER_STAGES', () => {
  it('contains exactly 7 macro-stages', () => {
    strictEqual(PIPELINE_STEPPER_STAGES.length, 7);
  });

  it('stage keys are unique', () => {
    const keys = PIPELINE_STEPPER_STAGES.map((s) => s.key);
    strictEqual(new Set(keys).size, keys.length);
  });

  it('every stage has a non-empty label', () => {
    for (const stage of PIPELINE_STEPPER_STAGES) {
      strictEqual(typeof stage.label, 'string');
      strictEqual(stage.label.length > 0, true, `stage "${stage.key}" has empty label`);
    }
  });

  it('every stage has at least one cursor', () => {
    for (const stage of PIPELINE_STEPPER_STAGES) {
      strictEqual(stage.cursors.length > 0, true, `stage "${stage.key}" has no cursors`);
    }
  });

  it('no cursor appears in more than one stage', () => {
    const seen = new Map<string, string>();
    for (const stage of PIPELINE_STEPPER_STAGES) {
      for (const cursor of stage.cursors) {
        const existing = seen.get(cursor);
        strictEqual(existing, undefined, `cursor "${cursor}" in both "${existing}" and "${stage.key}"`);
        seen.set(cursor, stage.key);
      }
    }
  });
});

describe('cursorToStageIndex', () => {
  for (const [cursor, expectedIndex] of CURSOR_TO_STAGE_TABLE) {
    it(`"${cursor}" → stage ${expectedIndex} (${PIPELINE_STEPPER_STAGES[expectedIndex]?.key})`, () => {
      strictEqual(cursorToStageIndex(cursor), expectedIndex);
    });
  }

  it('empty string → -1', () => {
    strictEqual(cursorToStageIndex(''), -1);
  });

  it('unknown cursor → -1 (no silent fallback)', () => {
    strictEqual(cursorToStageIndex('phase_99_unknown'), -1);
  });

  it('"completed" is a status not a cursor → -1', () => {
    strictEqual(cursorToStageIndex('completed'), -1);
  });
});

describe('cursorSubProgress', () => {
  it('Boot has 1 cursor → position 0, total 1', () => {
    deepStrictEqual(cursorSubProgress('phase_00_bootstrap'), {
      stageIndex: 0,
      subPosition: 0,
      subTotal: 1,
    });
  });

  it('Plan first cursor → position 0, total 2', () => {
    deepStrictEqual(cursorSubProgress('phase_03_search_profile'), {
      stageIndex: 2,
      subPosition: 0,
      subTotal: 2,
    });
  });

  it('Plan second cursor → position 1, total 2', () => {
    deepStrictEqual(cursorSubProgress('phase_04_search_planner'), {
      stageIndex: 2,
      subPosition: 1,
      subTotal: 2,
    });
  });

  it('Search middle cursor → position 2, total 5', () => {
    deepStrictEqual(cursorSubProgress('phase_06_search_results'), {
      stageIndex: 3,
      subPosition: 2,
      subTotal: 5,
    });
  });

  it('Select last cursor → position 2, total 3', () => {
    deepStrictEqual(cursorSubProgress('phase_08_domain_classifier'), {
      stageIndex: 4,
      subPosition: 2,
      subTotal: 3,
    });
  });

  it('Finalize has 1 cursor → position 0, total 1', () => {
    deepStrictEqual(cursorSubProgress('phase_10_finalize'), {
      stageIndex: 6,
      subPosition: 0,
      subTotal: 1,
    });
  });

  it('empty cursor → stageIndex -1', () => {
    deepStrictEqual(cursorSubProgress(''), {
      stageIndex: -1,
      subPosition: 0,
      subTotal: 1,
    });
  });

  it('unknown cursor → stageIndex -1', () => {
    deepStrictEqual(cursorSubProgress('phase_99_bogus'), {
      stageIndex: -1,
      subPosition: 0,
      subTotal: 1,
    });
  });
});

describe('resolveStageState', () => {
  describe('running pipeline', () => {
    it('stage before active → done', () => {
      strictEqual(resolveStageState(0, 3, true, 'running'), 'done' as StepperStageState);
    });

    it('stage at active → active', () => {
      strictEqual(resolveStageState(3, 3, true, 'running'), 'active' as StepperStageState);
    });

    it('stage after active → pending', () => {
      strictEqual(resolveStageState(5, 3, true, 'running'), 'pending' as StepperStageState);
    });
  });

  describe('completed pipeline', () => {
    it('all stages are done regardless of index', () => {
      for (let i = 0; i < 7; i++) {
        strictEqual(resolveStageState(i, 6, false, 'completed'), 'done' as StepperStageState,
          `stage ${i} should be done when run is completed`);
      }
    });
  });

  describe('failed pipeline', () => {
    it('stage before failure → done', () => {
      strictEqual(resolveStageState(1, 3, false, 'failed'), 'done' as StepperStageState);
    });

    it('stage at failure → error', () => {
      strictEqual(resolveStageState(3, 3, false, 'failed'), 'error' as StepperStageState);
    });

    it('stage after failure → pending', () => {
      strictEqual(resolveStageState(4, 3, false, 'failed'), 'pending' as StepperStageState);
    });
  });

  describe('idle (no run selected)', () => {
    it('all stages pending when activeIdx is -1', () => {
      for (let i = 0; i < 7; i++) {
        strictEqual(resolveStageState(i, -1, false, ''), 'pending' as StepperStageState,
          `stage ${i} should be pending when idle`);
      }
    });
  });
});
