/**
 * PipelinePhaseBadges — renders one FinderRunModelBadge per Pipeline-phase
 * cluster. Data-driven via `derivePipelinePhaseClusters(LLM_PHASES)` —
 * new phases added to pipeline groups (indexing / publish / writer) in
 * src/core/config/llmPhaseDefs.js regenerate into LLM_PHASES and auto-appear
 * here without editing this component.
 */

import { useMemo } from 'react';
import { LLM_PHASES } from '../../llm-config/state/llmPhaseRegistry.generated.ts';
import { FinderRunModelBadge, useResolvedFinderModel } from '../../../shared/ui/finder/index.ts';
import {
  derivePipelinePhaseClusters,
  type PipelinePhaseCluster,
} from './pipelinePhaseClusters.ts';

function PhaseBadge({ cluster }: { cluster: PipelinePhaseCluster }) {
  const { modelDisplay, accessMode, effortLevel, model } = useResolvedFinderModel(cluster.overrideKey);
  return (
    <FinderRunModelBadge
      labelPrefix={cluster.label}
      model={modelDisplay}
      accessMode={accessMode}
      thinking={model?.thinking ?? false}
      webSearch={model?.webSearch ?? false}
      effortLevel={effortLevel}
    />
  );
}

export function PipelinePhaseBadges() {
  const clusters = useMemo(() => derivePipelinePhaseClusters(LLM_PHASES), []);
  if (clusters.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {clusters.map((c) => (
        <PhaseBadge key={c.id} cluster={c} />
      ))}
    </div>
  );
}
