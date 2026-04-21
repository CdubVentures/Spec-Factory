/**
 * pipelinePhaseClusters — pure derivation that picks the Pipeline-relevant
 * phases from LLM_PHASES (auto-gen registry). Each indexing-group phase
 * renders as its own badge (no sharedWith collapsing — the user explicitly
 * wants Needset / Search Planner / Brand Resolver / SERP Selector shown
 * individually).
 *
 * New phases added to pipeline groups in src/core/config/llmPhaseDefs.js
 * regenerate into LLM_PHASES and auto-appear here.
 */

import { uiPhaseIdToOverrideKey } from '../../llm-config/state/llmPhaseOverridesBridge.generated.ts';
import type { LlmOverridePhaseId } from '../../llm-config/types/llmPhaseOverrideTypes.generated.ts';
import type {
  LlmPhaseDefinition,
  LlmPhaseGroup,
  LlmPhaseId,
} from '../../llm-config/types/llmPhaseTypes.generated.ts';

// WHY: Pipeline = the indexing-group phases the crawler orchestrates.
// Publish (`validate`) and the global `writer` are intentionally NOT here —
// the user only wants the 4 indexing phases surfaced in the Pipeline header.
export const PIPELINE_GROUPS: readonly LlmPhaseGroup[] = ['indexing'] as const;

export interface PipelinePhaseCluster {
  readonly id: LlmPhaseId;
  readonly overrideKey: LlmOverridePhaseId;
  readonly label: string;
  readonly representative: LlmPhaseDefinition;
}

export function derivePipelinePhaseClusters(
  phases: readonly LlmPhaseDefinition[],
): readonly PipelinePhaseCluster[] {
  const clusters: PipelinePhaseCluster[] = [];
  for (const phase of phases) {
    if (!PIPELINE_GROUPS.includes(phase.group)) continue;
    const overrideKey = uiPhaseIdToOverrideKey(phase.id);
    if (!overrideKey) continue;
    clusters.push({
      id: phase.id,
      overrideKey,
      label: phase.label,
      representative: phase,
    });
  }
  return clusters;
}
