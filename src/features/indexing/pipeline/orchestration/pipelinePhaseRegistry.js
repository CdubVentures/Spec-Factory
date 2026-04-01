// WHY: Single source of truth for pipeline phase ordering.
// Zero domain knowledge — just imports and execution order.
// Adding a new phase = create phaseDescriptor.js in phase folder + add one entry here.

import { needSetPhase } from '../needSet/phaseDescriptor.js';
import { brandResolverPhase } from '../brandResolver/phaseDescriptor.js';
import { bootstrapPhase } from './bootstrapPhase.js';
import { searchProfilePhase } from '../searchProfile/phaseDescriptor.js';
import { searchPlannerPhase } from '../searchPlanner/phaseDescriptor.js';
import { queryJourneyPhase } from '../queryJourney/phaseDescriptor.js';
import { searchExecutionPhase } from '../searchExecution/phaseDescriptor.js';
import { resultProcessingPhase } from '../resultProcessing/phaseDescriptor.js';
import { domainClassifierPhase } from '../domainClassifier/phaseDescriptor.js';

export const PIPELINE_PHASES = [
  { id: 'discovery', parallel: [needSetPhase, brandResolverPhase], checkpoint: null },
  bootstrapPhase,
  searchProfilePhase,
  searchPlannerPhase,
  queryJourneyPhase,
  searchExecutionPhase,
  resultProcessingPhase,
  domainClassifierPhase,
];

// WHY: Stage sub-cursors are bridge concerns (lifecycle timing), not pipeline phases.
// They interleave after the pipeline phase that triggers them.
const STAGE_SUB_CURSORS = Object.freeze({
  'stage:brand-resolver': ['stage:search'],
  'stage:query-journey': ['stage:fetch'],
  'stage:search-results': ['stage:parse', 'stage:index'],
  'stage:serp-selector': ['stage:prime-sources'],
});

function buildPhaseOrder() {
  const order = ['stage:bootstrap'];
  for (const phase of PIPELINE_PHASES) {
    const cursors = phase.parallel
      ? phase.parallel.map((p) => p.stageCursor).filter(Boolean)
      : phase.stageCursor ? [phase.stageCursor] : [];
    for (const cursor of cursors) {
      order.push(cursor);
      const subs = STAGE_SUB_CURSORS[cursor];
      if (subs) order.push(...subs);
    }
  }
  order.push('stage:crawl');
  order.push('stage:finalize');
  return order;
}

export const PHASE_ORDER = buildPhaseOrder();
