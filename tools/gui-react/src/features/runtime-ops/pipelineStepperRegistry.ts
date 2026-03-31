// WHY: Single source of truth mapping backend phase_cursor values to visual macro-stages.
// Adding a pipeline phase = add its cursor string to the correct stage's cursors array.
// Source of truth for cursor names: src/features/indexing/pipeline/orchestration/pipelinePhaseRegistry.js

export type StepperStageState = 'pending' | 'active' | 'done' | 'error';

export interface PipelineStepperStage {
  readonly key: string;
  readonly label: string;
  readonly cursors: readonly string[];
}

export const PIPELINE_STEPPER_STAGES: readonly PipelineStepperStage[] = [
  {
    key: 'boot',
    label: 'Boot',
    cursors: ['phase_00_bootstrap'],
  },
  {
    key: 'discover',
    label: 'Discover',
    cursors: ['phase_01_needset', 'phase_02_brand_resolver', 'phase_02_search'],
  },
  {
    key: 'plan',
    label: 'Plan',
    cursors: ['phase_03_search_profile', 'phase_04_search_planner'],
  },
  {
    key: 'search',
    label: 'Search',
    cursors: [
      'phase_05_query_journey', 'phase_05_fetch',
      'phase_06_search_results', 'phase_06_parse', 'phase_06_index',
    ],
  },
  {
    key: 'select',
    label: 'Select',
    cursors: ['phase_07_serp_selector', 'phase_07_prime_sources', 'phase_08_domain_classifier'],
  },
  {
    key: 'crawl',
    label: 'Crawl',
    cursors: ['phase_09_crawl'],
  },
  {
    key: 'finalize',
    label: 'Finalize',
    cursors: ['phase_10_finalize'],
  },
];

function buildCursorMap(stages: readonly PipelineStepperStage[]): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < stages.length; i++) {
    for (const cursor of stages[i].cursors) {
      map.set(cursor, i);
    }
  }
  return map;
}

const CURSOR_MAP = buildCursorMap(PIPELINE_STEPPER_STAGES);

export function cursorToStageIndex(cursor: string): number {
  if (!cursor) return -1;
  return CURSOR_MAP.get(cursor) ?? -1;
}

export function cursorSubProgress(cursor: string): {
  stageIndex: number;
  subPosition: number;
  subTotal: number;
} {
  const stageIndex = cursorToStageIndex(cursor);
  if (stageIndex < 0) return { stageIndex: -1, subPosition: 0, subTotal: 1 };
  const stage = PIPELINE_STEPPER_STAGES[stageIndex];
  const cursorPos = stage.cursors.indexOf(cursor);
  return {
    stageIndex,
    subPosition: Math.max(0, cursorPos),
    subTotal: stage.cursors.length,
  };
}

export function resolveStageState(
  stageIndex: number,
  activeStageIndex: number,
  isRunning: boolean,
  runStatus: string,
): StepperStageState {
  if (runStatus === 'completed') return 'done';
  if (runStatus === 'failed') {
    if (stageIndex < activeStageIndex) return 'done';
    if (stageIndex === activeStageIndex) return 'error';
    return 'pending';
  }
  if (activeStageIndex < 0) return 'pending';
  if (stageIndex < activeStageIndex) return 'done';
  if (stageIndex === activeStageIndex && isRunning) return 'active';
  return 'pending';
}
