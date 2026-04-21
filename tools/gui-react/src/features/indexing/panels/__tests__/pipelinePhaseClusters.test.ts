import { describe, it } from 'node:test';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import {
  derivePipelinePhaseClusters,
  PIPELINE_GROUPS,
} from '../pipelinePhaseClusters.ts';
import { LLM_PHASES } from '../../../llm-config/state/llmPhaseRegistry.generated.ts';

describe('derivePipelinePhaseClusters', () => {
  it('produces one entry per indexing-group phase, labeled by phase name', () => {
    const entries = derivePipelinePhaseClusters(LLM_PHASES);
    const labels = entries.map((e) => e.label).sort();
    // Baseline snapshot from llmPhaseDefs. If a new indexing-group phase is
    // added (e.g. `extract-review`) append its label here.
    deepStrictEqual(labels, ['Brand Resolver', 'Needset', 'SERP Selector', 'Search Planner']);
  });

  it('skips non-pipeline groups (discovery / publish / writer / global)', () => {
    const entries = derivePipelinePhaseClusters(LLM_PHASES);
    for (const e of entries) {
      ok(
        PIPELINE_GROUPS.includes(e.representative.group),
        `entry ${e.id} has non-pipeline group ${e.representative.group}`,
      );
    }
  });

  it('returns empty array for empty input', () => {
    strictEqual(derivePipelinePhaseClusters([]).length, 0);
  });
});
